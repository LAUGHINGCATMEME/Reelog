import { avg, byEndDesc, eEnd, eStart, getMeta, libIds, titleInfo, watched, type TitleInfo } from './library';
import type { Data, Meta, Status } from './types';

/*
 * Anime on AniList are one entry per season, movie or OVA. Reelog groups them into one title by
 * following sequel, prequel and side-story links, so a franchise reads like a TV show with
 * seasons, movies and OVAs. Entries you haven't added show up in the group too.
 * Data.animeGroups overrides the automatic grouping per id (see its doc in types.ts).
 */

export type AnimeGroup = {
  /** Stable while the members don't change; used as a React key. */
  key: string;
  /** The member the group is named and pictured after: its earliest TV series. */
  root: number;
  /** Every known member, oldest first. */
  ids: number[];
  /** Members that are in the library (have entries, a status, a rating or notes). */
  lib: number[];
};

export type Grouping = {
  groups: AnimeGroup[];
  of: Map<number, AnimeGroup>;
  /** Ids split out of each automatic group, by that group's key, so they can be put back. */
  splitFrom: Map<string, number[]>;
  /** Ids moved into a group by hand, by the group's key. */
  movedIn: Map<string, number[]>;
};

export type Section = 'Series' | 'Movies' | 'OVAs & specials';
export const SECTIONS: Section[] = ['Series', 'Movies', 'OVAs & specials'];
export const sectionOf = (m: Meta): Section =>
  !m.type || m.type === 'TV' || m.type === 'TV Short' || m.type === 'ONA' ? 'Series' : m.type === 'Movie' ? 'Movies' : 'OVAs & specials';

const startOf = (data: Data, id: number) => getMeta(data, 'anime', id).start || '9999';
const byStart = (data: Data) => (a: number, b: number) => startOf(data, a).localeCompare(startOf(data, b)) || a - b;

/** Every anime reachable from the library along group links (capped, in case of a runaway chain). */
export function knownAnime(data: Data, limit = 1500): number[] {
  const seen = new Set(libIds(data, 'anime'));
  for (const [k, v] of Object.entries(data.animeGroups ?? {})) seen.add(+k).add(v);
  const todo = [...seen];
  while (todo.length && seen.size < limit) {
    for (const r of data.meta[`anime:${todo.pop()!}`]?.rel ?? []) {
      if (!seen.has(r)) {
        seen.add(r);
        todo.push(r);
      }
    }
  }
  return [...seen];
}

export function groupAnime(data: Data, enabled: boolean): Grouping {
  const lib = new Set(libIds(data, 'anime'));
  const ids = enabled ? knownAnime(data) : [...lib];
  const known = new Set(ids);
  const manual = enabled ? data.animeGroups ?? {} : {};

  // Automatic groups: connected parts of the link graph (union–find).
  const parent = new Map(ids.map((id) => [id, id]));
  const find = (x: number): number => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  if (enabled) {
    for (const a of ids) {
      for (const b of data.meta[`anime:${a}`]?.rel ?? []) if (known.has(b)) parent.set(find(a), find(b));
    }
  }
  const autoKey = (id: number) => `a${find(id)}`;
  // Manual overrides point at another id (join its group) or at themselves (stand alone).
  const keyOf = (id: number, depth = 0): string => {
    const t = manual[id];
    if (t == null || !known.has(t)) return autoKey(id);
    if (t === id || depth > 20) return `s${id}`;
    return keyOf(t, depth + 1);
  };

  const members = new Map<string, number[]>();
  for (const id of ids) {
    const k = keyOf(id);
    members.set(k, [...(members.get(k) ?? []), id]);
  }

  const groups: AnimeGroup[] = [];
  const of = new Map<number, AnimeGroup>();
  const order = byStart(data);
  for (const [key, list] of members) {
    const sorted = [...list].sort(order);
    const inLib = sorted.filter((id) => lib.has(id));
    // Groups that only hold related titles you haven't touched stay out of the library.
    if (!inLib.length) continue;
    const series = sorted.filter((id) => ['TV', 'TV Short'].includes(getMeta(data, 'anime', id).type ?? ''));
    const g: AnimeGroup = { key, root: series[0] ?? sorted[0], ids: sorted, lib: inLib };
    groups.push(g);
    for (const id of sorted) of.set(id, g);
  }

  const splitFrom = new Map<string, number[]>();
  const movedIn = new Map<string, number[]>();
  for (const [k, t] of Object.entries(manual)) {
    const id = +k;
    if (!known.has(id)) continue;
    if (t === id) splitFrom.set(autoKey(id), [...(splitFrom.get(autoKey(id)) ?? []), id]);
    else {
      const g = of.get(id);
      if (g && autoKey(id) !== g.key) movedIn.set(g.key, [...(movedIn.get(g.key) ?? []), id]);
    }
  }
  return { groups, of, splitFrom, movedIn };
}

const STATUS_PRIORITY: Status[] = ['watching', 'paused', 'planned', 'completed', 'dropped'];

/**
 * Where a group's own rating or notes are in `map` (Data.groupRates, Data.groupNotes): the member
 * that has one, as the root can change when details load or the group is edited; else the root.
 */
export const groupKey = (map: Record<string, unknown> | undefined, g: AnimeGroup) =>
  String(g.ids.find((id) => map?.[id] != null) ?? g.root);

/** A group's own rating, or null. */
export const groupRate = (data: Data, g: AnimeGroup): number | null => data.groupRates?.[groupKey(data.groupRates, g)] ?? null;

/** Library row for a group; a group of one is just that anime. */
export function groupInfo(data: Data, g: AnimeGroup): TitleInfo {
  if (g.ids.length === 1) return titleInfo(data, 'anime', g.root);
  const infos = g.lib.map((id) => titleInfo(data, 'anime', id));
  const metas = g.ids.map((id) => getMeta(data, 'anime', id));
  const root = getMeta(data, 'anime', g.root);
  const es = infos.flatMap((x) => x.es).sort(byEndDesc);
  const statuses = infos.flatMap((x) => (x.status ? [x.status] : []));
  const eps = g.ids.reduce((n, id) => n + watched(data, 'anime', id).size, 0);
  // An airing entry has no episode count yet, so the group's total isn't known either.
  const tot = metas.every((m) => m.episodes) ? metas.reduce((n, m) => n + m.episodes!, 0) : 0;
  const years = metas.map((m) => m.year).filter(Boolean).sort();
  const span = years.length ? (years[0] === years[years.length - 1] ? years[0] : `${years[0]}–${years[years.length - 1]}`) : '';
  const last = es.length ? eEnd(es[0]) : '';
  return {
    id: g.root,
    kind: 'anime',
    m: { ...root, genres: [...new Set(metas.flatMap((m) => m.genres ?? []))] },
    es,
    last,
    first: es.reduce((a, e) => (!a || eStart(e) < a ? eStart(e) : a), ''),
    status: STATUS_PRIORITY.find((s) => statuses.includes(s)) ?? null,
    statuses,
    // Its own rating, else the average of its members'.
    score: groupRate(data, g) ?? avg(infos.flatMap((x) => (x.score != null ? [x.score] : []))),
    line: tot ? `${eps}/${tot} eps` : `${eps} eps`,
    sub: [span, `${g.ids.length} entries`].filter(Boolean).join(' · '),
    film: false,
  };
}
