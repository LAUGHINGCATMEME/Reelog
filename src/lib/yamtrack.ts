import type { Entry, Movie } from './types';

const COLS = [
  'media_id', 'source', 'media_type', 'title', 'image', 'season_number', 'episode_number', 'score',
  'status', 'notes', 'start_date', 'end_date', 'progress', 'created_at', 'progressed_at',
];

const quote = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

/** One row per watch, in Yamtrack's import format. */
export function toYamtrackCsv(entries: Entry[], movie: (id: number) => Movie) {
  const rows = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const lines = [COLS.map(quote).join(',')];
  for (const e of rows) {
    const m = movie(e.tmdb);
    const dt = e.date ? `${e.date} 12:00:00+00:00` : '';
    lines.push(
      [e.tmdb, 'tmdb', 'movie', m.title, m.image ?? '', '', '', e.score ?? '', 'Completed', e.notes, dt, dt, 1, dt, dt]
        .map(quote)
        .join(','),
    );
  }
  return lines.join('\n') + '\n';
}

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

export type CsvImport = { add: Entry[]; movies: Record<number, Movie>; dup: number; other: number };

/**
 * Reads movie rows from a Yamtrack CSV. Skips other media types and duplicates
 * (same movie + same date). Returns null when the file doesn't have Yamtrack's columns.
 */
export function readYamtrackCsv(
  text: string,
  existing: Entry[],
  known: (id: number) => boolean,
  newId: () => string,
): CsvImport | null {
  const rows = parseCSV(text.replace(/^﻿/, ''));
  const head = (rows[0] ?? []).map((h) => h.trim());
  const ix = (k: string) => head.indexOf(k);
  if (ix('media_type') < 0 || ix('source') < 0 || ix('media_id') < 0) return null;

  const get = (r: string[], k: string) => (ix(k) < 0 ? '' : (r[ix(k)] ?? '').trim());
  const seen = new Set(existing.map((x) => `${x.tmdb}|${x.date}`));
  const out: CsvImport = { add: [], movies: {}, dup: 0, other: 0 };

  for (const r of rows.slice(1)) {
    if (get(r, 'media_type') !== 'movie' || get(r, 'source') !== 'tmdb' || !get(r, 'media_id')) {
      out.other++;
      continue;
    }
    const tmdb = +get(r, 'media_id');
    const date = (get(r, 'end_date') || get(r, 'start_date') || get(r, 'progressed_at')).slice(0, 10);
    const k = `${tmdb}|${date}`;
    if (date && seen.has(k)) { out.dup++; continue; }
    seen.add(k);
    const s = get(r, 'score');
    const n = parseFloat(s);
    out.add.push({
      id: newId(),
      tmdb,
      date,
      score: s === '' || Number.isNaN(n) ? null : Math.min(10, Math.max(0, Math.round(n * 2) / 2)),
      notes: get(r, 'notes'),
    });
    if (!known(tmdb) && !out.movies[tmdb]) {
      out.movies[tmdb] = {
        id: tmdb,
        title: get(r, 'title') || `TMDB #${tmdb}`,
        year: '',
        genres: [],
        image: get(r, 'image') || undefined,
      };
    }
  }
  return out;
}
