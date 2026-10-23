import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { blankSheet, DEFAULT_SCORE, LogSheet, type SheetState } from './components/LogSheet';
import { Dialog, type DialogSpec, Icon, NavBar, Toast, useToast } from './components/ui';
import { useEnricher } from './lib/enrich';
import { fmtDate, parseDate, plural, todayIso } from './lib/format';
import {
  clean, dateLabel, entriesOf, epLabel, epShort, eStart, eEnd, getMeta, isEp, libIds, mkey, nextEpisode, skey, SMAP, total, watched,
} from './lib/library';
import { isNative, onNativeBack, saveFile } from './lib/native';
import { backupJson, EMPTY_DATA, newId, parseBackup, useData, useSettings } from './lib/store';
import type { EpEntry, EpKind, Entry, Filter, Kind, Meta, MovieEntry, NewEntry, Route, SearchHit, Status, Tab } from './lib/types';
import { csvHeader, csvLine, csvRows, entrySig, readYamtrackCsv, toCsv } from './lib/yamtrack';
import { Episodes, MovieDetail, ShowDetail } from './screens/Detail';
import { Library, TAB } from './screens/Library';
import { Search } from './screens/Search';
import { Settings } from './screens/Settings';
import { Stats } from './screens/Stats';

const DEFAULT_FILTER: Filter = { status: 'all', genre: null, sort: 'recent' };
const CLOSED: SheetState = { ...blankSheet({ mode: 'movie', kind: 'movie', ref: 0 }), open: false };
const rootOf = (t: Tab): Route => (t === 'settings' ? { s: 'settings' } : { s: 'lib' });

