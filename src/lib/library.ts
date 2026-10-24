import { BASE } from './catalog';
import { fmtDate, fmtDateLong } from './format';
import type { Data, EpEntry, Entry, Kind, Meta, Status } from './types';

export const STATUSES: [Status, string, string][] = [
  ['watching', 'Watching', 'var(--accent-text)'],
  ['planned', 'Planned', 'var(--text-muted)'],
  ['completed', 'Completed', 'var(--positive)'],
  ['paused', 'Paused', 'var(--warning)'],
  ['dropped', 'Dropped', 'var(--text-disabled)'],
];
export const SMAP = Object.fromEntries(STATUSES.map(([k, label, color]) => [k, { label, color }])) as Record<
  Status,
  { label: string; color: string }
>;

export const mkey = (kind: Kind, id: number) => `${kind}:${id}`;
/** Status/rating key: per season for TV, per title otherwise. */
export const skey = (kind: Kind, ref: number, season?: number) => (kind === 'tv' ? `tv:${ref}:${season}` : `${kind}:${ref}`);

// ---- Entry helpers ----

export const isEp = (e: Entry): e is EpEntry => e.kind !== 'movie';
export const eStart = (e: Entry) => (isEp(e) ? e.start : e.date);
export const eEnd = (e: Entry) => (isEp(e) ? e.end : e.date);
export const eCount = (e: Entry) => (isEp(e) ? Math.max(1, e.epTo - e.epFrom + 1) : 1);
export const epLabel = (e: EpEntry) => (e.epFrom === e.epTo ? `Episode ${e.epFrom}` : `Episodes ${e.epFrom}–${e.epTo}`);
export const epShort = (e: EpEntry) => (e.epFrom === e.epTo ? `E${e.epFrom}` : `E${e.epFrom}–${e.epTo}`);
export const dateLabel = (e: Entry) => {
  const a = eStart(e);
  const b = eEnd(e);
  return a === b ? fmtDate(b) : `${fmtDate(a)} – ${fmtDate(b)}`;
};
export const byEndDesc = (a: Entry, b: Entry) => eEnd(b).localeCompare(eEnd(a));

export const avg = (a: number[]) => (a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10 : null);

// ---- Lookups over Data ----

export function getMeta(data: Data, kind: Kind, id: number): Meta {
  const k = mkey(kind, id);
  return {
    title: `${kind === 'anime' ? 'MAL' : 'TMDB'} #${id}`,
    year: '',
    genres: [],
    ...BASE[k],
    ...data.meta[k],
  } as Meta;
}

/** Entries for a title; for TV pass a season to narrow, or leave it out for the whole show. */
export function entriesOf(data: Data, kind: Kind, ref: number, season?: number): Entry[] {
  return data.entries.filter((e) => e.kind === kind && e.ref === ref && (kind !== 'tv' || season == null || (e as EpEntry).season === season));
}

export function watched(data: Data, kind: Kind, ref: number, season?: number): Set<number> {
  const s = new Set<number>();
  for (const e of entriesOf(data, kind, ref, season)) {
    if (!isEp(e)) continue;
    for (let i = e.epFrom; i <= e.epTo && i - e.epFrom < 5000; i++) s.add(i);
  }
  return s;
}

/** Episode count of an anime or a TV season, or 0 when unknown. */
export function total(data: Data, kind: Kind, ref: number, season?: number): number {
  const m = getMeta(data, kind, ref);
  if (kind === 'tv') return m.seasons?.find((x) => x.n === season)?.episodes ?? 0;
  return m.episodes ?? 0;
}

/** Explicit status, else implied by having entries (movies → Completed, episodes → Watching). */
export function statusOf(data: Data, kind: Kind, ref: number, season?: number): Status | null {
  const v = data.status[skey(kind, ref, season)];
  if (v) return v;
  if (!entriesOf(data, kind, ref, season).length) return null;
  return kind === 'movie' ? 'completed' : 'watching';
}

