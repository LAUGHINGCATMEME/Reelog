import type { Movie } from './types';

/** Offline catalogue used for search when no TMDB key is configured. Ids are real TMDB ids. */
const ROWS: [number, string, number, number, string, string[]][] = [
  [27205, 'Inception', 2010, 148, 'Christopher Nolan', ['Sci-Fi', 'Thriller']],
  [693134, 'Dune: Part Two', 2024, 166, 'Denis Villeneuve', ['Sci-Fi', 'Adventure']],
  [438631, 'Dune', 2021, 155, 'Denis Villeneuve', ['Sci-Fi', 'Adventure']],
  [841, 'Dune', 1984, 137, 'David Lynch', ['Sci-Fi']],
  [496243, 'Parasite', 2019, 133, 'Bong Joon Ho', ['Thriller', 'Drama']],
  [335984, 'Blade Runner 2049', 2017, 164, 'Denis Villeneuve', ['Sci-Fi', 'Drama']],
  [78, 'Blade Runner', 1982, 117, 'Ridley Scott', ['Sci-Fi', 'Noir']],
  [244786, 'Whiplash', 2014, 107, 'Damien Chazelle', ['Drama', 'Music']],
  [872585, 'Oppenheimer', 2023, 180, 'Christopher Nolan', ['Drama', 'History']],
  [329865, 'Arrival', 2016, 116, 'Denis Villeneuve', ['Sci-Fi', 'Drama']],
  [949, 'Heat', 1995, 170, 'Michael Mann', ['Crime', 'Thriller']],
  [603, 'The Matrix', 1999, 136, 'Lana & Lilly Wachowski', ['Sci-Fi', 'Action']],
  [604, 'The Matrix Reloaded', 2003, 138, 'Lana & Lilly Wachowski', ['Sci-Fi', 'Action']],
  [157336, 'Interstellar', 2014, 169, 'Christopher Nolan', ['Sci-Fi', 'Drama']],
  [155, 'The Dark Knight', 2008, 152, 'Christopher Nolan', ['Action', 'Crime']],
  [550, 'Fight Club', 1999, 139, 'David Fincher', ['Drama']],
  [680, 'Pulp Fiction', 1994, 154, 'Quentin Tarantino', ['Crime']],
  [129, 'Spirited Away', 2001, 125, 'Hayao Miyazaki', ['Animation', 'Fantasy']],
  [76341, 'Mad Max: Fury Road', 2015, 120, 'George Miller', ['Action']],
  [545611, 'Everything Everywhere All at Once', 2022, 139, 'Daniel Kwan & Daniel Scheinert', ['Sci-Fi', 'Comedy']],
  [238, 'The Godfather', 1972, 175, 'Francis Ford Coppola', ['Crime', 'Drama']],
  [240, 'The Godfather Part II', 1974, 202, 'Francis Ford Coppola', ['Crime', 'Drama']],
  [348, 'Alien', 1979, 117, 'Ridley Scott', ['Horror', 'Sci-Fi']],
  [64690, 'Drive', 2011, 100, 'Nicolas Winding Refn', ['Crime', 'Drama']],
];

export const CATALOG: Movie[] = ROWS.map(([id, title, year, runtime, director, genres]) => ({
  id, title, year, runtime, director, genres,
}));

export const CATALOG_MAP: Record<number, Movie> = Object.fromEntries(CATALOG.map((m) => [m.id, m]));

export function searchCatalog(query: string): Movie[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const starts = (m: Movie) => (m.title.toLowerCase().startsWith(q) ? 0 : 1);
  return CATALOG.filter((m) => m.title.toLowerCase().includes(q)).sort(
    (a, b) => starts(a) - starts(b) || +b.year - +a.year,
  );
}