export default function App() {
  const [data, setData] = useData();
  const [settings, setSettings] = useSettings();
  const [tab, setTab] = useState<Tab>('movie');
  const [stack, setStack] = useState<Route[]>([{ s: 'lib' }]);
  const [filters, setFilters] = useState<Record<Kind, Filter>>({ movie: DEFAULT_FILTER, tv: DEFAULT_FILTER, anime: DEFAULT_FILTER });
  const [sheet, setSheet] = useState<SheetState>(CLOSED);
  const [dlg, setDlg] = useState<DialogSpec | null>(null);
  const [dlgOpen, setDlgOpen] = useState(false);
  const [toast, showToast] = useToast();
  const [splash, setSplash] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const route = stack[stack.length - 1];
  const libKind: Kind = tab === 'settings' ? 'movie' : tab;

  const { ensure, loading } = useEnricher(data, setData, settings);

  useEffect(() => {
    const t = window.setTimeout(() => setSplash(false), 650);
    return () => window.clearTimeout(t);
  }, []);

  // Fetch missing details for everything in the library (and again once a key is added).
  useEffect(() => {
    for (const k of ['movie', 'tv', 'anime'] as const) for (const id of libIds(data, k)) ensure(k, id);
  }, [data.entries, data.status, settings.tmdbKey, settings.malKey, ensure]);

  // ---- Navigation ----
  const onScreen = useCallback((r: Route) => {
    scrollRef.current?.scrollTo({ top: 0 });
    if (r.s === 'movie') ensure('movie', r.id, true);
    if (r.s === 'show') ensure('tv', r.id, true);
    if (r.s === 'eps') ensure(r.kind, r.ref, true);
  }, [ensure]);
  const go = (r: Route) => { setStack((s) => [...s, r]); onScreen(r); };
  const swap = (r: Route) => { setStack((s) => [...s.slice(0, -1), r]); onScreen(r); };
  const back = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  const tabGo = (t: Tab, filter?: Partial<Filter>) => {
    setTab(t);
    setStack([rootOf(t)]);
    if (filter && t !== 'settings') setFilters((f) => ({ ...f, [t]: { ...f[t], ...filter } }));
    scrollRef.current?.scrollTo({ top: 0 });
  };
  const openTitle = (kind: Kind, id: number) =>
    go(kind === 'movie' ? { s: 'movie', id } : kind === 'tv' ? { s: 'show', id } : { s: 'eps', kind: 'anime', ref: id });

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
    if (stack.length > 1) return back(), true;
    if (tab !== 'movie') return tabGo('movie'), true;
    return false;
  };
  // Hold one history entry while anything is above the Movies root; it's pushed right after
  // the tap that opened it, since browsers skip entries added without user activation.
  const trapped = useRef(false);
  const ignorePop = useRef(false);
  const isRoot = tab === 'movie' && stack.length === 1 && !sheet.open && !dlgOpen;
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
      ? { title: h.title, year: h.year, img: h.img, episodes: h.episodes, genres: h.genres, type: h.type, dur: h.dur, full: true }
      : { title: h.title, year: h.year, img: h.img };

  // ---- Sheet ----
  const logMovie = (ref: number, e?: MovieEntry) =>
    setSheet(e
      ? blankSheet({ mode: 'movie', kind: 'movie', ref, entryId: e.id, start: e.date, startText: fmtDate(e.date), score: e.score ?? DEFAULT_SCORE, hasScore: e.score != null, notes: e.notes })
      : blankSheet({ mode: 'movie', kind: 'movie', ref }));

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
    const n = ep ?? nextEpisode(data, kind, ref, season);
    setSheet(blankSheet({ mode: 'eps', kind, ref, season, epFrom: String(n), epTo: String(n) }));
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

    if (s.mode === 'rate') {
      setData((d) => {
        const rates = { ...d.rates };
        if (s.hasScore) rates[key] = s.score;
        else delete rates[key];
        const status = { ...d.status };
        // Rating something you haven't logged means you've seen it.
        if (s.hasScore && !status[key] && !entriesOf(d, s.kind, s.ref, s.season).length) status[key] = 'completed';
        return { ...d, rates, status };
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
    if (s.mode === 'movie') {
      val = { kind: 'movie', ref: s.ref, date: a, score, notes };
    } else {
      const tot = total(data, s.kind, s.ref, s.season);
      const f = parseInt(s.epFrom, 10);
      const t = range ? parseInt(s.epTo, 10) : f;
      if (!(f >= 1) || !(t >= f) || (tot && t > tot)) {
        return info('Check the episodes', tot ? `Pick episodes between 1 and ${tot}, with the last one after the first.` : 'The last episode must be the same as or after the first.');
      }
      val = { kind: s.kind as EpKind, ref: s.ref, epFrom: f, epTo: t, start: a, end: b, score, notes, ...(s.kind === 'tv' ? { season: s.season } : {}) };
    }

    // Status follows logging: a new movie watch completes it; episodes mark it Watching,
    // then Completed once every episode is in.
    let newStatus: Status | null = null;
    if (!s.entryId) {
      const prev = data.status[key];
      if (s.mode === 'movie') newStatus = 'completed';
      else {
        const tot = total(data, s.kind, s.ref, s.season);
        const w = watched(data, s.kind, s.ref, s.season);
        const v = val as Omit<EpEntry, 'id'>;
        for (let i = v.epFrom; i <= v.epTo; i++) w.add(i);
        if (tot && w.size >= tot) newStatus = 'completed';
        else if (prev !== 'completed' && prev !== 'watching') newStatus = 'watching';
      }
      if (newStatus === prev) newStatus = null;
    }

    setData((d) => ({
      ...d,
      entries: s.entryId
        ? d.entries.map((e) => (e.id === s.entryId ? ({ ...e, ...val } as Entry) : e))
        : [...d.entries, { id: newId(), ...val } as Entry],
      status: newStatus ? { ...d.status, [key]: newStatus } : d.status,
    }));
    closeSheet();

    if (s.mode === 'movie') {
      showToast(s.entryId ? 'Entry updated' : `Logged ${title}`);
      if (route.s === 'search') swap({ s: 'movie', id: s.ref });
      else if (route.s !== 'movie') go({ s: 'movie', id: s.ref });
    } else {
      const v = val as Omit<EpEntry, 'id'>;
      showToast(s.entryId ? 'Entry updated' : `Logged ${s.kind === 'tv' ? `S${s.season} ` : ''}${epShort(v as EpEntry)}${newStatus ? ` · ${SMAP[newStatus].label}` : ''}`);
    }
  };

  const deleteEntry = () => {
    const s = sheet;
    const e = data.entries.find((x) => x.id === s.entryId);
    if (!e) return;
    confirm('Delete this entry?', `${isEp(e) ? `${epLabel(e)} · ` : ''}${dateLabel(e)}. This can't be undone.`, 'Delete', () => {
      const left = data.entries.some((x) => x.id !== e.id && x.kind === 'movie' && x.ref === e.ref);
      setData((d) => {
        const status = { ...d.status };
        // The last watch of a movie gone: drop the "Completed" that logging set.
        if (e.kind === 'movie' && !left && status[`movie:${e.ref}`] === 'completed') delete status[`movie:${e.ref}`];
        return { ...d, entries: d.entries.filter((x) => x.id !== e.id), status };
      });
      closeSheet();
      showToast('Entry deleted');
      const st = data.status[`movie:${e.ref}`];
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

  // ---- Import / export ----
  const rows = useMemo(() => (route.s === 'settings' ? csvRows(data) : []), [route.s, data]);
  const csvPreview = [csvHeader(), ...rows.slice(0, 3).map(csvLine)].join('\n');

  const share = async (name: string, text: string, type: string) => {
    try {
      if ((await saveFile(name, text, type)) && !isNative) showToast(`Saved ${name}`);
    } catch {
      info('Export failed', `Couldn't save ${name}.`);
    }
  };

  const onCsvFile = async (f: File) => {
    const r = readYamtrackCsv(await f.text(), data, () => newId('i'));
    if (!r) return info('Not a Yamtrack file', "This CSV doesn't have Yamtrack's columns (media_id, source, media_type).");
    // Only count statuses and ratings that would actually change something.
    const status = Object.fromEntries(Object.entries(r.status).filter(([k, v]) => data.status[k] !== v));
    const rates = Object.fromEntries(Object.entries(r.rates).filter(([k, v]) => data.rates[k] !== v));
    const nSet = Object.keys(status).length + Object.keys(rates).length;
    if (!r.add.length && !nSet) return info('Nothing to import', `No new entries found.\n${r.dup} duplicates · ${r.other} other rows skipped.`);
    confirm(
      'Import from Yamtrack',
      `${plural(r.counts.movie, 'movie watch', 'movie watches')}, ${plural(r.counts.tv, 'TV episode')}, ${plural(r.counts.anime, 'anime episode')}, plus ${plural(nSet, 'status or rating', 'statuses and ratings')}.\n${r.dup} duplicates and ${r.other} other rows will be skipped.`,
      'Import',
      () => {
        setData((d) => {
          const meta = { ...d.meta };
          for (const [k, v] of Object.entries(r.meta)) meta[k] = { ...clean(v), ...meta[k] };
          return { entries: [...d.entries, ...r.add], meta, status: { ...d.status, ...status }, rates: { ...d.rates, ...rates } };
        });
        showToast(`Imported ${plural(r.add.length, 'entry', 'entries')}`);
      },
    );
  };

  const onJsonFile = async (f: File) => {
    const b = parseBackup(await f.text());
    if (!b) return info('Not a Reelog backup', 'Pick a .json file exported from Reelog.');
    const sig = (e: Entry) => `${entrySig(e)}|${eStart(e)}|${eEnd(e)}|${e.score}`;
    const seen = new Set(data.entries.map(sig));
    const add = b.entries.filter((e) => !seen.has(sig(e))).map((e) => ({ ...e, id: newId('b') }));
    confirm('Restore backup', `${plural(add.length, 'new entry', 'new entries')} will be merged. ${b.entries.length - add.length} already exist.`, 'Restore', () => {
      setData((d) => ({
        entries: [...d.entries, ...add],
        meta: { ...b.meta, ...d.meta },
        status: { ...b.status, ...d.status },
        rates: { ...b.rates, ...d.rates },
      }));
      showToast(`Restored ${plural(add.length, 'entry', 'entries')}`);
    });
  };

  const eraseAll = () =>
    confirm('Erase all data?', `Deletes all ${plural(data.entries.length, 'entry', 'entries')}, statuses and ratings from this device. Export a backup first if you want to keep them.`, 'Erase', () => {
      setData(EMPTY_DATA);
      showToast('All data erased');
    });

  // ---- Render ----
  const sheetMeta = getMeta(data, sheet.kind, sheet.ref);
  const navTab: Tab = route.s === 'settings' || route.s === 'stats' ? 'settings' : tab;
  const genreGo = (kind: Kind, g: string) => tabGo(kind, { genre: g, status: 'all' });
  const statusChange = (key: string, s: Status) => setStatus(key, s);

  return (
    <div className="app">
      <div className="scroll" ref={scrollRef}>
        {route.s === 'lib' && (
          <Library
            kind={libKind}
            data={data}
            filter={filters[libKind]}
            layout={settings.layout}
            onFilter={(p) => setFilters((f) => ({ ...f, [libKind]: { ...f[libKind], ...p } }))}
            onSearch={() => go({ s: 'search', kind: libKind })}
            onOpen={(id) => openTitle(libKind, id)}
          />
        )}
        {route.s === 'search' && (
          <Search
            kind={route.kind}
            data={data}
            settings={settings}
            onBack={back}
            onOpen={(id) => openTitle(route.kind, id)}
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
              showToast(planned ? 'Removed from Planned' : `${h.title} added to Planned`);
            }}
          />
        )}
        {route.s === 'movie' && (
          <MovieDetail
            id={route.id}
            data={data}
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
            loading={loading.has(mkey('tv', route.id))}
            hasKey={!!settings.tmdbKey}
            onBack={back}
            onGenre={genreGo}
            onSeason={(n) => go({ s: 'eps', kind: 'tv', ref: route.id, season: n })}
            onRemove={() => removeTitle('tv', route.id, undefined, getMeta(data, 'tv', route.id).title)}
          />
        )}
        {route.s === 'eps' && (
          <Episodes
            kind={route.kind}
            refId={route.ref}
            season={route.season}
            data={data}
            onBack={back}
            onGenre={genreGo}
            onStatus={statusChange}
            onLog={(e, ep) => logEps(route.kind, route.ref, route.season, e, ep)}
            onRate={() => rate(route.kind, route.ref, route.season)}
            onRemove={() => {
              const m = getMeta(data, route.kind, route.ref);
              const sn = m.seasons?.find((x) => x.n === route.season)?.name ?? `S${route.season}`;
              removeTitle(route.kind, route.ref, route.season, route.kind === 'tv' ? `${m.title} ${sn}` : m.title);
            }}
          />
        )}
        {route.s === 'settings' && (
          <Settings
            data={data}
            settings={settings}
            csvPreview={csvPreview}
            canExportCsv={rows.length > 0}
            onSettings={(p) => setSettings((s) => ({ ...s, ...p }))}
            onStats={() => go({ s: 'stats' })}
            onExportCsv={() => share(`reelog-yamtrack-${todayIso()}.csv`, toCsv(rows), 'text/csv')}
            onExportJson={() => share(`reelog-backup-${todayIso()}.json`, backupJson(data), 'application/json')}
            onCsvFile={onCsvFile}
            onJsonFile={onJsonFile}
            onErase={eraseAll}
            notify={info}
            toast={showToast}
          />
        )}
        {route.s === 'stats' && <Stats data={data} onBack={back} />}
      </div>

      {route.s === 'lib' && (
        <button className="fab" onClick={() => go({ s: 'search', kind: libKind })}>
          <Icon name="add" />{TAB[libKind].fab}
        </button>
      )}

      <Toast text={toast.text} on={toast.on} high={route.s === 'lib'} />
      <NavBar current={navTab} onGo={(t) => tabGo(t)} />

      <LogSheet
        sheet={sheet}
        meta={sheetMeta}
        total={sheet.mode === 'movie' ? 0 : total(data, sheet.kind, sheet.ref, sheet.season)}
        watches={sheet.kind === 'movie' ? entriesOf(data, 'movie', sheet.ref).length : 0}
        ratingInput={settings.rating}
        patch={patchSheet}
        onClose={closeSheet}
        onSave={saveSheet}
        onDelete={deleteEntry}
      />

      <Dialog spec={dlg} open={dlgOpen} onClose={() => setDlgOpen(false)} />
      <div className="splash" data-on={splash} aria-hidden="true"><div /></div>
    </div>
  );
}

