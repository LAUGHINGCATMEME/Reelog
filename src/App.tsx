import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { blankSheet, DEFAULT_SCORE, LogSheet, type SheetState } from './components/LogSheet';
import {
  closeTopLayer, Dialog, type DialogSpec, Icon, Logo, NavBar, OverlayHost, Toast, useLayerCount, useToast,
} from './components/ui';
import { clearDetails } from './lib/details';
import { useEnricher } from './lib/enrich';
import { groupAnime, knownAnime, type AnimeGroup } from './lib/groups';
import { fmtDate, parseDate, plural, todayIso } from './lib/format';
import {
  clean, dateLabel, entriesOf, epLabel, epShort, getMeta, isEp, isFilm, libIds, mkey, nextEpisode, setEnglishTitles, showTitle, skey, SMAP,
  statusAfterLog, tapRange, total, upNext, watched, type UpNext,
} from './lib/library';
import { applyLegacy, lookupLegacy } from './lib/migrate';
import { buzz, isNative, onBackground, onNativeBack, saveFile, setSystemBars, writeAutoBackup } from './lib/native';
import { keepPoster } from './lib/posters';
import { shelf } from './lib/shelf';
import { backupJson, EMPTY_DATA, mergeData, newId, parseBackup, useData, useSettings } from './lib/store';
import { addItems } from './lib/tiers';
import type {
  EpEntry, EpKind, Entry, Filter, Kind, Meta, MovieEntry, NewEntry, Route, SearchHit, Status, Tab, TierList,
} from './lib/types';
import { AnimeGroupDetail, Episodes, FilmDetail, MovieDetail, ShowDetail, type PartOf } from './screens/Detail';
import { Diary } from './screens/Diary';
import { Library, TAB } from './screens/Library';
import { Search } from './screens/Search';
import { Settings, type LastBackup } from './screens/Settings';
import { Stats } from './screens/Stats';
import { TierEdit, TierLists, TierPicker, type Candidate } from './screens/Tiers';

type TabFilter = Omit<Filter, 'sort'>;
const DEFAULT_FILTER: TabFilter = { status: 'all', genre: null };
const CLOSED: SheetState = { ...blankSheet({ mode: 'movie', kind: 'movie', ref: 0 }), open: false };
const rootOf = (t: Tab): Route => (t === 'settings' ? { s: 'settings' } : { s: 'lib' });
const LAST_BACKUP_KEY = 'reelog-last-backup';
/** Screens reached from Settings: the Settings tab stays lit on them. */
const UNDER_SETTINGS = new Set<Route['s']>(['settings', 'stats', 'diary', 'tiers', 'tier', 'tierpick']);

/** Background colour of each theme, for the system bars and the browser's theme-color. */
const THEME_BG = { black: '#0C0A0A', oled: '#000000', white: '#F8F5F5' } as const;

/** A quick fingerprint of the log, to tell whether anything changed since the last auto-backup. */
function fingerprint(text: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return `${text.length}:${(h >>> 0).toString(36)}`;
}

function readLastBackup(): (NonNullable<LastBackup> & { sig: string }) | null {
  try {
    return JSON.parse(localStorage.getItem(LAST_BACKUP_KEY) ?? 'null');
  } catch {
    return null;
  }
}

