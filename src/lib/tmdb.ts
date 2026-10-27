import type { Details, Meta, Person, SearchHit } from './types';

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

// ---- Detail page ----

const FACE = 'https://image.tmdb.org/t/p/w185';
const face = (p?: string | null) => (p ? FACE + p : undefined);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const longDate = (d?: string | null) => {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${+day} ${MON[+m - 1]} ${y}`;
};
const money = (n?: number) => (n ? `$${n >= 1e6 ? `${Math.round(n / 1e5) / 10}M` : n.toLocaleString()}` : '');
const lang = (code?: string) => {
  if (!code) return '';
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
};

type CastMember = { name: string; character?: string; profile_path?: string | null; roles?: { character: string }[] };
type CrewMember = { name: string; job?: string; profile_path?: string | null; jobs?: { job: string }[] };
type ExtraBase = {
  overview?: string;
  tagline?: string;
  status?: string;
  vote_average?: number;
  vote_count?: number;
  original_language?: string;
  production_companies?: Named[];
  production_countries?: Named[];
};

/** Directors, writers and the composer, in that order, one entry per person. */
function keyCrew(crew: CrewMember[]) {
  const JOBS = ['Director', 'Screenplay', 'Writer', 'Story', 'Novel', 'Original Music Composer', 'Director of Photography'];
  const out = new Map<string, Person>();
  for (const job of JOBS) {
    for (const c of crew) {
      const jobs = c.jobs?.map((j) => j.job) ?? [c.job];
      if (!jobs.includes(job)) continue;
      const p = out.get(c.name);
      if (p) {
        if (!p.role!.includes(job)) p.role += `, ${job}`;
      } else out.set(c.name, { name: c.name, role: job, img: face(c.profile_path) });
    }
  }
  return [...out.values()].slice(0, 10);
}

const castOf = (cast: CastMember[]): Person[] =>
  cast.slice(0, 16).map((c) => ({ name: c.name, role: c.character ?? c.roles?.[0]?.character, img: face(c.profile_path) }));

const score = (d: ExtraBase) => (d.vote_count && d.vote_count >= 10 && d.vote_average ? Math.round(d.vote_average * 10) / 10 : undefined);

export async function movieExtra(key: string, id: number): Promise<Details> {
  const d = await get<ExtraBase & MovieHit & {
    runtime?: number; budget?: number; revenue?: number; original_title?: string;
    credits?: { cast?: CastMember[]; crew?: CrewMember[] };
  }>(key, `/movie/${id}`, { append_to_response: 'credits' });
  const facts: [string, string][] = [
    ['Released', longDate(d.release_date)],
    ['Runtime', d.runtime ? `${Math.floor(d.runtime / 60)}h ${d.runtime % 60}m` : ''],
    ['Status', d.status && d.status !== 'Released' ? d.status : ''],
    ['Language', lang(d.original_language)],
    ['Original title', d.original_title && d.original_title !== d.title ? d.original_title : ''],
    ['Country', (d.production_countries ?? []).map((c) => c.name).slice(0, 3).join(', ')],
    ['Studio', (d.production_companies ?? []).map((c) => c.name).slice(0, 3).join(', ')],
    ['Budget', money(d.budget)],
    ['Box office', money(d.revenue)],
  ];
  return {
    overview: d.overview || undefined,
    tagline: d.tagline || undefined,
    facts: facts.filter(([, v]) => v),
    cast: castOf(d.credits?.cast ?? []),
    crew: keyCrew(d.credits?.crew ?? []),
    score: score(d),
    at: Date.now(),
  };
}

export async function tvExtra(key: string, id: number): Promise<Details> {
  const d = await get<ExtraBase & TvHit & {
    last_air_date?: string; original_name?: string; type?: string;
    networks?: Named[]; created_by?: { name: string; profile_path?: string | null }[];
    number_of_episodes?: number; number_of_seasons?: number;
    next_episode_to_air?: { episode_number: number; season_number: number; air_date?: string } | null;
    aggregate_credits?: { cast?: CastMember[]; crew?: CrewMember[] };
  }>(key, `/tv/${id}`, { append_to_response: 'aggregate_credits' });
  const first = longDate(d.first_air_date);
  const last = longDate(d.last_air_date);
  const facts: [string, string][] = [
    ['Aired', first && last && first !== last ? `${first} – ${last}` : first],
    ['Status', d.status ?? ''],
    ['Episodes', d.number_of_episodes ? `${d.number_of_episodes} in ${d.number_of_seasons} season${d.number_of_seasons === 1 ? '' : 's'}` : ''],
    ['Network', (d.networks ?? []).map((n) => n.name).slice(0, 3).join(', ')],
    ['Language', lang(d.original_language)],
    ['Original title', d.original_name && d.original_name !== d.name ? d.original_name : ''],
    ['Country', (d.production_countries ?? []).map((c) => c.name).slice(0, 3).join(', ')],
    ['Studio', (d.production_companies ?? []).map((c) => c.name).slice(0, 3).join(', ')],
  ];
  const creators: Person[] = (d.created_by ?? []).map((c) => ({ name: c.name, role: 'Creator', img: face(c.profile_path) }));
  const crew = keyCrew(d.aggregate_credits?.crew ?? []).filter((p) => !creators.some((c) => c.name === p.name));
  const nx = d.next_episode_to_air;
  return {
    overview: d.overview || undefined,
    tagline: d.tagline || undefined,
    facts: facts.filter(([, v]) => v),
    cast: castOf(d.aggregate_credits?.cast ?? []),
    crew: [...creators, ...crew].slice(0, 10),
    score: score(d),
    next: nx?.air_date ? { ep: nx.episode_number, season: nx.season_number, at: nx.air_date } : undefined,
    at: Date.now(),
  };
}
