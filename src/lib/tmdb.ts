import type { Meta, SearchHit } from './types';

const API = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p/w342';

export class HttpError extends Error {
  constructor(public status: number) {
    super(`HTTP ${status}`);
  }
}

/** Accepts either a v3 API key (32 hex chars) or a v4 read access token (long JWT). */
async function get<T>(key: string, path: string, params: Record<string, string> = {}, signal?: AbortSignal): Promise<T> {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const headers: Record<string, string> = { accept: 'application/json' };
  if (key.length > 40) headers.Authorization = `Bearer ${key}`;
  else url.searchParams.set('api_key', key);
  const res = await fetch(url, { headers, signal });
  if (!res.ok) throw new HttpError(res.status);
  return res.json() as Promise<T>;
}

const poster = (p?: string | null) => (p ? IMG + p : undefined);
const year = (d?: string) => (d ?? '').slice(0, 4);

type Named = { name: string };
type MovieHit = { id: number; title: string; release_date?: string; poster_path?: string | null };
type TvHit = { id: number; name: string; first_air_date?: string; poster_path?: string | null };

export async function searchMovies(key: string, query: string, signal?: AbortSignal): Promise<SearchHit[]> {
  const d = await get<{ results: MovieHit[] }>(key, '/search/movie', { query, include_adult: 'false' }, signal);
  return d.results.map((r) => ({ id: r.id, title: r.title, year: year(r.release_date), img: poster(r.poster_path) }));
}

export async function searchTv(key: string, query: string, signal?: AbortSignal): Promise<SearchHit[]> {
  const d = await get<{ results: TvHit[] }>(key, '/search/tv', { query, include_adult: 'false' }, signal);
  return d.results.map((r) => ({ id: r.id, title: r.name, year: year(r.first_air_date), img: poster(r.poster_path) }));
}

export async function movieDetails(key: string, id: number): Promise<Partial<Meta>> {
  const d = await get<MovieHit & { runtime?: number; genres?: Named[]; credits?: { crew?: { job: string; name: string }[] } }>(
    key, `/movie/${id}`, { append_to_response: 'credits' },
  );
  const directors = (d.credits?.crew ?? []).filter((c) => c.job === 'Director').map((c) => c.name).slice(0, 2);
  return {
    title: d.title,
    year: year(d.release_date),
    img: poster(d.poster_path),
    director: directors.join(' & ') || undefined,
    genres: (d.genres ?? []).map((g) => g.name),
    runtime: d.runtime || undefined,
    full: true,
  };
}

type TvSeason = { season_number: number; name?: string; episode_count: number; air_date?: string; poster_path?: string | null };

export async function tvDetails(key: string, id: number): Promise<Partial<Meta>> {
  const d = await get<TvHit & { genres?: Named[]; episode_run_time?: number[]; seasons?: TvSeason[] }>(key, `/tv/${id}`);
  const seasons = (d.seasons ?? [])
    .filter((s) => s.episode_count > 0)
    .map((s) => ({
      n: s.season_number,
      name: s.name || `Season ${s.season_number}`,
      episodes: s.episode_count,
      year: year(s.air_date),
      img: poster(s.poster_path),
    }))
    // Specials (season 0) go last.
    .sort((a, b) => (a.n || 999) - (b.n || 999));
  return {
    title: d.name,
    year: year(d.first_air_date),
    img: poster(d.poster_path),
    genres: (d.genres ?? []).map((g) => g.name),
    epRuntime: d.episode_run_time?.[0] || undefined,
    seasons,
    full: true,
  };
}

export async function verifyKey(key: string) {
  await get(key, '/configuration');
}
