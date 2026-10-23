import { localDay } from './format';
import { eEnd, eStart, getMeta, isEp, libIds, skey, statusOf, touchedSeasons, watched } from './library';
import type { Data, EpEntry, Entry, Meta, NewEntry, Status } from './types';

const COLS = [
  'media_id', 'source', 'media_type', 'title', 'image', 'season_number', 'episode_number', 'score',
  'status', 'notes', 'start_date', 'end_date', 'progress', 'created_at', 'progressed_at',
] as const;
type Row = Partial<Record<(typeof COLS)[number], string | number | null | undefined>>;

const TO_YT: Record<Status, string> = { completed: 'Completed', watching: 'In progress', planned: 'Planning', paused: 'Paused', dropped: 'Dropped' };
const FROM_YT: Record<string, Status> = { completed: 'completed', 'in progress': 'watching', planning: 'planned', paused: 'paused', dropped: 'dropped' };

const quote = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const stamp = (d?: string) => (d ? `${d} 12:00:00+00:00` : '');

// ---- Export ----

/** Yamtrack rows: one per movie watch; per TV show a show row, season rows and one row per episode. */
export function csvRows(data: Data): Row[] {
  const out: Row[] = [];
  const movies = data.entries.filter((e) => e.kind === 'movie').sort((a, b) => eEnd(a).localeCompare(eEnd(b)));
  for (const e of movies) {
    if (isEp(e)) continue;
    const m = getMeta(data, 'movie', e.ref);
    const d = stamp(e.date);
    out.push({ media_id: e.ref, source: 'tmdb', media_type: 'movie', title: m.title, image: m.img, score: e.score, status: 'Completed', notes: e.notes, start_date: d, end_date: d, progress: 1, created_at: d, progressed_at: d });
  }
  // Movies with a status but no watches (e.g. Planned).
  for (const [k, v] of Object.entries(data.status)) {
    const [kind, id] = k.split(':');
    if (kind !== 'movie' || data.entries.some((e) => e.kind === 'movie' && e.ref === +id)) continue;
    const m = getMeta(data, 'movie', +id);
    out.push({ media_id: id, source: 'tmdb', media_type: 'movie', title: m.title, image: m.img, status: TO_YT[v], progress: 0 });
  }

  for (const id of libIds(data, 'tv')) {
    const m = getMeta(data, 'tv', id);
    const es = data.entries.filter((e): e is EpEntry => e.kind === 'tv' && e.ref === id);
    const seasons = touchedSeasons(data, id);
    const sts = seasons.map((n) => statusOf(data, 'tv', id, n) ?? 'watching');
    const agg: Status = sts.includes('watching') ? 'watching' : sts.every((x) => x === 'completed') ? 'completed' : sts[0] ?? 'watching';
    const starts = es.map(eStart).sort();
    const ends = es.map(eEnd).sort();
    out.push({ media_id: id, source: 'tmdb', media_type: 'tv', title: m.title, image: m.img, status: TO_YT[agg], start_date: stamp(starts[0]), end_date: stamp(ends[ends.length - 1]) });
    for (const n of seasons) {
      const ses = es.filter((e) => e.season === n).sort((a, b) => a.epFrom - b.epFrom);
      const sEnds = ses.map(eEnd).sort();
      out.push({
        media_id: id, source: 'tmdb', media_type: 'season', title: m.title, image: m.img, season_number: n,
        score: data.rates[skey('tv', id, n)], status: TO_YT[statusOf(data, 'tv', id, n) ?? 'watching'],
        start_date: stamp(ses.map(eStart).sort()[0]), end_date: stamp(sEnds[sEnds.length - 1]),
        progress: watched(data, 'tv', id, n).size,
      });
      // Ranges export as one row per episode, dated with the range's end date.
      for (const e of ses) {
        for (let i = e.epFrom; i <= e.epTo; i++) {
          out.push({ media_id: id, source: 'tmdb', media_type: 'episode', title: m.title, season_number: n, episode_number: i, score: e.epFrom === e.epTo ? e.score : '', notes: e.notes, end_date: stamp(e.end), created_at: stamp(e.end) });
        }
      }
    }
  }
  return out;
}

export const csvHeader = () => COLS.map(quote).join(',');
export const csvLine = (r: Row) => COLS.map((c) => quote(r[c])).join(',');
export const toCsv = (rows: Row[]) => [csvHeader(), ...rows.map(csvLine)].join('\n') + '\n';

// ---- Import ----

export function parseCSV(t: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let f = '';
  let inq = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inq) {
      if (c === '"') {
        if (t[i + 1] === '"') { f += '"'; i++; } else inq = false;
      } else f += c;
    } else if (c === '"') inq = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      row.push(f); rows.push(row); row = []; f = '';
    } else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows.filter((r) => r.some((x) => x !== ''));
}

