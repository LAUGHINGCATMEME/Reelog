import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LogSheet, type SheetState } from './components/LogSheet';
import { Dialog, type DialogSpec, Icon, NavBar, Toast, useToast } from './components/ui';
import { CATALOG_MAP } from './lib/catalog';
import { fmtDate, parseDate, plural, todayIso } from './lib/format';
import { DATA_KEY, DEFAULT_SETTINGS, EMPTY_DATA, newId, SETTINGS_KEY, usePersisted } from './lib/store';
import { isNative, onNativeBack, saveFile } from './lib/native';
import { movieDetails } from './lib/tmdb';
import type { Data, Entry, Movie, Screen, Settings, Sort } from './lib/types';
import { readYamtrackCsv, toYamtrackCsv } from './lib/yamtrack';
import { DataScreen } from './screens/DataScreen';
import { Detail } from './screens/Detail';
import { type Group, Library, type Stats } from './screens/Library';
import { Search } from './screens/Search';

/** Merges movie records left to right, ignoring empty fields so a sparse record never erases a richer one. */
function mergeMovie(...parts: (Partial<Movie> | undefined)[]): Movie {
  const out: Partial<Movie> = {};
  for (const p of parts) {
    if (!p) continue;
    for (const [k, v] of Object.entries(p)) {
      if (v === undefined || v === '' || (Array.isArray(v) && !v.length)) continue;
      (out as Record<string, unknown>)[k] = v;
    }
  }
  return { genres: [], year: '', title: `TMDB #${out.id}`, ...out } as Movie;
}

const CLOSED_SHEET: SheetState = {
  open: false, mode: 'add', movie: { id: 0, title: '', year: '', genres: [] },
  entryId: null, date: '', dateText: '', score: 8, hasScore: true, notes: '',
};

const byDateDesc = (a: Entry, b: Entry) => b.date.localeCompare(a.date);

