export type Kind = 'movie' | 'tv' | 'anime';
export type EpKind = 'tv' | 'anime';
export type Status = 'watching' | 'planned' | 'completed' | 'paused' | 'dropped';

export type MovieEntry = {
  id: string;
  kind: 'movie';
  ref: number;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  /** 0–10 in 0.5 steps, or null for "no rating". */
  score: number | null;
  notes: string;
};

/** One or more consecutive episodes, watched between `start` and `end` (equal for a single day). */
export type EpEntry = {
  id: string;
  kind: EpKind;
  ref: number;
  /** TV only. */
  season?: number;
  epFrom: number;
  epTo: number;
  start: string;
  end: string;
  score: number | null;
  notes: string;
};

export type Entry = MovieEntry | EpEntry;
/** An entry before it gets an id. */
export type NewEntry = Omit<MovieEntry, 'id'> | Omit<EpEntry, 'id'>;

export type Season = { n: number; name: string; episodes: number; year?: string; img?: string };

export type Meta = {
  title: string;
  year: string;
  img?: string;
  genres: string[];
  /** Movies */
  director?: string;
  runtime?: number;
  /** TV */
  epRuntime?: number;
  seasons?: Season[];
  /** Anime */
  episodes?: number;
  type?: string;
  /** Minutes per anime episode. */
  dur?: number;
  /** Set once full details have been fetched. */
  full?: boolean;
};

export type Data = {
  entries: Entry[];
  /** Keyed `${kind}:${id}`. */
  meta: Record<string, Partial<Meta>>;
  /** Keyed by skey(): `movie:id`, `anime:id`, `tv:id:season`. Explicit statuses only. */
  status: Record<string, Status>;
  /** Title ratings, same keys as status (TV seasons, anime). Movies are rated per watch. */
  rates: Record<string, number>;
};

export type Settings = {
  tmdbKey: string;
  malKey: string;
  layout: 'list' | 'grid';
  rating: 'slider' | 'tap';
};

export type Route =
  | { s: 'lib' }
  | { s: 'search'; kind: Kind }
  | { s: 'movie'; id: number }
  | { s: 'show'; id: number }
  | { s: 'eps'; kind: EpKind; ref: number; season?: number }
  | { s: 'settings' }
  | { s: 'stats' };

export type Tab = Kind | 'settings';

export type Sort = 'recent' | 'rating' | 'title';
export type Filter = { status: Status | 'all'; genre: string | null; sort: Sort };

/** A search hit, normalised across TMDB, MyAnimeList and the offline catalogue. */
export type SearchHit = { id: number } & Partial<Meta> & { title: string };