export type CsvImport = {
  add: Entry[];
  meta: Record<string, Partial<Meta>>;
  status: Record<string, Status>;
  rates: Record<string, number>;
  counts: { movie: number; tv: number; anime: number };
  dup: number;
  other: number;
};

/** Signature used to skip entries that are already logged. */
export const entrySig = (e: NewEntry | Entry) =>
  isEp(e as Entry)
    ? [e.kind, e.ref, (e as EpEntry).season ?? '', (e as EpEntry).epFrom, (e as EpEntry).epTo, eEnd(e as Entry)].join('|')
    : [e.kind, e.ref, eEnd(e as Entry)].join('|');

/**
 * Reads a Yamtrack CSV: movies, TV seasons and episodes, and anime. Games, books and manga are
 * skipped. Consecutive episodes watched on the same day with no rating or notes merge into one
 * range entry. Returns null when the file doesn't have Yamtrack's columns.
 */
export function readYamtrackCsv(text: string, data: Data, newId: () => string): CsvImport | null {
  const rows = parseCSV(text.replace(/^﻿/, ''));
  const head = (rows[0] ?? []).map((h) => h.trim());
  const ix = (k: string) => head.indexOf(k);
  if (ix('media_type') < 0 || ix('source') < 0 || ix('media_id') < 0) return null;
  const get = (r: string[], k: string) => (ix(k) < 0 ? '' : (r[ix(k)] ?? '').trim());

  const out: CsvImport = { add: [], meta: {}, status: {}, rates: {}, counts: { movie: 0, tv: 0, anime: 0 }, dup: 0, other: 0 };
  const seen = new Set(data.entries.map(entrySig));
  const push = (e: NewEntry) => {
    const sig = entrySig(e);
    if (seen.has(sig)) { out.dup++; return; }
    seen.add(sig);
    out.add.push({ id: newId(), ...e } as Entry);
    out.counts[e.kind] += isEp(e as Entry) ? (e as EpEntry).epTo - (e as EpEntry).epFrom + 1 : 1;
  };
  const addMeta = (k: string, m: Partial<Meta>) => {
    out.meta[k] = { ...m, ...out.meta[k] };
  };
  const episodes: Omit<EpEntry, 'id'>[] = [];

  for (const r of rows.slice(1)) {
    const type = get(r, 'media_type');
    const src = get(r, 'source');
    const id = +get(r, 'media_id');
    const s = get(r, 'score');
    const score = s === '' || Number.isNaN(parseFloat(s)) ? null : Math.min(10, Math.max(0, Math.round(parseFloat(s) * 2) / 2));
    const st = FROM_YT[get(r, 'status').toLowerCase()];
    const end = localDay(get(r, 'end_date') || get(r, 'progressed_at'));
    const start = localDay(get(r, 'start_date')) || end;
    const title = get(r, 'title');
    const img = get(r, 'image') || undefined;
    const notes = get(r, 'notes');
    if (!id) { out.other++; continue; }

    if (src === 'tmdb' && type === 'movie') {
      addMeta(`movie:${id}`, { title, img });
      if (end) push({ kind: 'movie', ref: id, date: end, score, notes });
      else if (st) out.status[`movie:${id}`] = st;
    } else if (src === 'tmdb' && type === 'tv') {
      addMeta(`tv:${id}`, { title, img });
    } else if (src === 'tmdb' && type === 'season') {
      const k = skey('tv', id, +get(r, 'season_number'));
      if (st) out.status[k] = st;
      if (score != null) out.rates[k] = score;
      addMeta(`tv:${id}`, { title });
    } else if (src === 'tmdb' && type === 'episode') {
      const ep = +get(r, 'episode_number');
      if (ep && end) episodes.push({ kind: 'tv', ref: id, season: +get(r, 'season_number'), epFrom: ep, epTo: ep, start: end, end, score, notes });
      else out.other++;
    } else if (src === 'mal' && type === 'anime') {
      const k = `anime:${id}`;
      addMeta(k, { title, img });
      if (st) out.status[k] = st;
      if (score != null) out.rates[k] = score;
      const progress = parseInt(get(r, 'progress'), 10);
      if (progress > 0 && end) push({ kind: 'anime', ref: id, epFrom: 1, epTo: progress, start, end, score: null, notes });
    } else out.other++;
  }

  // Merge runs of consecutive, unrated, note-less episodes watched the same day.
  episodes.sort((a, b) => a.ref - b.ref || (a.season ?? 0) - (b.season ?? 0) || a.epFrom - b.epFrom);
  let run: Omit<EpEntry, 'id'> | null = null;
  for (const e of episodes) {
    const plain = e.score == null && !e.notes;
    if (run && plain && run.ref === e.ref && run.season === e.season && run.end === e.end && run.epTo + 1 === e.epFrom) {
      run.epTo = e.epFrom;
      continue;
    }
    if (run) push(run);
    run = plain ? { ...e } : null;
    if (!plain) push(e);
  }
  if (run) push(run);

  return out;
}
