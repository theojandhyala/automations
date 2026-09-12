export interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  url: string;
  photographer: string;
  photographer_url: string;
  alt: string;
  src: {
    original: string;
    portrait: string;
    large2x: string;
  };
}

interface SearchResponse {
  photos?: PexelsPhoto[];
}

/** Finds portrait-oriented real stock while retaining full source provenance. */
export async function searchPexels(apiKey: string, query: string, page = 1): Promise<PexelsPhoto[]> {
  const url = new URL('https://api.pexels.com/v1/search');
  url.searchParams.set('query', query.slice(0, 120));
  url.searchParams.set('orientation', 'portrait');
  url.searchParams.set('size', 'large');
  url.searchParams.set('per_page', '40');
  url.searchParams.set('page', String(Math.max(1, Math.min(page, 3))));

  const response = await fetch(url, { headers: { Authorization: apiKey }, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Pexels search failed (${response.status}): ${message.slice(0, 300)}`);
  }
  const data = (await response.json()) as SearchResponse;
  return Array.isArray(data.photos) ? data.photos : [];
}

/** Retrieve an explicitly selected licensed source without inventing an image URL. */
export async function getPexelsPhoto(apiKey: string, id: number): Promise<PexelsPhoto> {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Select a valid Pexels photo ID.');
  const response = await fetch(`https://api.pexels.com/v1/photos/${id}`, {headers:{Authorization:apiKey},signal:AbortSignal.timeout(15_000)});
  if (!response.ok) throw new Error(`Selected Pexels photo unavailable (${response.status}).`);
  const photo = await response.json() as PexelsPhoto;
  if (photo.id !== id || !photo.url?.startsWith('https://www.pexels.com/') || !photo.src?.original?.startsWith('https://images.pexels.com/')) throw new Error('Selected photo returned invalid source provenance.');
  return photo;
}
