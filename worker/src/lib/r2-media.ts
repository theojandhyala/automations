/** Migration target: private R2 objects served through the existing owned URL. */
export function validMediaPath(path: string): boolean {
  return /^(outputs|features)\/[A-Za-z0-9._/-]+$/.test(path)
    && !path.includes('..') && !path.includes('//');
}

/** Refuse to overwrite an existing export: signed reviews refer to exact bytes. */
export async function putR2Media(bucket: R2Bucket, path: string, bytes: Uint8Array, contentType: string): Promise<string> {
  if (!validMediaPath(path)) throw new Error('Invalid media path');
  if (!/^(image|video)\//.test(contentType)) throw new Error('Expected image or video media');
  const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
  const saved = await bucket.put(path, bytes, {
    onlyIf: new Headers({ 'If-None-Match': '*' }),
    httpMetadata: { contentType, cacheControl: 'public, max-age=31536000, immutable' },
    customMetadata: { sha256 },
  });
  if (!saved) {
    const existing = await bucket.head(path);
    if (existing?.customMetadata?.sha256 !== sha256 || existing.httpMetadata?.contentType !== contentType)
      throw new Error('Media already exists with different bytes or content type');
  }
  return sha256;
}

function requestedRange(value: string, size: number): { offset: number; length: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2]) || size === 0) return null;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null;
    const length = Math.min(size, suffix);
    return { offset: size - length, length };
  }
  const offset = Number(match[1]);
  const end = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(end) || offset >= size || end < offset) return null;
  return { offset, length: Math.min(size - 1, end) - offset + 1 };
}

export async function streamR2Media(bucket: R2Bucket, path: string, req: Request): Promise<Response> {
  if (!validMediaPath(path)) return new Response('not found', { status: 404 });
  if (!['GET', 'HEAD'].includes(req.method)) return new Response('method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  const metadata = await bucket.head(path);
  if (!metadata) return new Response('not found', { status: 404 });
  const headers = new Headers();
  metadata.writeHttpMetadata(headers);
  headers.set('ETag', metadata.httpEtag);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Content-Length', String(metadata.size));
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('X-Content-Type-Options', 'nosniff');
  const ifNoneMatch = req.headers.get('If-None-Match');
  if (ifNoneMatch === '*' || ifNoneMatch?.split(',').some(tag => tag.trim().replace(/^W\//, '') === metadata.httpEtag)) {
    headers.delete('Content-Length');
    return new Response(null, { status: 304, headers });
  }
  if (req.method === 'HEAD') return new Response(null, { headers });
  const ifRange = req.headers.get('If-Range');
  const rangeHeader = !ifRange || ifRange === metadata.httpEtag ? req.headers.get('Range') : null;
  const range = rangeHeader ? requestedRange(rangeHeader, metadata.size) : undefined;
  if (range === null) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${metadata.size}` } });
  const object = await bucket.get(path, { onlyIf: { etagMatches: metadata.etag }, ...(range ? { range } : {}) });
  if (!object || !('body' in object)) return new Response('media changed; retry', { status: 409 });
  if (range) {
    headers.set('Content-Length', String(range.length));
    headers.set('Content-Range', `bytes ${range.offset}-${range.offset + range.length - 1}/${metadata.size}`);
  }
  return new Response(object.body, { status: range ? 206 : 200, headers });
}
