import type { Kind, Meta, SearchHit } from './types';

/** Offline catalogue used for movie/TV search when no TMDB key is set. Ids are real TMDB ids. */
const MOVIES: [number, string, number, number, string, string[]][] = [
  [27205, 'Inception', 2010, 148, 'Christopher Nolan', ['Science Fiction', 'Thriller']],
  [693134, 'Dune: Part Two', 2024, 166, 'Denis Villeneuve', ['Science Fiction', 'Adventure']],
  [438631, 'Dune', 2021, 155, 'Denis Villeneuve', ['Science Fiction', 'Adventure']],
  [841, 'Dune', 1984, 137, 'David Lynch', ['Science Fiction']],
  [496243, 'Parasite', 2019, 133, 'Bong Joon Ho', ['Thriller', 'Drama']],
  [335984, 'Blade Runner 2049', 2017, 164, 'Denis Villeneuve', ['Science Fiction', 'Drama']],
  [78, 'Blade Runner', 1982, 117, 'Ridley Scott', ['Science Fiction', 'Drama']],
  [244786, 'Whiplash', 2014, 107, 'Damien Chazelle', ['Drama', 'Music']],
  [872585, 'Oppenheimer', 2023, 180, 'Christopher Nolan', ['Drama', 'History']],
  [329865, 'Arrival', 2016, 116, 'Denis Villeneuve', ['Science Fiction', 'Drama']],
  [949, 'Heat', 1995, 170, 'Michael Mann', ['Crime', 'Thriller']],
  [603, 'The Matrix', 1999, 136, 'Lana & Lilly Wachowski', ['Science Fiction', 'Action']],
  [157336, 'Interstellar', 2014, 169, 'Christopher Nolan', ['Science Fiction', 'Drama']],
  [155, 'The Dark Knight', 2008, 152, 'Christopher Nolan', ['Action', 'Crime']],
  [550, 'Fight Club', 1999, 139, 'David Fincher', ['Drama']],
  [680, 'Pulp Fiction', 1994, 154, 'Quentin Tarantino', ['Crime']],
  [129, 'Spirited Away', 2001, 125, 'Hayao Miyazaki', ['Animation', 'Fantasy']],
  [76341, 'Mad Max: Fury Road', 2015, 120, 'George Miller', ['Action']],
  [545611, 'Everything Everywhere All at Once', 2022, 139, 'Daniel Kwan & Daniel Scheinert', ['Science Fiction', 'Comedy']],
  [238, 'The Godfather', 1972, 175, 'Francis Ford Coppola', ['Crime', 'Drama']],
  [348, 'Alien', 1979, 117, 'Ridley Scott', ['Horror', 'Science Fiction']],
  [64690, 'Drive', 2011, 100, 'Nicolas Winding Refn', ['Crime', 'Drama']],
];

const SHOWS: [number, string, number, number, string[], number[]][] = [
  [1396, 'Breaking Bad', 2008, 47, ['Drama', 'Crime'], [7, 13, 13, 13, 16]],
  [60059, 'Better Call Saul', 2015, 46, ['Drama', 'Crime'], [10, 10, 10, 10, 10, 13]],
  [95396, 'Severance', 2022, 50, ['Drama', 'Mystery', 'Sci-Fi & Fantasy'], [9, 10]],
  [136315, 'The Bear', 2022, 32, ['Drama', 'Comedy'], [8, 10, 10, 10]],
  [76331, 'Succession', 2018, 62, ['Drama'], [10, 10, 9, 10]],
  [126308, 'Shōgun', 2024, 60, ['Drama', 'War & Politics'], [10]],
  [70523, 'Dark', 2017, 55, ['Crime', 'Drama', 'Mystery'], [10, 8, 8]],
  [46648, 'True Detective', 2014, 58, ['Drama', 'Crime', 'Mystery'], [8, 8, 8, 6]],
];

export const BASE: Record<string, Partial<Meta>> = {};
const LIST: Record<'movie' | 'tv', SearchHit[]> = { movie: [], tv: [] };

for (const [id, title, year, runtime, director, genres] of MOVIES) {
  const m = { title, year: String(year), runtime, director, genres };
  BASE[`movie:${id}`] = m;
  LIST.movie.push({ id, ...m });
}
for (const [id, title, year, epRuntime, genres, eps] of SHOWS) {
  const m = {
    title, year: String(year), epRuntime, genres,
    seasons: eps.map((episodes, i) => ({ n: i + 1, name: `Season ${i + 1}`, episodes })),
  };
  BASE[`tv:${id}`] = m;
  LIST.tv.push({ id, ...m });
}

export function searchCatalog(kind: Kind, query: string): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q || kind === 'anime') return [];
  const starts = (m: SearchHit) => (m.title.toLowerCase().startsWith(q) ? 0 : 1);
  return LIST[kind]
    .filter((m) => m.title.toLowerCase().includes(q))
    .sort((a, b) => starts(a) - starts(b) || +(b.year ?? 0) - +(a.year ?? 0));
}
