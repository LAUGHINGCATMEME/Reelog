import { useEffect, useRef, useState } from 'react';
import { clean } from './library';
import type { Data, Entry, EpEntry, Kind, LegacyMal, Meta, Settings, Sort, Status, Tier, TierList } from './types';

const DATA_KEY = 'reelog-v4';
const SETTINGS_KEY = 'reelog-settings';
/** Before AniList: anime keyed by MyAnimeList id. Read once, converted, and left in place as a fallback. */
const V3_KEY = 'reelog-v3';
const V1_KEY = 'reelog-v1';

export const EMPTY_DATA: Data = { entries: [], meta: {}, status: {}, rates: {} };
export const DEFAULT_SETTINGS: Settings = {
  // Keys are only ever entered in the app and stay on the device; never bake them into a build.
  tmdbKey: '',
  layout: 'list',
  rating: 'slider',
  groupAnime: true,
  theme: 'black',
  autoBackup: true,
  titles: 'english',
  animeFilms: 'anime',
  sort: { movie: 'recent', tv: 'recent', anime: 'recent' },
  tapHalf: 'down',
  publicScores: true,
  rewatchShades: false,
  groupEps: 'off',
  shareQuality: 6,
};

let uid = Date.now();
export const newId = (prefix = 'e') => prefix + (uid++).toString(36);

// ---- Reading and checking records ----

const STATUSES = new Set<Status>(['watching', 'planned', 'completed', 'paused', 'dropped']);
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isInt = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0;
const scoreOf = (v: unknown) => (typeof v === 'number' && v >= 0 && v <= 10 ? Math.round(v * 2) / 2 : null);

/**
 * Checks one entry from a backup or an old save and fills in what's optional (id, score, notes,
 * a single-day end date). Returns null for anything that isn't a valid entry.
 */
export function readEntry(x: unknown): Entry | null {
  if (!x || typeof x !== 'object') return null;
  const e = x as Record<string, unknown>;
  const ref = e.ref;
  if (!isInt(ref)) return null;
  const id = typeof e.id === 'string' && e.id ? e.id : newId('b');
  const base = { id, ref, score: scoreOf(e.score), notes: typeof e.notes === 'string' ? e.notes : '' };
  if (e.kind === 'movie') return isDate(e.date) ? { ...base, kind: 'movie', date: e.date } : null;
  if (e.kind !== 'tv' && e.kind !== 'anime') return null;
  const epFrom = e.epFrom;
  const epTo = e.epTo ?? epFrom;
  const start = e.start;
  const end = e.end ?? start;
  if (!isInt(epFrom) || !isInt(epTo) || epTo < epFrom || !isDate(start) || !isDate(end) || end < start) return null;
  if (e.kind === 'tv') {
    const season = e.season ?? 1;
    if (!Number.isInteger(season) || (season as number) < 0) return null;
    return { ...base, kind: 'tv', season: season as number, epFrom, epTo, start, end };
  }
  return { ...base, kind: 'anime', epFrom, epTo, start, end };
}

const readMap = <T,>(o: unknown, ok: (v: unknown) => v is T): Record<string, T> =>
  Object.fromEntries(Object.entries(o && typeof o === 'object' ? o : {}).filter(([, v]) => ok(v))) as Record<string, T>;
const isStatus = (v: unknown): v is Status => STATUSES.has(v as Status);
const isScore = (v: unknown): v is number => scoreOf(v) != null;
const isId = (v: unknown): v is number => isInt(v);
const isObj = (v: unknown): v is Partial<Meta> => !!v && typeof v === 'object';
const isNote = (v: unknown): v is string => typeof v === 'string' && !!v;
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

const KINDS: Kind[] = ['movie', 'tv', 'anime'];
const isTitleKey = (v: unknown): v is string => typeof v === 'string' && /^(movie|tv|anime):\d+$/.test(v);
const isColor = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

