export type Entry = {
  id: string;
  tmdb: number;
  /** ISO date (YYYY-MM-DD), or '' when unknown (e.g. imported without a date). */
  date: string;
  /** 0–10 in 0.5 steps, or null for "no rating". */
  score: number | null;
  notes: string;
};

export type Movie = {
  id: number;
  title: string;
  year: number | string;
  runtime?: number;
  director?: string;
  genres: string[];
  image?: string;
  /** Set once full details have been fetched from TMDB. */
  detailed?: boolean;
};

export type Data = {
  entries: Entry[];
  /** Movie metadata keyed by TMDB id. Kept as `extra` for backup compatibility. */
  extra: Record<number, Movie>;
};

export type Settings = {
  tmdbKey: string;
  layout: 'list' | 'grid';
  ratingInput: 'slider' | 'tap';
};

export type Screen = 'library' | 'search' | 'detail' | 'data';
export type Sort = 'recent' | 'rating' | 'most' | 'title';