export default function App() {
  const [data, setData] = usePersisted<Data>(DATA_KEY, EMPTY_DATA);
  const [settings, setSettings] = usePersisted<Settings>(SETTINGS_KEY, DEFAULT_SETTINGS);
  const [screen, setScreen] = useState<Screen>('library');
  const [detailId, setDetailId] = useState<number | null>(null);
  const [sort, setSort] = useState<Sort>('recent');
  const [query, setQuery] = useState('');
  const [sheet, setSheet] = useState<SheetState>(CLOSED_SHEET);
  const [dlg, setDlg] = useState<DialogSpec | null>(null);
  const [toast, showToast] = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);

  const movie = useCallback(
    (id: number) => mergeMovie({ id }, CATALOG_MAP[id], data.extra[id]),
    [data.extra],
  );

  const groups = useMemo(() => {
    const map = new Map<number, Entry[]>();
    for (const e of data.entries) {
      const list = map.get(e.tmdb);
      if (list) list.push(e);
      else map.set(e.tmdb, [e]);
    }
    const out = new Map<number, Group>();
    for (const [id, es] of map) {
      const entries = [...es].sort(byDateDesc);
      const latest = entries.find((e) => e.score != null);
      out.set(id, { id, movie: movie(id), entries, lastDate: entries[0].date, score: latest?.score ?? null });
    }
    return out;
  }, [data.entries, movie]);

  const stats: Stats = useMemo(() => {
    const scored = data.entries.filter((e) => e.score != null);
    return {
      films: groups.size,
      watches: data.entries.length,
      avg: scored.length ? (scored.reduce((a, e) => a + (e.score ?? 0), 0) / scored.length).toFixed(1) : '—',
    };
  }, [data.entries, groups]);

  const csvText = useMemo(() => toYamtrackCsv(data.entries, movie), [data.entries, movie]);

  // ---- TMDB enrichment: fetch runtime, director, genres and posters for logged movies ----
  const queue = useRef<number[]>([]);
  const queued = useRef(new Set<number>());
  const pumping = useRef(false);
  const pump = useCallback(async (key: string) => {
    if (pumping.current) return;
    pumping.current = true;
    while (queue.current.length) {
      const id = queue.current.shift()!;
      try {
        const d = await movieDetails(id, key);
        setData((prev) => ({ ...prev, extra: { ...prev.extra, [id]: mergeMovie(prev.extra[id], d) } }));
      } catch {
        /* offline or unknown id — leave it as is; it's retried next launch */
      }
    }
    pumping.current = false;
  }, [setData]);

  useEffect(() => {
    const key = settings.tmdbKey;
    if (!key) return;
    const need = (id: number) => !data.extra[id]?.detailed && !queued.current.has(id);
    if (detailId != null && need(detailId)) {
      queued.current.add(detailId);
      queue.current.unshift(detailId);
    }
    for (const id of groups.keys()) {
      if (need(id)) {
        queued.current.add(id);
        queue.current.push(id);
      }
    }
    if (queue.current.length) void pump(key);
  }, [settings.tmdbKey, groups, detailId, data.extra, pump]);

  // ---- Navigation ----
  const go = useCallback((s: Screen, id?: number) => {
    setScreen(s);
    if (id !== undefined) setDetailId(id);
    scrollRef.current?.scrollTo({ top: 0 });
  }, []);

  const patchSheet = useCallback((p: Partial<SheetState>) => setSheet((s) => ({ ...s, ...p })), []);
  const closeSheet = useCallback(() => patchSheet({ open: false }), [patchSheet]);

  // Android back button / browser back: close the top layer instead of leaving the app.
  const backRef = useRef<() => boolean>(() => false);
  backRef.current = () => {
    if (dlg) return setDlg(null), true;
    if (sheet.open) return closeSheet(), true;
    if (screen !== 'library') return go('library'), true;
    return false;
  };
  // A single history entry is held while anything sits above the library root. It's pushed
  // right after the tap that opened it, since browsers skip entries added without user activation.
  const trapped = useRef(false);
  const ignorePop = useRef(false);
  const isRoot = screen === 'library' && !sheet.open && !dlg;
  useEffect(() => {
    if (!isRoot && !trapped.current) {
      history.pushState({ reelog: true }, '');
      trapped.current = true;
    } else if (isRoot && trapped.current) {
      // Closed from the UI rather than the back button: drop the entry so back exits next time.
      trapped.current = false;
      ignorePop.current = true;
      history.back();
    }
  });
  useEffect(() => {
    const onPop = () => {
      if (ignorePop.current) {
        ignorePop.current = false;
        return;
      }
      trapped.current = false;
      backRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') backRef.current();
    };
    addEventListener('popstate', onPop);
    addEventListener('keydown', onKey);
    const offNative = onNativeBack(() => backRef.current());
    return () => {
      offNative();
      removeEventListener('popstate', onPop);
      removeEventListener('keydown', onKey);
    };
  }, []);

  // ---- Log sheet ----
  const openSheet = (m: Movie, entry?: Entry) => {
    const date = entry?.date || todayIso();
    setSheet({
      open: true,
      mode: entry ? 'edit' : 'add',
      movie: m,
      entryId: entry?.id ?? null,
      date,
      dateText: fmtDate(date),
      score: entry?.score ?? 8,
      hasScore: entry ? entry.score != null : true,
      notes: entry?.notes ?? '',
    });
  };

  const saveSheet = () => {
    const s = sheet;
    if (!parseDate(s.dateText) || s.date > todayIso()) {
      setDlg({ title: 'Check the date', body: 'Enter a valid past date as DD/MM/YYYY.' });
      return;
    }
    const val = { date: s.date, score: s.hasScore ? s.score : null, notes: s.notes.trim() };
    const id = s.movie.id;
    setData((prev) => ({
      entries:
        s.mode === 'edit'
          ? prev.entries.map((e) => (e.id === s.entryId ? { ...e, ...val } : e))
          : [...prev.entries, { id: newId(), tmdb: id, ...val }],
      extra: { ...prev.extra, [id]: mergeMovie(prev.extra[id], s.movie) },
    }));
    closeSheet();
    showToast(s.mode === 'edit' ? 'Entry updated' : `Logged ${s.movie.title}`);
    go('detail', id);
  };

  const deleteEntry = () => {
    const s = sheet;
    setDlg({
      title: 'Delete this entry?',
      body: `${fmtDate(s.date)} · ${s.movie.title}. This can't be undone.`,
      okLabel: 'Delete',
      onOk: () => {
        const left = data.entries.some((e) => e.tmdb === s.movie.id && e.id !== s.entryId);
        setData((prev) => ({ ...prev, entries: prev.entries.filter((e) => e.id !== s.entryId) }));
        setDlg(null);
        closeSheet();
        showToast('Entry deleted');
        if (!left) go('library');
      },
    });
  };

  // ---- Import / export ----
  const onCsvFile = async (f: File) => {
    const res = readYamtrackCsv(await f.text(), data.entries, (id) => !!CATALOG_MAP[id] || !!data.extra[id], () => newId('i'));
    if (!res) {
      setDlg({ title: 'Not a Yamtrack file', body: "This CSV doesn't have Yamtrack's columns (media_id, source, media_type)." });
      return;
    }
    if (!res.add.length) {
      setDlg({ title: 'Nothing to import', body: `No new movie entries found.\n${res.dup} duplicates · ${res.other} non-movie rows skipped.` });
      return;
    }
    const films = new Set(res.add.map((a) => a.tmdb)).size;
    setDlg({
      title: 'Import from Yamtrack',
      body: `${plural(res.add.length, 'movie entry', 'movie entries')} across ${plural(films, 'film')}.\n${res.dup} duplicates and ${res.other} non-movie rows will be skipped.`,
      okLabel: 'Import',
      onOk: () => {
        setData((prev) => ({ entries: [...prev.entries, ...res.add], extra: { ...res.movies, ...prev.extra } }));
        setDlg(null);
        showToast(`Imported ${plural(res.add.length, 'entry', 'entries')}`);
      },
    });
  };

  const onJsonFile = async (f: File) => {
    let d: Partial<Data> & { app?: string } | null = null;
    try {
      d = JSON.parse(await f.text());
    } catch {
      /* handled below */
    }
    if (!d || d.app !== 'reelog' || !Array.isArray(d.entries)) {
      setDlg({ title: 'Not a Reelog backup', body: 'Pick a .json file exported from Reelog.' });
      return;
    }
    const sig = (x: Entry) => `${x.tmdb}|${x.date}|${x.score}`;
    const seen = new Set(data.entries.map(sig));
    const valid = d.entries.filter((x): x is Entry => !!x && typeof x.tmdb === 'number');
    const add = valid
      .filter((x) => !seen.has(sig(x)))
      .map((x) => ({ id: newId('b'), tmdb: x.tmdb, date: x.date ?? '', score: x.score ?? null, notes: x.notes ?? '' }));
    const extra = d.extra ?? {};
    setDlg({
      title: 'Restore backup',
      body: `${plural(add.length, 'new entry', 'new entries')} will be merged. ${valid.length - add.length} already exist.`,
      okLabel: 'Restore',
      onOk: () => {
        setData((prev) => ({ entries: [...prev.entries, ...add], extra: { ...prev.extra, ...extra } }));
        setDlg(null);
        showToast(`Restored ${plural(add.length, 'entry', 'entries')}`);
      },
    });
  };

  const save = async (name: string, text: string, type: string) => {
    try {
      if ((await saveFile(name, text, type)) && !isNative) showToast(`Saved ${name}`);
    } catch {
      setDlg({ title: 'Export failed', body: `Couldn't save ${name}.` });
    }
  };
  const exportCsv = () => save(`reelog-yamtrack-${todayIso()}.csv`, csvText, 'text/csv');
  const exportJson = () => {
    const body = { app: 'reelog', version: 1, exported: new Date().toISOString(), entries: data.entries, extra: data.extra };
    void save(`reelog-backup-${todayIso()}.json`, JSON.stringify(body, null, 2), 'application/json');
  };

  const eraseAll = () =>
    setDlg({
      title: 'Erase all data?',
      body: `Deletes all ${plural(data.entries.length, 'entry', 'entries')} from this device. Export a backup first if you want to keep them.`,
      okLabel: 'Erase',
      onOk: () => {
        setData(EMPTY_DATA);
        setDlg(null);
        showToast('All data erased');
      },
    });

  // ---- Render ----
  const detail = detailId != null ? groups.get(detailId) : undefined;
  const current: Screen = screen === 'detail' && !detail ? 'library' : screen;

  return (
    <div className="app">
      <div className="scroll" ref={scrollRef}>
        {current === 'library' && (
          <Library
            groups={[...groups.values()]}
            stats={stats}
            sort={sort}
            layout={settings.layout}
            onSort={setSort}
            onSearch={() => go('search')}
            onOpen={(id) => go('detail', id)}
          />
        )}
        {current === 'search' && (
          <Search
            query={query}
            onQuery={setQuery}
            tmdbKey={settings.tmdbKey}
            loggedCount={(id) => groups.get(id)?.entries.length ?? 0}
            known={(m) => mergeMovie(CATALOG_MAP[m.id], m, data.extra[m.id])}
            onBack={() => go('library')}
            onPick={(m) => openSheet(m)}
          />
        )}
        {current === 'detail' && detail && (
          <Detail
            group={detail}
            onBack={() => go('library')}
            onAdd={() => openSheet(detail.movie)}
            onEdit={(e) => openSheet(detail.movie, e)}
            onRemove={() =>
              setDlg({
                title: `Remove ${detail.movie.title}?`,
                body: `This deletes all ${plural(detail.entries.length, 'entry', 'entries')} for this movie. It can't be undone.`,
                okLabel: 'Remove',
                onOk: () => {
                  setData((prev) => ({ ...prev, entries: prev.entries.filter((e) => e.tmdb !== detail.id) }));
                  setDlg(null);
                  go('library');
                  showToast(`Removed ${detail.movie.title}`);
                },
              })
            }
          />
        )}
        {current === 'data' && (
          <DataScreen
            stats={stats}
            csvPreview={csvText.split('\n').slice(0, 4).join('\n')}
            settings={settings}
            onSettings={(p) => setSettings((s) => ({ ...s, ...p }))}
            onExportCsv={exportCsv}
            onExportJson={exportJson}
            onCsvFile={onCsvFile}
            onJsonFile={onJsonFile}
            onErase={eraseAll}
            notify={(title, body) => setDlg({ title, body })}
          />
        )}
      </div>

      {current === 'library' && (
        <button className="fab" onClick={() => go('search')}>
          <Icon name="add" />
          Log movie
        </button>
      )}

      <Toast text={toast.text} on={toast.on} />
      <NavBar current={current} onGo={(s) => go(s)} />

      <LogSheet
        sheet={sheet}
        existing={groups.get(sheet.movie.id)?.entries.length ?? 0}
        ratingInput={settings.ratingInput}
        patch={patchSheet}
        onClose={closeSheet}
        onSave={saveSheet}
        onDelete={deleteEntry}
      />

      {dlg && <Dialog spec={dlg} onClose={() => setDlg(null)} />}
    </div>
  );
}