export default function App() {
  const [toast, showToast, hideToast] = useToast();
  // Saving fails only when storage is full; say so instead of losing changes on the next launch.
  const warnedFull = useRef(false);
  const [data, setData] = useData(() => {
    if (warnedFull.current) return;
    warnedFull.current = true;
    showToast("Storage is full: changes won't be kept. Export a backup now.", true);
  });
  const [settings, setSettings] = useSettings();
  // Before anything below reads a title.
  setEnglishTitles(settings.titles === 'english');
  const [tab, setTab] = useState<Tab>('movie');
  const [stack, setStack] = useState<Route[]>([{ s: 'lib' }]);
  const [filters, setFilters] = useState<Record<Kind, TabFilter>>({ movie: DEFAULT_FILTER, tv: DEFAULT_FILTER, anime: DEFAULT_FILTER });
  const [sheet, setSheet] = useState<SheetState>(CLOSED);
  const [dlg, setDlg] = useState<DialogSpec | null>(null);
  const [dlgOpen, setDlgOpen] = useState(false);
  const [splash, setSplash] = useState(true);
  const [overlays, setOverlays] = useState<HTMLDivElement | null>(null);
  const layers = useLayerCount();
  const scrollRef = useRef<HTMLDivElement>(null);
  const route = stack[stack.length - 1];
  const libKind: Kind = tab === 'settings' ? 'movie' : tab;

  const { ensure, ensureTitles, loading } = useEnricher(data, setData, settings);

  useEffect(() => {
    const t = window.setTimeout(() => setSplash(false), 650);
    return () => window.clearTimeout(t);
  }, []);

  // Fetch missing details for everything in the library (and again once a key is added).
  useEffect(() => {
    for (const k of ['movie', 'tv'] as const) for (const id of libIds(data, k)) ensure(k, id);
  }, [data.entries, data.status, settings.tmdbKey, ensure]);
  // Anime also follow sequel/prequel links outward, so whole franchises get found. Ones saved
  // before Reelog kept English titles get theirs.
  useEffect(() => {
    const ids = settings.groupAnime ? knownAnime(data) : libIds(data, 'anime');
    for (const id of ids) ensure('anime', id);
    ensureTitles(ids);
  }, [data.entries, data.status, data.meta, data.animeGroups, settings.groupAnime, ensure, ensureTitles]);

  // Anime from before AniList: match their MAL ids to AniList ids (once per launch, when online).
  const converting = useRef(false);
  useEffect(() => {
    if (!data.legacyMal || converting.current) return;
    converting.current = true;
    lookupLegacy(data.legacyMal)
      .then((c) => {
        setData((d) => applyLegacy(d, c));
        if (c.map.size) showToast(`Moved ${plural(c.map.size, 'anime', 'anime')} to AniList`);
      })
      .catch(() => { converting.current = false; });
  }, [data.legacyMal]);

  // ---- Theme ----
  const [systemLight, setSystemLight] = useState(() => matchMedia('(prefers-color-scheme: light)').matches);
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: light)');
    const on = () => setSystemLight(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const theme = settings.theme === 'system' ? (systemLight ? 'white' : 'black') : settings.theme;
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.style.colorScheme = theme === 'white' ? 'light' : 'dark';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_BG[theme]);
    setSystemBars(THEME_BG[theme], theme === 'white');
  }, [theme]);

  // ---- Auto-backup (Android app) ----
  // Written when the app goes to the background, if the log changed since the last one.
  const [lastBackup, setLastBackup] = useState(readLastBackup);
  const dataNow = useRef(data);
  dataNow.current = data;
  const settingsNow = useRef(settings);
  settingsNow.current = settings;
  const backingUp = useRef(false);
  const autoBackup = useCallback(async (force = false) => {
    const d = dataNow.current;
    const s = settingsNow.current;
    if (!isNative || backingUp.current || (!force && !s.autoBackup)) return;
    if (!d.entries.length && !Object.keys(d.status).length && !d.legacyMal && !d.tierLists?.length) return;
    const { meta: _m, ...log } = d;
    const sig = fingerprint(JSON.stringify(log));
    if (!force && readLastBackup()?.sig === sig) return;
    backingUp.current = true;
    try {
      const name = await writeAutoBackup(todayIso(), backupJson(d, s));
      const rec = { at: new Date().toISOString(), name, sig };
      localStorage.setItem(LAST_BACKUP_KEY, JSON.stringify(rec));
      setLastBackup(rec);
      if (force) showToast(`Saved ${name}`);
    } catch {
      if (force) info('Backup failed', "Couldn't write to Documents/Reelog. Use Export to save a backup instead.");
    }
    backingUp.current = false;
  }, []);
  useEffect(() => onBackground(() => void autoBackup()), [autoBackup]);
  // Also once shortly after launch, in case the app was closed before it could write one.
  useEffect(() => {
    const t = window.setTimeout(() => void autoBackup(), 8000);
    return () => window.clearTimeout(t);
  }, [autoBackup]);

  const grouping = useMemo(
    () => groupAnime(data, settings.groupAnime),
    [data.meta, data.entries, data.status, data.rates, data.animeGroups, settings.groupAnime],
  );
  const groups = settings.groupAnime ? grouping.groups : undefined;

  // Keep every poster in the library saved on the device (Android app), not just the ones seen.
  useEffect(() => {
    for (const k of ['movie', 'tv'] as const) {
      for (const id of libIds(data, k)) {
        const m = getMeta(data, k, id);
        keepPoster(m.img);
        for (const s of m.seasons ?? []) keepPoster(s.img);
      }
    }
    for (const g of grouping.groups) for (const id of g.ids) keepPoster(getMeta(data, 'anime', id).img);
  }, [data.meta, data.entries, data.status, grouping]);

  // ---- Navigation ----
  // Each screen in the stack remembers where it was scrolled, and so does each tab's root,
  // so going back lands where you left off. Positions are applied right after the new screen renders.
  const stackY = useRef<number[]>([]);
  const tabY = useRef<Partial<Record<Tab, number>>>({});
  const pendingY = useRef<number | null>(null);
  const [anim, setAnim] = useState<{ n: number; dir: 'fwd' | 'back' | 'tab' | 'none' }>({ n: 0, dir: 'none' });
  const scrollTop = () => scrollRef.current?.scrollTop ?? 0;
  const moved = (dir: 'fwd' | 'back' | 'tab', y: number) => {
    pendingY.current = y;
    setAnim((a) => ({ n: a.n + 1, dir }));
  };
  useLayoutEffect(() => {
    if (pendingY.current == null || !scrollRef.current) return;
    scrollRef.current.scrollTop = pendingY.current;
    pendingY.current = null;
  });

  const onScreen = useCallback((r: Route) => {
    if (r.s === 'movie') ensure('movie', r.id, true);
    if (r.s === 'show') ensure('tv', r.id, true);
    if (r.s === 'eps') ensure(r.kind, r.ref, true);
    if (r.s === 'agroup') for (const id of grouping.of.get(r.id)?.ids ?? [r.id]) ensure('anime', id, true);
  }, [ensure, grouping]);
  const go = (r: Route) => {
    stackY.current[stack.length - 1] = scrollTop();
    setStack((s) => [...s, r]);
    moved('fwd', 0);
    onScreen(r);
  };
  const swap = (r: Route) => { setStack((s) => [...s.slice(0, -1), r]); moved('fwd', 0); onScreen(r); };
  const back = () => {
    if (stack.length < 2) return;
    setStack(stack.slice(0, -1));
    moved('back', stackY.current[stack.length - 2] ?? 0);
  };
  const tabGo = (t: Tab, filter?: Partial<TabFilter>) => {
    const atRoot = stack.length === 1;
    if (filter && t !== 'settings') setFilters((f) => ({ ...f, [t]: { ...f[t], ...filter } }));
    if (t === tab && atRoot) {
      // Tapping the tab you're on goes back to the top.
      scrollRef.current?.scrollTo({ top: 0, behavior: filter ? 'auto' : 'smooth' });
      return;
    }
    tabY.current[tab] = atRoot ? scrollTop() : stackY.current[0] ?? 0;
    setTab(t);
    setStack([rootOf(t)]);
    // A new filter shows a different list, so start that one at the top.
    moved(t === tab ? 'back' : 'tab', filter ? 0 : tabY.current[t] ?? 0);
  };
  const setQuery = (q: string) =>
    setStack((s) => {
      const top = s[s.length - 1];
      return top.s === 'search' ? [...s.slice(0, -1), { ...top, q }] : s;
    });
  const openTitle = (kind: Kind, id: number) =>
    go(kind === 'movie' ? { s: 'movie', id } : kind === 'tv' ? { s: 'show', id } : { s: 'eps', kind: 'anime', ref: id });
  // Library rows open an anime's group when it has more than one member.
  const openLib = (kind: Kind, id: number) =>
    kind === 'anime' && (grouping.of.get(id)?.ids.length ?? 0) > 1 ? go({ s: 'agroup', id }) : openTitle(kind, id);
  const openNext = (u: UpNext) => (u.kind === 'tv' ? go({ s: 'eps', kind: 'tv', ref: u.ref, season: u.season }) : openTitle('anime', u.ref));
  const openEntry = (e: Entry) =>
    isEp(e) && e.kind === 'tv' ? go({ s: 'eps', kind: 'tv', ref: e.ref, season: e.season }) : openTitle(e.kind, e.ref);

  const closeSheet = useCallback(() => setSheet((s) => ({ ...s, open: false })), []);
  const patchSheet = useCallback((p: Partial<SheetState>) => setSheet((s) => ({ ...s, ...p })), []);
  const info = (title: string, body: string) => { setDlg({ title, body }); setDlgOpen(true); };
  const confirm = (title: string, body: string, okLabel: string, onOk: () => void) => {
    setDlg({ title, body, okLabel, onOk: () => { setDlgOpen(false); onOk(); } });
    setDlgOpen(true);
  };

  // Android back button / browser back closes the top layer first.
  const backRef = useRef<() => boolean>(() => false);
  backRef.current = () => {
    if (dlgOpen) return setDlgOpen(false), true;
    if (sheet.open) return closeSheet(), true;
    if (closeTopLayer()) return true;
    if (stack.length > 1) return back(), true;
    if (tab !== 'movie') return tabGo('movie'), true;
    return false;
  };
  // Hold one history entry while anything is above the Movies root; it's pushed right after
  // the tap that opened it, since browsers skip entries added without user activation.
  const trapped = useRef(false);
  const ignorePop = useRef(false);
  const isRoot = tab === 'movie' && stack.length === 1 && !sheet.open && !dlgOpen && !layers;
  useEffect(() => {
    if (isNative) return; // the Android app gets the hardware button directly
    if (!isRoot && !trapped.current) {
      history.pushState({ reelog: true }, '');
      trapped.current = true;
    } else if (isRoot && trapped.current) {
      trapped.current = false;
      ignorePop.current = true;
      history.back();
    }
  });
  useEffect(() => {
    const onPop = () => {
      if (ignorePop.current) { ignorePop.current = false; return; }
      trapped.current = false;
      backRef.current();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && backRef.current();
    addEventListener('popstate', onPop);
    addEventListener('keydown', onKey);
    const offNative = onNativeBack(() => backRef.current());
    return () => {
      offNative();
      removeEventListener('popstate', onPop);
      removeEventListener('keydown', onKey);
    };
  }, []);

  // ---- Data helpers ----
  const mergeMeta = (k: string, m: Partial<Meta>) =>
    setData((d) => ({ ...d, meta: { ...d.meta, [k]: { ...d.meta[k], ...clean(m) } } }));
  const setStatus = (key: string, v: Status) =>
    setData((d) => {
      const status = { ...d.status };
      if (status[key] === v) delete status[key];
      else status[key] = v;
      return { ...d, status };
    });
  const hitMeta = (kind: Kind, h: SearchHit): Partial<Meta> =>
    kind === 'anime'
      ? { title: h.title, titleEn: h.titleEn, year: h.year, img: h.img, episodes: h.episodes, genres: h.genres, type: h.type, dur: h.dur, start: h.start, idMal: h.idMal }
      : { title: h.title, year: h.year, img: h.img };
  const filmOf = (kind: Kind, ref: number) => kind === 'anime' && isFilm(getMeta(data, 'anime', ref));
  /** Sets or (with null) clears a title rating. */
  const withRate = (rates: Record<string, number>, key: string, v: number | null) => {
    const r = { ...rates };
    if (v == null) delete r[key];
    else r[key] = v;
    return r;
  };

  // ---- Sheet ----
  const logMovie = (ref: number, e?: MovieEntry) =>
    setSheet(e
      ? blankSheet({ mode: 'movie', kind: 'movie', ref, entryId: e.id, start: e.date, startText: fmtDate(e.date), score: e.score ?? DEFAULT_SCORE, hasScore: e.score != null, notes: e.notes })
      : blankSheet({ mode: 'movie', kind: 'movie', ref }));

  // An anime film is logged like a movie; its rating is the anime's, so the sheet shows that one.
  const logFilm = (ref: number, e?: EpEntry) => {
    const r = data.rates[skey('anime', ref)];
    const rating = { score: r ?? DEFAULT_SCORE, hasScore: r != null };
    setSheet(e
      ? blankSheet({ mode: 'movie', kind: 'anime', ref, entryId: e.id, start: e.end, startText: fmtDate(e.end), notes: e.notes, ...rating })
      : blankSheet({ mode: 'movie', kind: 'anime', ref, ...rating }));
  };

  const logEps = (kind: EpKind, ref: number, season?: number, e?: EpEntry, ep?: number) => {
    if (e) {
      const range = e.epFrom !== e.epTo || e.start !== e.end;
      setSheet(blankSheet({
        mode: 'eps', kind, ref, season, entryId: e.id, epMode: range ? 'range' : 'single',
        epFrom: String(e.epFrom), epTo: String(e.epTo), start: e.start, startText: fmtDate(e.start), end: e.end, endText: fmtDate(e.end),
        score: e.score ?? DEFAULT_SCORE, hasScore: e.score != null, notes: e.notes,
      }));
      return;
    }
    if (ep == null) {
      const n = nextEpisode(data, kind, ref, season);
      setSheet(blankSheet({ mode: 'eps', kind, ref, season, epFrom: String(n), epTo: String(n) }));
      return;
    }
    // Tapping an episode further on logs everything up to it (watched 1–5, tap 9 → 6–9).
    const [from, to] = tapRange(watched(data, kind, ref, season), ep);
    setSheet(blankSheet({ mode: 'eps', kind, ref, season, epMode: from < to ? 'range' : 'single', epFrom: String(from), epTo: String(to) }));
  };

  const rate = (kind: EpKind, ref: number, season?: number) => {
    const v = data.rates[skey(kind, ref, season)];
    setSheet(blankSheet({ mode: 'rate', kind, ref, season, score: v ?? DEFAULT_SCORE, hasScore: v != null }));
  };

  const saveSheet = () => {
    const s = sheet;
    const today = todayIso();
    const key = skey(s.kind, s.ref, s.season);
    const title = getMeta(data, s.kind, s.ref).title;
    const film = s.mode === 'movie' && s.kind === 'anime';

    if (s.mode === 'rate') {
      setData((d) => {
        const status = { ...d.status };
        // Rating something you haven't logged means you've seen it.
        if (s.hasScore && !status[key] && !entriesOf(d, s.kind, s.ref, s.season).length) status[key] = 'completed';
        return { ...d, rates: withRate(d.rates, key, s.hasScore ? s.score : null), status };
      });
      closeSheet();
      showToast(s.hasScore ? 'Rating saved' : 'Rating cleared');
      return;
    }

    const a = parseDate(s.startText);
    if (!a || a > today) return info('Check the date', 'Enter a valid past date as DD/MM/YYYY.');
    const range = s.mode === 'eps' && s.epMode === 'range';
    let b = a;
    if (range) {
      const p = parseDate(s.endText);
      if (!p || p > today) return info('Check the finish date', 'Enter a valid past date as DD/MM/YYYY.');
      if (p < a) return info('Check the dates', 'The finish date is before the start date.');
      b = p;
    }
    const score = s.hasScore ? s.score : null;
    const notes = s.notes.trim();

    let val: NewEntry;
    if (s.mode === 'movie' && s.kind === 'movie') {
      val = { kind: 'movie', ref: s.ref, date: a, score, notes };
    } else if (film) {
      const old = data.entries.find((x): x is EpEntry => x.id === s.entryId && isEp(x));
      // Left on the same day, a watch logged over several days keeps its start.
      const start = old && old.end === a ? old.start : a;
      val = { kind: 'anime', ref: s.ref, epFrom: old?.epFrom ?? 1, epTo: old?.epTo ?? 1, start, end: a, score: old?.score ?? null, notes };
    } else {
      const tot = total(data, s.kind, s.ref, s.season);
      const f = parseInt(s.epFrom, 10);
      const t = range ? parseInt(s.epTo, 10) : f;
      if (!(f >= 1) || !(t >= f) || (tot && t > tot)) {
        return info('Check the episodes', tot ? `Pick episodes between 1 and ${tot}, with the last one after the first.` : 'The last episode must be the same as or after the first.');
      }
      val = { kind: s.kind as EpKind, ref: s.ref, epFrom: f, epTo: t, start: a, end: b, score, notes, ...(s.kind === 'tv' ? { season: s.season } : {}) };
    }

    // Status follows logging: a new watch completes a movie or film; episodes mark it Watching,
    // then Completed once every episode is in.
    const newStatus = s.entryId ? null : statusAfterLog(data, val);

    setData((d) => ({
      ...d,
      entries: s.entryId
        ? d.entries.map((e) => (e.id === s.entryId ? ({ ...e, ...val } as Entry) : e))
        : [...d.entries, { id: newId(), ...val } as Entry],
      status: newStatus ? { ...d.status, [key]: newStatus } : d.status,
      // A film's rating is the anime's own.
      rates: film ? withRate(d.rates, key, score) : d.rates,
    }));
    closeSheet();

    if (s.mode === 'movie') {
      showToast(s.entryId ? 'Entry updated' : `Logged ${title}`);
      if (!film && route.s === 'search') swap({ s: 'movie', id: s.ref });
      else if (!film && route.s !== 'movie') go({ s: 'movie', id: s.ref });
    } else {
      const v = val as Omit<EpEntry, 'id'>;
      showToast(s.entryId ? 'Entry updated' : `Logged ${s.kind === 'tv' ? `S${s.season} ` : ''}${epShort(v as EpEntry)}${newStatus ? ` · ${SMAP[newStatus].label}` : ''}`);
    }
  };

  // Up next: the next episode, dated today, in one tap (with Undo instead of a sheet).
  const plusOne = (u: UpNext) => {
    const today = todayIso();
    const n = nextEpisode(data, u.kind, u.ref, u.season);
    const val: NewEntry = { kind: u.kind, ref: u.ref, epFrom: n, epTo: n, start: today, end: today, score: null, notes: '', ...(u.kind === 'tv' ? { season: u.season } : {}) };
    const key = skey(u.kind, u.ref, u.season);
    const st = statusAfterLog(data, val);
    const prev = data.status[key];
    const id = newId();
    setData((d) => ({ ...d, entries: [...d.entries, { id, ...val } as Entry], status: st ? { ...d.status, [key]: st } : d.status }));
    buzz();
    const sn = u.kind === 'tv' ? `S${u.season} ` : '';
    showToast(`Logged ${sn}E${n}${st === 'completed' ? ' · Completed' : ''} · ${getMeta(data, u.kind, u.ref).title}`, false, {
      label: 'Undo',
      onClick: () =>
        setData((d) => {
          const status = { ...d.status };
          if (st) {
            if (prev) status[key] = prev;
            else delete status[key];
          }
          return { ...d, entries: d.entries.filter((e) => e.id !== id), status };
        }),
    });
  };

  const deleteEntry = () => {
    const s = sheet;
    const e = data.entries.find((x) => x.id === s.entryId);
    if (!e) return;
    const single = e.kind === 'movie' || filmOf(e.kind, e.ref);
    const key = skey(e.kind, e.ref, isEp(e) ? e.season : undefined);
    confirm('Delete this entry?', `${isEp(e) && !single ? `${epLabel(e)} · ` : ''}${dateLabel(e)}. This can't be undone.`, 'Delete', () => {
      const left = data.entries.some((x) => x.id !== e.id && x.kind === e.kind && x.ref === e.ref);
      setData((d) => {
        const status = { ...d.status };
        // The last watch of a movie or film gone: drop the "Completed" that logging set.
        if (single && !left && status[key] === 'completed') delete status[key];
        return { ...d, entries: d.entries.filter((x) => x.id !== e.id), status };
      });
      closeSheet();
      showToast('Entry deleted');
      const st = data.status[key];
      if (e.kind === 'movie' && !left && (!st || st === 'completed')) back();
    });
  };

  const removeTitle = (kind: Kind, ref: number, season: number | undefined, label: string) => {
    const n = entriesOf(data, kind, ref, season).length;
    const match = (k: string) => (kind === 'tv' && season == null ? k.startsWith(`tv:${ref}:`) : k === skey(kind, ref, season));
    const strip = <T,>(o: Record<string, T>) => Object.fromEntries(Object.entries(o).filter(([k]) => !match(k)));
    confirm(`Remove ${label}?`, `This deletes ${plural(n, 'entry', 'entries')}, the status and rating. It can't be undone.`, 'Remove', () => {
      setData((d) => ({
        ...d,
        entries: d.entries.filter((e) => !(e.kind === kind && e.ref === ref && (kind !== 'tv' || season == null || (e as EpEntry).season === season))),
        status: strip(d.status),
        rates: strip(d.rates),
      }));
      showToast(`Removed ${label}`);
      back();
    });
  };

  // ---- Anime groups ----
  const setGroups = (f: (g: Record<string, number>) => void) =>
    setData((d) => {
      const animeGroups = { ...d.animeGroups };
      f(animeGroups);
      return { ...d, animeGroups };
    });
  const animeTitle = (id: number) => getMeta(data, 'anime', id).title;
  const splitAnime = (g: AnimeGroup, id: number) => {
    // Anime moved here by pointing at this one now point at a member that stays.
    const stay = g.ids.find((x) => x !== id && data.animeGroups?.[x] == null) ?? g.ids.find((x) => x !== id);
    setGroups((m) => {
      for (const [k, v] of Object.entries(m)) if (v === id && +k !== id && stay != null) m[k] = stay;
      m[id] = id;
    });
    showToast(`Split out ${animeTitle(id)}`);
  };
  const resetAnime = (id: number) => {
    setGroups((m) => void delete m[id]);
    showToast(`Moved ${animeTitle(id)} back`);
  };
  const mergeAnime = (g: AnimeGroup, other: AnimeGroup) => {
    const anchor = g.ids.find((x) => data.animeGroups?.[x] == null) ?? g.root;
    setGroups((m) => { for (const id of other.ids) m[id] = anchor; });
    showToast(`Added ${animeTitle(other.root)}`);
  };
  /** The "Part of" link on an anime's page, when its group has others and you didn't come from it. */
  const partOf = (id: number): PartOf | undefined => {
    const g = grouping.of.get(id);
    if (!g || g.ids.length < 2 || stack.some((x) => x.s === 'agroup' && g.ids.includes(x.id))) return undefined;
    return { title: getMeta(data, 'anime', g.root).title, n: g.ids.length, onOpen: () => go({ s: 'agroup', id }) };
  };

  // ---- Tier lists ----
  const lists = data.tierLists ?? [];
  const updateList = (id: string, f: (l: TierList) => TierList) =>
    setData((d) => ({ ...d, tierLists: (d.tierLists ?? []).map((l) => (l.id === id ? { ...f(l), updated: new Date().toISOString() } : l)) }));
  const createList = (l: TierList) => {
    setData((d) => ({ ...d, tierLists: [l, ...(d.tierLists ?? [])] }));
    go({ s: 'tier', id: l.id });
  };
  const deleteList = (l: TierList) =>
    confirm(`Delete “${l.name}”?`, "The list goes; the titles in it stay in your library. This can't be undone.", 'Delete', () => {
      back();
      setData((d) => ({ ...d, tierLists: (d.tierLists ?? []).filter((x) => x.id !== l.id) }));
      showToast('Tier list deleted');
    });
  /** What a list of these kinds can rank: library titles as their tabs list them. */
  const candidates = (kinds: Kind[]): Candidate[] => kinds.flatMap((k) => shelf(data, k, settings.animeFilms, groups).map((x) => ({ tab: k, x })));

  // ---- Backup ----
  const share = async (name: string, text: string, type: string) => {
    try {
      if ((await saveFile(name, text, type)) && !isNative) showToast(`Saved ${name}`);
    } catch {
      info('Export failed', `Couldn't save ${name}.`);
    }
  };

  const onRestoreFile = async (f: File) => {
    const b = parseBackup(await f.text());
    if (!b) return info('Not a Reelog backup', 'Pick a .json file exported from Reelog.');
    const n = b.data.entries.length + (b.data.legacyMal?.entries.length ?? 0);
    const when = b.version < 4 ? '\nIt was made before Reelog moved to AniList: its anime are matched to AniList in the background.' : '';
    const bad = b.skipped ? `\n${plural(b.skipped, 'entry', 'entries')} in it aren't valid and will be skipped.` : '';
    const tl = b.data.tierLists?.length ? ` and ${plural(b.data.tierLists.length, 'tier list')}` : '';
    setDlg({
      title: 'Restore backup',
      body: `${plural(n, 'entry', 'entries')}${tl} in this file.${when}${bad}\n\nReplace deletes what's on this device first. Merge adds what's new and keeps your statuses and ratings where both have one.`,
      okLabel: 'Replace',
      onOk: () => {
        setDlgOpen(false);
        setData({ ...b.data, meta: { ...data.meta, ...b.data.meta } });
        setSettings((s) => ({ ...s, ...b.settings }));
        converting.current = false;
        showToast(`Restored ${plural(n, 'entry', 'entries')}`);
      },
      alt: {
        label: 'Merge',
        onClick: () => {
          setDlgOpen(false);
          const r = mergeData(data, b.data);
          setData(r.data);
          converting.current = false;
          showToast(`Added ${plural(r.added, 'entry', 'entries')}`);
        },
      },
    });
    setDlgOpen(true);
  };

  const refreshDetails = () =>
    confirm('Refresh title details?', 'Posters, episode counts, seasons and cast are fetched again in the background. Your log is not changed.', 'Refresh', () => {
      clearDetails();
      setData((d) => ({ ...d, meta: Object.fromEntries(Object.entries(d.meta).map(([k, m]) => [k, { ...m, full: false }])) }));
      showToast('Refreshing details');
    });

  const eraseAll = () =>
    confirm('Erase all data?', `Deletes all ${plural(data.entries.length, 'entry', 'entries')}, statuses, ratings and tier lists from this device. Export a backup first if you want to keep them.`, 'Erase', () => {
      setData(EMPTY_DATA);
      clearDetails();
      showToast('All data erased');
    });

  // ---- Render ----
  const sheetMeta = getMeta(data, sheet.kind, sheet.ref);
  const navTab: Tab = UNDER_SETTINGS.has(route.s) ? 'settings' : tab;
  const genreGo = (kind: Kind, g: string) => tabGo(kind, { genre: g, status: 'all' });
  const statusChange = (key: string, s: Status) => setStatus(key, s);

  return (
    <OverlayHost value={overlays}>
      <div className="app">
        <div className="scroll" ref={scrollRef}>
          <div key={anim.n} className="page" data-anim={anim.dir}>
            {route.s === 'lib' && (
              <Library
                kind={libKind}
                data={data}
                titles={shelf(data, libKind, settings.animeFilms, groups)}
                upNext={libKind === 'movie' ? [] : upNext(data, libKind)}
                filter={{ ...filters[libKind], sort: settings.sort[libKind] }}
                layout={settings.layout}
                onFilter={({ sort, ...p }) => {
                  if (sort) setSettings((s) => ({ ...s, sort: { ...s.sort, [libKind]: sort } }));
                  if (Object.keys(p).length) setFilters((f) => ({ ...f, [libKind]: { ...f[libKind], ...p } }));
                }}
                onSearch={() => go({ s: 'search', kind: libKind })}
                // Anime films listed under Movies open as films, not as their franchise.
                onOpen={(k, id) => (libKind === 'movie' ? openTitle(k, id) : openLib(k, id))}
                onOpenNext={openNext}
                onPlusOne={plusOne}
              />
            )}
            {route.s === 'search' && (
              <Search
                kind={route.kind}
                query={route.q ?? ''}
                onQuery={setQuery}
                data={data}
                settings={settings}
                onBack={back}
                onOpen={openTitle}
                onPick={(h) => {
                  mergeMeta(mkey(route.kind, h.id), hitMeta(route.kind, h));
                  if (route.kind === 'movie') logMovie(h.id);
                  else openTitle(route.kind, h.id);
                }}
                onTogglePlan={(h) => {
                  const key = skey(route.kind, h.id);
                  const planned = data.status[key] === 'planned';
                  mergeMeta(mkey(route.kind, h.id), hitMeta(route.kind, h));
                  setStatus(key, 'planned');
                  showToast(planned ? 'Removed from Planned' : `${showTitle(h)} added to Planned`);
                }}
              />
            )}
            {route.s === 'movie' && (
              <MovieDetail
                id={route.id}
                data={data}
                tmdbKey={settings.tmdbKey}
                onBack={back}
                onGenre={genreGo}
                onStatus={statusChange}
                onLog={(e) => logMovie(route.id, e)}
                onRemove={() => removeTitle('movie', route.id, undefined, getMeta(data, 'movie', route.id).title)}
              />
            )}
            {route.s === 'show' && (
              <ShowDetail
                id={route.id}
                data={data}
                tmdbKey={settings.tmdbKey}
                loading={loading.has(mkey('tv', route.id))}
                hasKey={!!settings.tmdbKey}
                onBack={back}
                onGenre={genreGo}
                onSeason={(n) => go({ s: 'eps', kind: 'tv', ref: route.id, season: n })}
                onRemove={() => removeTitle('tv', route.id, undefined, getMeta(data, 'tv', route.id).title)}
              />
            )}
            {route.s === 'agroup' && (() => {
              const g = grouping.of.get(route.id);
              // A group split down to one anime is just that anime.
              if (!g || g.ids.length < 2) return null;
              return (
                <AnimeGroupDetail
                  group={g}
                  grouping={grouping}
                  data={data}
                  tmdbKey={settings.tmdbKey}
                  onBack={back}
                  onGenre={genreGo}
                  onOpen={(id) => openTitle('anime', id)}
                  onSplit={(id) => splitAnime(g, id)}
                  onUnsplit={resetAnime}
                  onUnmove={resetAnime}
                  onMerge={(o) => mergeAnime(g, o)}
                />
              );
            })()}
            {(route.s === 'eps' || (route.s === 'agroup' && (grouping.of.get(route.id)?.ids.length ?? 0) < 2)) && (() => {
              const r: Extract<Route, { s: 'eps' }> = route.s === 'eps' ? route : { s: 'eps', kind: 'anime', ref: route.id };
              const remove = () => {
                const m = getMeta(data, r.kind, r.ref);
                const sn = m.seasons?.find((x) => x.n === r.season)?.name ?? `S${r.season}`;
                removeTitle(r.kind, r.ref, r.season, r.kind === 'tv' ? `${m.title} ${sn}` : m.title);
              };
              const common = {
                data,
                tmdbKey: settings.tmdbKey,
                partOf: r.kind === 'anime' ? partOf(r.ref) : undefined,
                onBack: back,
                onGenre: genreGo,
                onStatus: statusChange,
                onRate: () => rate(r.kind, r.ref, r.season),
                onRemove: remove,
              };
              return filmOf(r.kind, r.ref)
                ? <FilmDetail refId={r.ref} {...common} onLog={(e) => logFilm(r.ref, e)} />
                : <Episodes kind={r.kind} refId={r.ref} season={r.season} {...common} onLog={(e, ep) => logEps(r.kind, r.ref, r.season, e, ep)} />;
            })()}
            {route.s === 'settings' && (
              <Settings
                data={data}
                settings={settings}
                lastBackup={lastBackup}
                onSettings={(p) => setSettings((s) => ({ ...s, ...p }))}
                onStats={() => go({ s: 'stats' })}
                onDiary={() => go({ s: 'diary' })}
                onTiers={() => go({ s: 'tiers' })}
                onExport={() => share(`reelog-backup-${todayIso()}.json`, backupJson(data, settings), 'application/json')}
                onRestoreFile={onRestoreFile}
                onBackupNow={() => void autoBackup(true)}
                onClearCache={refreshDetails}
                onErase={eraseAll}
                notify={info}
                toast={showToast}
              />
            )}
            {route.s === 'stats' && <Stats data={data} onBack={back} onOpen={openTitle} />}
            {route.s === 'diary' && <Diary data={data} onBack={back} onOpen={openEntry} />}
            {route.s === 'tiers' && (
              <TierLists data={data} candidates={candidates} onBack={back} onOpen={(id) => go({ s: 'tier', id })} onCreate={createList} />
            )}
            {route.s === 'tier' && (() => {
              const l = lists.find((x) => x.id === route.id);
              if (!l) return null;
              return (
                <TierEdit
                  data={data}
                  list={l}
                  onBack={back}
                  onUpdate={(f) => updateList(l.id, f)}
                  onAdd={() => go({ s: 'tierpick', id: l.id })}
                  // An anime franchise opens as its group, as in the Anime tab; a film opens as itself.
                  onOpen={(k, id) => (filmOf(k, id) ? openTitle(k, id) : openLib(k, id))}
                  onDelete={() => deleteList(l)}
                  toast={showToast}
                  notify={info}
                />
              );
            })()}
            {route.s === 'tierpick' && (() => {
              const l = lists.find((x) => x.id === route.id);
              if (!l) return null;
              return (
                <TierPicker
                  list={l}
                  titles={candidates(l.kinds)}
                  onBack={back}
                  onAdd={(keys) => {
                    updateList(l.id, (x) => addItems(x, keys));
                    back();
                    showToast(`Added ${plural(keys.length, 'title')} to Unranked`);
                  }}
                />
              );
            })()}
          </div>
        </div>

        {route.s === 'lib' && (
          <button className="fab" onClick={() => go({ s: 'search', kind: libKind })}>
            <Icon name="add" />{TAB[libKind].fab}
          </button>
        )}

        <Toast state={toast} high={route.s === 'lib'} onAction={hideToast} />
        <NavBar current={navTab} onGo={(t) => tabGo(t)} />

        <LogSheet
          sheet={sheet}
          meta={sheetMeta}
          total={sheet.mode === 'movie' ? 0 : total(data, sheet.kind, sheet.ref, sheet.season)}
          watches={sheet.mode === 'movie' ? entriesOf(data, sheet.kind, sheet.ref).length : 0}
          ratingInput={settings.rating}
          patch={patchSheet}
          onClose={closeSheet}
          onSave={saveSheet}
          onDelete={deleteEntry}
        />

        <Dialog spec={dlg} open={dlgOpen} onClose={() => setDlgOpen(false)} />
        <div className="overlays" ref={setOverlays} />
        <div className="splash" data-on={splash} aria-hidden="true"><Logo /></div>
      </div>
    </OverlayHost>
  );
}