/** Checks tier lists from a backup: drops what's malformed, and keeps each title in one place only. */
function readTierLists(v: unknown): TierList[] {
  if (!Array.isArray(v)) return [];
  const now = new Date().toISOString();
  return v.flatMap((x): TierList[] => {
    if (!x || typeof x !== 'object') return [];
    const l = x as Record<string, unknown>;
    const seen = new Set<string>();
    const items = (a: unknown) => (Array.isArray(a) ? a : []).filter((k): k is string => isTitleKey(k) && !seen.has(k) && !!seen.add(k));
    const tiers = (Array.isArray(l.tiers) ? l.tiers : []).flatMap((t): Tier[] => {
      if (!t || typeof t !== 'object') return [];
      const r = t as Record<string, unknown>;
      return [{ id: str(r.id, 40) || newId('r'), label: str(r.label, 16), color: isColor(r.color) ? r.color : '#A0989A', items: items(r.items) }];
    });
    const kinds = KINDS.filter((k) => Array.isArray(l.kinds) && l.kinds.includes(k));
    const when = (s: unknown) => (typeof s === 'string' && !Number.isNaN(Date.parse(s)) ? s : now);
    return [{
      id: str(l.id, 40) || newId('t'),
      name: str(l.name, 60) || 'Tier list',
      kinds: kinds.length ? kinds : ['movie'],
      tiers,
      pool: items(l.pool),
      created: when(l.created),
      updated: when(l.updated),
    }];
  });
}

const CHOICES: Partial<Record<keyof Settings, readonly unknown[]>> = {
  layout: ['list', 'grid'],
  rating: ['slider', 'tap'],
  theme: ['system', 'black', 'oled', 'white'],
  titles: ['romaji', 'english'],
  animeFilms: ['anime', 'movies', 'both'],
  tapHalf: ['down', 'up'],
  groupEps: ['off', 'continuous', 'seasons'],
  shareQuality: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
};
const SORTS: readonly unknown[] = ['started', 'recent', 'rating', 'title'];

/** The valid settings among `keys` in `s` (a backup's or the saved ones); anything else is left out. */
function readSettings(s: Record<string, unknown>, keys: (keyof Settings)[]): Partial<Settings> {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    const v = s[k];
    if (k === 'sort') {
      const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
      out.sort = Object.fromEntries(KINDS.map((t) => [t, SORTS.includes(o[t]) ? (o[t] as Sort) : DEFAULT_SETTINGS.sort[t]]));
    } else if (CHOICES[k] ? CHOICES[k].includes(v) : typeof v === typeof DEFAULT_SETTINGS[k]) out[k] = v;
  }
  return out as Partial<Settings>;
}

/** The parts of a record that are about anime, split off so MAL ids can be converted. */
function splitAnime(d: Data): Data {
  const anime = (k: string) => k.startsWith('anime:');
  const pick = <T,>(o: Record<string, T>, keep: boolean) => Object.fromEntries(Object.entries(o).filter(([k]) => anime(k) === keep));
  const legacy: LegacyMal = {
    entries: d.entries.filter((e): e is EpEntry => e.kind === 'anime'),
    status: pick(d.status, true),
    rates: pick(d.rates, true),
    animeGroups: d.animeGroups ?? {},
    titles: Object.fromEntries(
      Object.entries(d.meta).flatMap(([k, m]) => (anime(k) && m.title ? [[k.split(':')[1], m.title]] : [])),
    ),
  };
  const has = legacy.entries.length || Object.keys(legacy.status).length || Object.keys(legacy.rates).length;
  return {
    entries: d.entries.filter((e) => e.kind !== 'anime'),
    meta: pick(d.meta, false),
    status: pick(d.status, false),
    rates: pick(d.rates, false),
    animeGroups: {},
    ...(has ? { legacyMal: legacy } : {}),
  };
}

