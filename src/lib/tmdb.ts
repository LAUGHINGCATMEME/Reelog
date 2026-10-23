import type { Movie } from './types';

const API = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p/w342';

/** Accepts either a v3 API key (32 hex chars) or a v4 read access token (long JWT). */
async function get<T>(path: string, key: string, params: Record<string, string> = {}, signal?: AbortSignal): Promise<T> {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const bearer = key.length > 40;
  if (!bearer) url.searchParams.set('api_key', key);
  const res = await fetch(url, {
    signal,
    headers: bearer ? { Authorization: `Bearer ${key}`, accept: 'application/json' } : { accept: 'application/json' },
  });
  if (res.status === 401) throw new Error('TMDB rejected the API key.');
  if (!res.ok) throw new Error(`TMDB error ${res.status}`);
  return res.json() as Promise<T>;
}

type SearchResult = { id: number; title: string; release_date?: string; poster_path?: string | null };
type Details = SearchResult & {
  runtime?: number;
  genres?: { name: string }[];
  credits?: { crew?: { job: string; name: string }[] };
};

const poster = (p?: string | null) => (p ? IMG + p : undefined);
const year = (d?: string) => (d ? d.slice(0, 4) : '');

export async function searchMovies(query: string, key: string, signal?: AbortSignal): Promise<Movie[]> {
  const data = await get<{ results: SearchResult[] }>(
    '/search/movie',
    key,
    { query, include_adult: 'false', page: '1' },
    signal,
  );
  return data.results.map((r) => ({
    id: r.id,
    title: r.title,
    year: year(r.release_date),
    image: poster(r.poster_path),
    genres: [],
  }));
}

export async function movieDetails(id: number, key: string): Promise<Movie> {
  const d = await get<Details>(`/movie/${id}`, key, { append_to_response: 'credits' });
  const directors = (d.credits?.crew ?? []).filter((c) => c.job === 'Director').map((c) => c.name);
  return {
    id: d.id,
    title: d.title,
    year: year(d.release_date),
    runtime: d.runtime || undefined,
    director: directors.join(' & ') || undefined,
    genres: (d.genres ?? []).map((g) => g.name),
    image: poster(d.poster_path),
    detailed: true,
  };
}

/** Cheap call to check a key works. */
export async function verifyKey(key: string) {
  await get('/configuration', key);
}
