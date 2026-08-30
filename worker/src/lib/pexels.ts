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
export async function searchPexels(apiKey: string, query: string): Promise<PexelsPhoto[]> {
  const url = new URL('https://api.pexels.com/v1/search');
  url.searchParams.set('query', query.slice(0, 120));
  url.searchParams.set('orientation', 'portrait');
  url.searchParams.set('size', 'large');
  url.searchParams.set('per_page', '12');

  const response = await fetch(url, { headers: { Authorization: apiKey } });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Pexels search failed (${response.status}): ${message.slice(0, 300)}`);
  }
  const data = (await response.json()) as SearchResponse;
  return Array.isArray(data.photos) ? data.photos : [];
}