type V1Data = {
  entries?: { tmdb: number; date?: string; score?: number | null; notes?: string }[];
  extra?: Record<string, { title?: string; year?: string | number; image?: string; director?: string; runtime?: number; genres?: string[]; detailed?: boolean }>;
};

/** Converts a v1 (movies-only) log or backup into the current shape. */
function fromV1(d: V1Data): Data {
  const entries = (d.entries ?? []).flatMap((e) => readEntry({ kind: 'movie', ref: e.tmdb, date: e.date, score: e.score, notes: e.notes }) ?? []);
  const meta: Record<string, Partial<Meta>> = {};
  for (const [id, m] of Object.entries(d.extra ?? {})) {
    meta[`movie:${id}`] = clean({
      title: m.title, year: m.year ? String(m.year) : '', img: m.image, director: m.director,
      runtime: m.runtime, genres: m.genres, full: m.detailed,
    });
  }
  return { entries, meta, status: {}, rates: {} };
}

/** Any saved record or backup body (v3 or v4) → Data. v3 anime are MAL ids, so they go to legacyMal. */
function readData(d: Record<string, unknown>, malAnime: boolean): Data {
  const out: Data = {
    entries: (Array.isArray(d.entries) ? d.entries : []).flatMap((e) => readEntry(e) ?? []),
    meta: readMap(d.meta, isObj),
    status: readMap(d.status, isStatus),
    rates: readMap(d.rates, isScore),
    notes: readMap(d.notes, isNote),
    groupRates: readMap(d.groupRates, isScore),
    groupNotes: readMap(d.groupNotes, isNote),
    animeGroups: readMap(d.animeGroups, isId),
    tierLists: readTierLists(d.tierLists),
  };
  if (malAnime) return { ...splitAnime(out), tierLists: out.tierLists };
  const lm = d.legacyMal as Record<string, unknown> | undefined;
  if (lm) {
    out.legacyMal = {
      entries: (Array.isArray(lm.entries) ? lm.entries : []).flatMap((e) => {
        const x = readEntry(e);
        return x?.kind === 'anime' ? [x] : [];
      }),
      status: readMap(lm.status, isStatus),
      rates: readMap(lm.rates, isScore),
      animeGroups: readMap(lm.animeGroups, isId),
      titles: readMap(lm.titles, (v): v is string => typeof v === 'string'),
    };
  }
  return out;
}

// ---- Local storage ----

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
  const v3 = read<Record<string, unknown>>(V3_KEY);
  if (v3) return readData(v3, true);
  const v1 = read<V1Data>(V1_KEY);
  return v1 ? fromV1(v1) : EMPTY_DATA;
}

function loadSettings(): Settings {
  // ratingInput is from older versions.
  const s = read<Record<string, unknown>>(SETTINGS_KEY) ?? {};
  return { ...DEFAULT_SETTINGS, ...readSettings({ rating: s.ratingInput, ...s }, Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) };
}

/** State saved to localStorage on every change. `onFail` hears about a save that didn't fit. */
function usePersisted<T>(key: string, load: () => T, onFail?: () => void) {
  const [value, setValue] = useState<T>(load);
  const failRef = useRef(onFail);
  failRef.current = onFail;
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      failRef.current?.();
    }
  }, [key, value]);
  return [value, setValue] as const;
}

export const useData = (onFail: () => void) => usePersisted(DATA_KEY, loadData, onFail);
export const useSettings = () => usePersisted(SETTINGS_KEY, loadSettings);

// ---- Backup file ----

export const BACKUP_VERSION = 4;

/** Settings that travel with a backup. API keys never do. */
const PORTABLE: (keyof Settings)[] = [
  'layout', 'rating', 'groupAnime', 'theme', 'autoBackup', 'titles', 'animeFilms', 'sort',
  'tapHalf', 'publicScores', 'rewatchShades', 'groupEps', 'shareQuality',
];

