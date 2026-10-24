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
  /** Anime: first air date (YYYY, YYYY-MM or YYYY-MM-DD). */
  start?: string;
  /** Anime: MAL ids of its sequels and prequels. */
  rel?: number[];
  /** Anime: set once `rel` has been fetched (it can be empty). */
  linked?: boolean;
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
  /**
   * Manual anime grouping, by MAL id. Anime group automatically along sequel/prequel links;
   * an id here instead joins the group of the id it points to, or stands alone if it points to itself.
   */
  animeGroups?: Record<string, number>;
};

export type Settings = {
  tmdbKey: string;
  malKey: string;
  layout: 'list' | 'grid';
  rating: 'slider' | 'tap';
  /** Show related anime (seasons, movies, OVAs) as one title. */
  groupAnime: boolean;
};

export type Route =
  | { s: 'lib' }
  | { s: 'search'; kind: Kind; q?: string }
  | { s: 'movie'; id: number }
  | { s: 'show'; id: number }
  | { s: 'eps'; kind: EpKind; ref: number; season?: number }
  /** An anime group, found by any of its members. */
  | { s: 'agroup'; id: number }
  | { s: 'settings' }
  | { s: 'stats' };

export type Tab = Kind | 'settings';

export type Sort = 'started' | 'recent' | 'rating' | 'title';
export type Filter = { status: Status | 'all'; genre: string | null; sort: Sort };

/** A search hit, normalised across TMDB, MyAnimeList and the offline catalogue. */
export type SearchHit = { id: number } & Partial<Meta> & { title: string };
