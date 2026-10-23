import { isNative } from './native';
import { HttpError } from './tmdb';
import type { Meta, SearchHit } from './types';

/*
 * Anime data comes from MyAnimeList. With a MAL client ID inside the Android app we call
 * the official API; MAL doesn't allow browser (CORS) requests, so the web build — and any
 * failed official call — uses Jikan, a free read-only mirror of MAL with the same ids.
 */

const JIKAN = 'https://api.jikan.moe/v4';
const MAL = 'https://api.myanimelist.net/v2';
const MAL_FIELDS = 'id,title,main_picture,start_date,num_episodes,media_type,genres,average_episode_duration';

const useOfficial = (clientId: string) => isNative && !!clientId;

async function json<T>(url: URL, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new HttpError(res.status);
  return res.json() as Promise<T>;
}

// ---- Jikan ----

type JikanAnime = {
  mal_id: number;
  title: string;
  title_english?: string | null;
  year?: number | null;
  aired?: { from?: string | null };
  images?: { webp?: { large_image_url?: string }; jpg?: { image_url?: string; large_image_url?: string } };
  episodes?: number | null;
  genres?: { name: string }[];
  themes?: { name: string }[];
  type?: string | null;
  duration?: string | null;
};

/** "24 min per ep" / "1 hr 30 min" → minutes */
function durMin(s?: string | null) {
  if (!s) return undefined;
  const h = /(\d+)\s*hr/.exec(s);
  const m = /(\d+)\s*min/.exec(s);
  return (h ? +h[1] * 60 : 0) + (m ? +m[1] : 0) || undefined;
}

function fromJikan(a: JikanAnime): SearchHit {
  return {
    id: a.mal_id,
    title: a.title,
    year: String(a.year || (a.aired?.from ?? '').slice(0, 4) || ''),
    img: a.images?.webp?.large_image_url || a.images?.jpg?.large_image_url || a.images?.jpg?.image_url,
    episodes: a.episodes || undefined,
    genres: [...(a.genres ?? []), ...(a.themes ?? [])].map((g) => g.name).slice(0, 6),
    type: a.type || undefined,
    dur: durMin(a.duration),
    full: true,
  };
}

// ---- MAL official ----

type MalAnime = {
  id: number;
  title: string;
  main_picture?: { medium?: string; large?: string };
  start_date?: string;
  num_episodes?: number;
  media_type?: string;
  genres?: { name: string }[];
  average_episode_duration?: number;
};

const MAL_TYPES: Record<string, string> = { tv: 'TV', ova: 'OVA', ona: 'ONA', movie: 'Movie', special: 'Special', music: 'Music', tv_special: 'TV Special' };

function fromMal(a: MalAnime): SearchHit {
  return {
    id: a.id,
    title: a.title,
    year: (a.start_date ?? '').slice(0, 4),
    img: a.main_picture?.large || a.main_picture?.medium,
    episodes: a.num_episodes || undefined,
    genres: (a.genres ?? []).map((g) => g.name).slice(0, 6),
    type: a.media_type ? MAL_TYPES[a.media_type] ?? a.media_type.toUpperCase() : undefined,
    dur: a.average_episode_duration ? Math.round(a.average_episode_duration / 60) : undefined,
    full: true,
  };
}

const malHeaders = (clientId: string) => ({ 'X-MAL-CLIENT-ID': clientId });

// ---- Public API ----

export async function searchAnime(query: string, clientId: string, signal?: AbortSignal): Promise<SearchHit[]> {
  // MAL's search needs at least 3 characters.
  if (useOfficial(clientId) && query.length >= 3) {
    try {
      const url = new URL(`${MAL}/anime`);
      url.search = new URLSearchParams({ q: query, limit: '20', fields: MAL_FIELDS, nsfw: 'false' }).toString();
      const d = await json<{ data: { node: MalAnime }[] }>(url, { headers: malHeaders(clientId), signal });
      return d.data.map((x) => fromMal(x.node));
    } catch (e) {
      if (signal?.aborted) throw e;
    }
  }
  const url = new URL(`${JIKAN}/anime`);
  url.search = new URLSearchParams({ q: query, limit: '20', sfw: 'true' }).toString();
  const d = await json<{ data: JikanAnime[] }>(url, { signal });
  return d.data.map(fromJikan);
}

export async function animeDetails(id: number, clientId: string): Promise<Partial<Meta>> {
  if (useOfficial(clientId)) {
    try {
      const url = new URL(`${MAL}/anime/${id}`);
      url.searchParams.set('fields', MAL_FIELDS);
      const { id: _id, ...m } = fromMal(await json<MalAnime>(url, { headers: malHeaders(clientId) }));
      return m;
    } catch {
      /* fall through to Jikan */
    }
  }
  const d = await json<{ data: JikanAnime }>(new URL(`${JIKAN}/anime/${id}`));
  const { id: _id, ...m } = fromJikan(d.data);
  return m;
}

/** Checks a MAL client ID against the official API (Android app only). */
export async function verifyMalClientId(clientId: string) {
  const url = new URL(`${MAL}/anime/1`);
  url.searchParams.set('fields', 'id');
  await json(url, { headers: malHeaders(clientId) });
}