/** The one backup file: everything in the log, plus display settings. See docs/BACKUP.md. */
export function backupJson(data: Data, settings: Settings) {
  const { entries, status, rates, notes, groupRates, groupNotes, animeGroups, legacyMal, tierLists, meta } = data;
  return JSON.stringify(
    {
      app: 'reelog',
      version: BACKUP_VERSION,
      appVersion: __APP_VERSION__,
      exported: new Date().toISOString(),
      settings: Object.fromEntries(PORTABLE.map((k) => [k, settings[k]])),
      entries,
      status,
      rates,
      notes: notes ?? {},
      groupRates: groupRates ?? {},
      groupNotes: groupNotes ?? {},
      animeGroups: animeGroups ?? {},
      tierLists: tierLists ?? [],
      ...(legacyMal ? { legacyMal } : {}),
      meta,
    },
    null,
    1,
  );
}

export type Backup = { data: Data; settings: Partial<Settings>; version: number; skipped: number };

/** Parses a Reelog backup (this version, or a v3 or v1 one). Returns null if it isn't one. */
export function parseBackup(text: string): Backup | null {
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(text);
  } catch {
    return null;
  }
  if (!d || typeof d !== 'object' || d.app !== 'reelog' || !Array.isArray(d.entries)) return null;
  const version = typeof d.version === 'number' ? d.version : 1;
  const data = version < 3 ? fromV1(d as V1Data) : readData(d, version < 4);
  const s = (d.settings ?? {}) as Record<string, unknown>;
  // Only settings the file has: one from before a setting existed leaves that setting alone.
  const settings = readSettings(s, PORTABLE.filter((k) => k in s));
  const legacy = (d.legacyMal as { entries?: unknown } | undefined)?.entries;
  const total = (d.entries as unknown[]).length + (Array.isArray(legacy) ? legacy.length : 0);
  const kept = data.entries.length + (data.legacyMal?.entries.length ?? 0);
  return { data, settings, version, skipped: total - kept };
}

/** What makes two entries the same watch, for merging without duplicates. */
export const entrySig = (e: Entry) =>
  e.kind === 'movie'
    ? `movie|${e.ref}|${e.date}`
    : `${e.kind}|${e.ref}|${e.kind === 'tv' ? e.season : ''}|${e.epFrom}|${e.epTo}|${e.start}|${e.end}`;

/** `b` merged into `a`: new entries and tier lists added, `a` wins on statuses, ratings, notes and grouping. */
export function mergeData(a: Data, b: Data): { data: Data; added: number } {
  const lists = new Set((a.tierLists ?? []).map((l) => l.id));
  const seen = new Set(a.entries.map(entrySig));
  const add = b.entries.filter((e) => !seen.has(entrySig(e))).map((e) => ({ ...e, id: newId('b') }));
  const legacy = a.legacyMal || b.legacyMal
    ? {
        entries: [...(a.legacyMal?.entries ?? []), ...(b.legacyMal?.entries ?? [])],
        status: { ...b.legacyMal?.status, ...a.legacyMal?.status },
        rates: { ...b.legacyMal?.rates, ...a.legacyMal?.rates },
        animeGroups: { ...b.legacyMal?.animeGroups, ...a.legacyMal?.animeGroups },
        titles: { ...b.legacyMal?.titles, ...a.legacyMal?.titles },
      }
    : undefined;
  return {
    data: {
      entries: [...a.entries, ...add],
      meta: { ...b.meta, ...a.meta },
      status: { ...b.status, ...a.status },
      rates: { ...b.rates, ...a.rates },
      notes: { ...b.notes, ...a.notes },
      groupRates: { ...b.groupRates, ...a.groupRates },
      groupNotes: { ...b.groupNotes, ...a.groupNotes },
      animeGroups: { ...b.animeGroups, ...a.animeGroups },
      tierLists: [...(a.tierLists ?? []), ...(b.tierLists ?? []).filter((l) => !lists.has(l.id))],
      ...(legacy ? { legacyMal: legacy } : {}),
    },
    added: add.length,
  };
}
