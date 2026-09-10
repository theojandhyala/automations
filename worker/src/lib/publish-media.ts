import type { Artifact, Env } from '../types';
import { streamMedia } from './storage';

/** Check the exact final URLs. Never let a SPA fallback pass as an image. */
export async function verifyPublishMedia(env: Env, artifact: Pick<Artifact, 'media_type' | 'photo_urls' | 'video_url'>): Promise<void> {
  const urls = artifact.media_type === 'photo' ? artifact.photo_urls : [artifact.video_url];
  for (const value of urls) {
    if (!value) throw new Error('Final media URL is missing');
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.origin !== new URL(env.PUBLIC_BASE_URL).origin || !url.pathname.startsWith('/media/outputs/')) {
      throw new Error('Final media must use the configured owned HTTPS media domain');
    }
    // Calling our own workers.dev URL with global fetch bypasses this Worker's
    // media handler. Use the same handler as public GET/HEAD instead.
    const response = await streamMedia(env, url.pathname.slice('/media/'.length),
      new Request(url, { method: 'HEAD', signal: AbortSignal.timeout(12_000) }));
    const contentType = response.headers.get('content-type') ?? '';
    if (!response.ok || !contentType.startsWith(artifact.media_type === 'photo' ? 'image/' : 'video/')) {
      throw new Error(`Final media check failed (${response.status}, ${contentType})`);
    }
  }
}
