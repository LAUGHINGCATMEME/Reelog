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
  /**
   * Anime: the English title, or the romaji one when AniList has no English title. Shown instead
   * of `title` when Settings → Anime titles is English. Missing until fetched.
   */
  titleEn?: string;
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
  /** Anime: AniList ids of the entries it groups with (sequels, prequels, side stories, parent). */
  rel?: number[];
  /** Anime: MyAnimeList id, when AniList knows one. */
  idMal?: number;
  /** Set once full details (for anime: including `rel`) have been fetched. */
  full?: boolean;
};

/** A cast or crew member on a detail page. */
export type Person = { name: string; role?: string; img?: string };

/**
 * The extra information on a detail page: overview, facts, cast and crew. Fetched when the page
 * is opened and kept in a separate, size-capped cache (see details.ts), not in Data.
 */
export type Details = {
  overview?: string;
  tagline?: string;
  /** Label/value pairs, already formatted: "Status" → "Ended". */
  facts: [string, string][];
  cast: Person[];
  crew: Person[];
  /** Community score out of 10 (TMDB votes, AniList average). */
  score?: number;
  /** Next episode to air. `at` is an ISO date. */
  next?: { ep: number; season?: number; at: string };
  /** When this was fetched (ms), so stale details are refreshed. */
  at: number;
};

export type Data = {
  entries: Entry[];
  /** Keyed `${kind}:${id}`. */
  meta: Record<string, Partial<Meta>>;
  /** Keyed by skey(): `movie:id`, `anime:id`, `tv:id:season`. Explicit statuses only. */
  status: Record<string, Status>;
  /** Title ratings, same keys as status (TV seasons, anime). Movies are rated per watch. */
  rates: Record<string, number>;
  /** Title notes, same keys as rates. Notes on a watch are on its entry. */
  notes?: Record<string, string>;
  /**
   * An anime group's own rating and notes, apart from its members' in rates and notes. Groups
   * have no id of their own, so these are keyed by a member's AniList id (see groupKey).
   */
  groupRates?: Record<string, number>;
  groupNotes?: Record<string, string>;
  /**
   * Manual anime grouping, by AniList id. Anime group automatically along sequel/prequel and
   * side-story links; an id here instead joins the group of the id it points to, or stands alone
   * if it points to itself.
   */
  animeGroups?: Record<string, number>;
  /**
   * Anime from before the switch to AniList, still keyed by MyAnimeList id. They're converted
   * to AniList ids in the background (see migrate.ts) and this is removed once that's done.
   */
  legacyMal?: LegacyMal;
  /** Tier lists, newest first. */
  tierLists?: TierList[];
};

/** One row of a tier list. Items are title keys (`movie:603`, `tv:1396`, `anime:16498`), best first. */
export type Tier = { id: string; label: string; color: string; items: string[] };

export type TierList = {
  id: string;
  name: string;
  /** What it ranks: titles of these kinds are offered when adding. */
  kinds: Kind[];
  tiers: Tier[];
  /** Added but not placed in a tier yet. */
  pool: string[];
  /** ISO timestamps. */
  created: string;
  updated: string;
};

export type LegacyMal = {
  entries: EpEntry[];
  status: Record<string, Status>;
  rates: Record<string, number>;
  animeGroups: Record<string, number>;
  /** Their titles, by MAL id, so ones AniList can't match can still be named. */
  titles: Record<string, string>;
};

export type Theme = 'system' | 'black' | 'oled' | 'white';

export type Settings = {
  tmdbKey: string;
  layout: 'list' | 'grid';
  rating: 'slider' | 'tap';
  /** Show related anime (seasons, movies, OVAs) as one title. */
  groupAnime: boolean;
  theme: Theme;
  /** Android app: write a backup to Documents/Reelog each day the data changes. */
  autoBackup: boolean;
  /** Anime titles as AniList lists them (romaji) or in English, where there is one. */
  titles: 'romaji' | 'english';
  /** Which library tab lists anime films: Anime, Movies, or both. */
  animeFilms: 'anime' | 'movies' | 'both';
  /** Library sort, per tab. */
  sort: Record<Kind, Sort>;
  /** Tap rating: tapping the score you have again takes half a point off it, or adds one. */
  tapHalf: 'down' | 'up';
  /** AniList and TMDB scores on title pages. */
  publicScores: boolean;
  /** Episodes watched more than once are a darker red, the more the darker. */
  rewatchShades: boolean;
  /** An anime group's page lists all its episodes: numbered on from season to season, or per season. */
  groupEps: 'off' | 'continuous' | 'seasons';
  /** Shared tier list images, 1 (smallest file) to 10 (full poster resolution, lossless). */
  shareQuality: number;
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
  | { s: 'stats' }
  | { s: 'diary' }
  | { s: 'tiers' }
  | { s: 'tier'; id: string }
  /** Adding titles to a tier list. */
  | { s: 'tierpick'; id: string };

export type Tab = Kind | 'settings';

export type Sort = 'started' | 'recent' | 'rating' | 'title';
export type Filter = { status: Status | 'all'; genre: string | null; sort: Sort };

/** A search hit, normalised across TMDB, AniList and the offline catalogue. */
export type SearchHit = { id: number } & Partial<Meta> & { title: string };