/** Every title of a kind that has entries, a status or a rating. */
export function libIds(data: Data, kind: Kind): number[] {
  const ids = new Set<number>();
  for (const e of data.entries) if (e.kind === kind) ids.add(e.ref);
  for (const k of [...Object.keys(data.status), ...Object.keys(data.rates)]) {
    const p = k.split(':');
    if (p[0] === kind) ids.add(+p[1]);
  }
  return [...ids];
}

/** Season numbers of a show that have entries, a status or a rating. */
export function touchedSeasons(data: Data, id: number): number[] {
  const ns = new Set<number>();
  for (const e of entriesOf(data, 'tv', id)) ns.add((e as EpEntry).season ?? 1);
  for (const k of [...Object.keys(data.status), ...Object.keys(data.rates)]) {
    if (k.startsWith(`tv:${id}:`)) ns.add(+k.split(':')[2]);
  }
  return [...ns].sort((a, b) => a - b);
}

export type TitleInfo = {
  id: number;
  kind: Kind;
  m: Meta;
  es: Entry[];
  last: string;
  /** Earliest start date of any entry ('' if none). */
  first: string;
  status: Status | null;
  /** TV: one per season; otherwise the title's status. */
  statuses: Status[];
  score: number | null;
  line: string;
  sub: string;
};

const STATUS_PRIORITY: Status[] = ['watching', 'paused', 'planned', 'completed', 'dropped'];

export function titleInfo(data: Data, kind: Kind, id: number): TitleInfo {
  const m = getMeta(data, kind, id);
  const es = entriesOf(data, kind, id).sort(byEndDesc);
  const last = es.length ? eEnd(es[0]) : '';
  let status: Status | null;
  let statuses: Status[];
  let score: number | null;
  let line: string;

  if (kind === 'movie') {
    status = statusOf(data, 'movie', id);
    statuses = status ? [status] : [];
    score = es.find((e) => e.score != null)?.score ?? null;
    line = fmtDateLong(last);
  } else if (kind === 'anime') {
    status = statusOf(data, 'anime', id);
    statuses = status ? [status] : [];
    score = data.rates[`anime:${id}`] ?? avg(es.flatMap((e) => (e.score != null ? [e.score] : [])));
    line = `${watched(data, 'anime', id).size}/${m.episodes || '?'} eps` + (last ? ` · ${fmtDateLong(last)}` : '');
  } else {
    const ns = touchedSeasons(data, id);
    statuses = ns.map((n) => statusOf(data, 'tv', id, n)).filter((s): s is Status => !!s);
    status = STATUS_PRIORITY.find((x) => statuses.includes(x)) ?? null;
    score = avg(ns.flatMap((n) => (data.rates[`tv:${id}:${n}`] != null ? [data.rates[`tv:${id}:${n}`]] : [])));
    const e = es[0] as EpEntry | undefined;
    line = e ? `S${e.season} ${epShort(e)} · ${fmtDateLong(last)}` : `${ns.length} season${ns.length === 1 ? '' : 's'}`;
  }

  const sub =
    kind === 'movie'
      ? [m.year, m.director]
      : kind === 'tv'
        ? [m.year, m.seasons?.length && `${m.seasons.length} seasons`]
        : [m.year, m.episodes && `${m.episodes} eps`, m.type];
  const first = es.reduce((a, e) => (!a || eStart(e) < a ? eStart(e) : a), '');
  return { id, kind, m, es, last, first, status, statuses, score, line, sub: sub.filter(Boolean).join(' · ') };
}

/** First episode not yet watched, capped at the total. */
export function nextEpisode(data: Data, kind: Kind, ref: number, season?: number) {
  const w = watched(data, kind, ref, season);
  const tot = total(data, kind, ref, season);
  let n = 1;
  while (w.has(n)) n++;
  return tot && n > tot ? tot : n;
}

/** Removes empty fields so a sparse record never erases a richer one when merged. */
export function clean<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== '' && v != null && !(Array.isArray(v) && !v.length)),
  ) as Partial<T>;
}
