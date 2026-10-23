import { useEffect, useState } from 'react';
import { clean } from './library';
import type { Data, Entry, Meta, Settings } from './types';

const DATA_KEY = 'reelog-v3';
const SETTINGS_KEY = 'reelog-settings';
const V1_KEY = 'reelog-v1';

export const EMPTY_DATA: Data = { entries: [], meta: {}, status: {}, rates: {} };
export const DEFAULT_SETTINGS: Settings = {
  // Keys are only ever entered in the app and stay on the device; never bake them into a build.
  tmdbKey: '',
  malKey: '',
  layout: 'list',
  rating: 'slider',
};

let uid = Date.now();
export const newId = (prefix = 'e') => prefix + (uid++).toString(36);

type V1Data = {
  entries?: { tmdb: number; date?: string; score?: number | null; notes?: string }[];
  extra?: Record<string, { title?: string; year?: string | number; image?: string; director?: string; runtime?: number; genres?: string[]; detailed?: boolean }>;
};

/** Converts a v1 (movies-only) log or backup into the current shape. */
export function fromV1(d: V1Data): Data {
  const entries: Entry[] = (d.entries ?? [])
    .filter((e) => typeof e.tmdb === 'number')
    .map((e) => ({ id: newId('m'), kind: 'movie', ref: e.tmdb, date: e.date ?? '', score: e.score ?? null, notes: e.notes ?? '' }));
  const meta: Record<string, Partial<Meta>> = {};
  for (const [id, m] of Object.entries(d.extra ?? {})) {
    meta[`movie:${id}`] = clean({
      title: m.title, year: m.year ? String(m.year) : '', img: m.image, director: m.director,
      runtime: m.runtime, genres: m.genres, full: m.detailed,
    });
  }
  return { entries, meta, status: {}, rates: {} };
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function loadData(): Data {
  const d = read<Data>(DATA_KEY);
  if (d) return { ...EMPTY_DATA, ...d };
  // First launch of v2: carry over the v1 movie log.
  const v1 = read<V1Data>(V1_KEY);
  return v1 ? fromV1(v1) : EMPTY_DATA;
}

function loadSettings(): Settings {
  const s = read<Partial<Settings> & { ratingInput?: Settings['rating'] }>(SETTINGS_KEY) ?? {};
  return { ...DEFAULT_SETTINGS, ...s, rating: s.rating ?? s.ratingInput ?? DEFAULT_SETTINGS.rating };
}

function usePersisted<T>(key: string, load: () => T) {
  const [value, setValue] = useState<T>(load);
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage full or blocked — keep working in memory */
    }
  }, [key, value]);
  return [value, setValue] as const;
}

export const useData = () => usePersisted(DATA_KEY, loadData);
export const useSettings = () => usePersisted(SETTINGS_KEY, loadSettings);

// ---- JSON backup ----

export function backupJson(data: Data) {
  return JSON.stringify({ app: 'reelog', version: 3, exported: new Date().toISOString(), ...data }, null, 2);
}

/** Parses a Reelog backup (v3, or a v1 movie backup). Returns null if it isn't one. */
export function parseBackup(text: string): Data | null {
  let d: (Partial<Data> & V1Data & { app?: string; version?: number }) | null = null;
  try {
    d = JSON.parse(text);
  } catch {
    return null;
  }
  if (!d || d.app !== 'reelog' || !Array.isArray(d.entries)) return null;
  if ((d.version ?? 1) < 3) return fromV1(d);
  return {
    entries: (d.entries as Entry[]).filter((e) => e && typeof e.ref === 'number' && e.kind),
    meta: d.meta ?? {},
    status: d.status ?? {},
    rates: d.rates ?? {},
  };
}
