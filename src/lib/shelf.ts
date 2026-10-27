import { groupInfo, type AnimeGroup } from './groups';
import { getMeta, isAnimeMovie, libIds, mkey, titleInfo, type TitleInfo } from './library';
import type { Data, Kind, Settings } from './types';

/** Anime films listed under Movies, tagged with an "Anime" genre so they can be filtered. */
function animeFilms(data: Data): TitleInfo[] {
  return libIds(data, 'anime')
    .filter((id) => isAnimeMovie(getMeta(data, 'anime', id)))
    .map((id) => {
      const x = titleInfo(data, 'anime', id);
      return { ...x, m: { ...x.m, genres: ['Anime', ...x.m.genres] } };
    });
}

/**
 * The titles a library tab lists. Anime are franchise groups when `groups` is given. Settings →
 * Anime films decides whether anime films are listed under Movies, Anime or both; with Movies,
 * anime whose only logged entries are films leave the Anime tab.
 */
export function shelf(data: Data, kind: Kind, films: Settings['animeFilms'], groups?: AnimeGroup[]): TitleInfo[] {
  if (kind === 'tv') return libIds(data, 'tv').map((id) => titleInfo(data, 'tv', id));
  if (kind === 'movie') {
    const movies = libIds(data, 'movie').map((id) => titleInfo(data, 'movie', id));
    return films === 'anime' ? movies : [...movies, ...animeFilms(data)];
  }
  const onlyFilms = (ids: number[]) => films === 'movies' && ids.every((id) => isAnimeMovie(getMeta(data, 'anime', id)));
  if (groups) return groups.filter((g) => !onlyFilms(g.lib)).map((g) => groupInfo(data, g));
  return libIds(data, 'anime').filter((id) => !onlyFilms([id])).map((id) => titleInfo(data, 'anime', id));
}

/** Library titles of a tab whose title (either language) or a genre matches `q`. Single titles, not groups. */
export function findInLibrary(data: Data, kind: Kind, films: Settings['animeFilms'], q: string): TitleInfo[] {
  const ql = q.trim().toLowerCase();
  if (!ql) return [];
  const all = kind === 'movie' ? shelf(data, 'movie', films) : libIds(data, kind).map((id) => titleInfo(data, kind, id));
  return all.filter((x) => {
    const raw = data.meta[mkey(x.kind, x.id)] ?? {};
    return [x.m.title, raw.title, raw.titleEn].some((t) => t?.toLowerCase().includes(ql)) || x.m.genres.some((g) => g.toLowerCase() === ql);
  });
}
