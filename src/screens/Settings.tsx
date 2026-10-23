import { useRef, useState } from 'react';
import { Brand, Chip, Icon } from '../components/ui';
import { verifyMalClientId } from '../lib/anime';
import { libIds } from '../lib/library';
import { isNative } from '../lib/native';
import { HttpError, verifyKey } from '../lib/tmdb';
import type { Data, Settings as SettingsT } from '../lib/types';

type Props = {
  data: Data;
  settings: SettingsT;
  csvPreview: string;
  canExportCsv: boolean;
  onSettings: (p: Partial<SettingsT>) => void;
  onStats: () => void;
  onExportCsv: () => void;
  onExportJson: () => void;
  onCsvFile: (f: File) => void;
  onJsonFile: (f: File) => void;
  onErase: () => void;
  notify: (title: string, body: string) => void;
  toast: (t: string) => void;
};

function KeyCard(props: {
  title: string; body: React.ReactNode; badge: [string, string]; placeholder: string; has: boolean; removeLabel: string;
  onSave: (v: string) => Promise<boolean>; onRemove: () => void;
}) {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const v = draft.trim();
    if (!v || busy) return;
    setBusy(true);
    if (await props.onSave(v)) setDraft('');
    setBusy(false);
  };
  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title-row">
          <span className="card-title">{props.title}</span>
          <span className="tag" style={{ color: props.badge[1] }}>{props.badge[0]}</span>
        </div>
        <div className="card-body">{props.body}</div>
      </div>
      <div className="key-row">
        <input
          type="password" autoComplete="off" spellCheck={false} value={draft} placeholder={props.placeholder}
          aria-label={props.title} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()}
        />
        <button className="btn btn--secondary btn--sm" disabled={busy || !draft.trim()} onClick={save}>{busy ? 'Checking…' : 'Save'}</button>
      </div>
      {props.has && (
        <div className="key-remove"><button className="text-btn text-btn--muted" onClick={props.onRemove}>{props.removeLabel}</button></div>
      )}
    </div>
  );
}

const OK = 'var(--positive)';
const WARN = 'var(--warning)';

export function Settings(p: Props) {
  const csvRef = useRef<HTMLInputElement>(null);
  const jsonRef = useRef<HTMLInputElement>(null);
  const n = (k: 'movie' | 'tv' | 'anime') => libIds(p.data, k).length;
  const pick = (fn: (f: File) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) fn(f);
  };

  const saveTmdb = async (k: string) => {
    try {
      await verifyKey(k);
      p.onSettings({ tmdbKey: k });
      p.toast('TMDB connected');
      return true;
    } catch (e) {
      if (e instanceof HttpError) p.notify('Key not accepted', 'TMDB rejected this key. Copy the API key or the read access token from your TMDB account settings.');
      else p.notify("Couldn't reach TMDB", 'Check your connection and try again.');
      return false;
    }
  };

  const saveMal = async (k: string) => {
    // MAL's official API blocks browser requests, so the ID can only be checked in the Android app.
    if (isNative) {
      try {
        await verifyMalClientId(k);
      } catch (e) {
        if (e instanceof HttpError) p.notify('Client ID not accepted', 'MyAnimeList rejected this client ID. Copy it from myanimelist.net/apiconfig.');
        else p.notify("Couldn't reach MyAnimeList", 'Check your connection and try again.');
        return false;
      }
    }
    p.onSettings({ malKey: k });
    p.toast('MyAnimeList client ID saved');
    return true;
  };

  return (
    <div className="screen">
      <div className="topbar"><Brand /></div>
      <div className="page-head">
        <h1 className="h1">Settings</h1>
        <div className="stats" style={{ marginTop: 8 }}>
          <span>{n('movie')} movies · {n('tv')} shows · {n('anime')} anime · on device</span>
        </div>
      </div>

      <div className="card card--top">
        <button className="menu-btn" onClick={p.onStats}>
          <Icon name="insights" />
          <div className="menu-text">
            <span className="menu-title">Statistics</span>
            <span className="menu-sub">Activity, ratings, statuses and genres</span>
          </div>
          <Icon name="chevron_right" className="chev" />
        </button>
      </div>

      <div className="section-label">EXPORT</div>
      <div className="card">
        <div className="card-head">
          <div className="card-title-row">
            <span className="card-title">Yamtrack CSV</span>
            <span className="tag" style={{ color: OK }}>MOVIES + TV</span>
          </div>
          <div className="card-body">
            In Yamtrack: Settings → Import data → Yamtrack. Episode ranges export with the range's end date. Anime is only in the JSON backup.
          </div>
        </div>
        <div className="csv-preview"><pre>{p.csvPreview}</pre></div>
        <div className="card-actions">
          <button className="btn btn--primary btn--sm" disabled={!p.canExportCsv} onClick={p.onExportCsv}><Icon name="share" />Export CSV</button>
          <button className="btn btn--secondary btn--sm" onClick={p.onExportJson}><Icon name="backup" />JSON backup</button>
        </div>
      </div>

      <div className="section-label">IMPORT</div>
      <div className="card">
        <button className="menu-btn" onClick={() => csvRef.current?.click()}>
          <Icon name="upload_file" />
          <div className="menu-text">
            <span className="menu-title">From Yamtrack CSV</span>
            <span className="menu-sub">Movies, TV seasons and episodes, anime. Games, books and manga are skipped.</span>
          </div>
          <Icon name="chevron_right" className="chev" />
        </button>
        <div className="divider" />
        <button className="menu-btn" onClick={() => jsonRef.current?.click()}>
          <Icon name="settings_backup_restore" className="muted" />
          <div className="menu-text">
            <span className="menu-title">Restore JSON backup</span>
            <span className="menu-sub">Merges with what's already here.</span>
          </div>
          <Icon name="chevron_right" className="chev" />
        </button>
      </div>
      <input ref={csvRef} type="file" accept=".csv,text/csv" hidden onChange={pick(p.onCsvFile)} />
      <input ref={jsonRef} type="file" accept=".json,application/json" hidden onChange={pick(p.onJsonFile)} />

      <div className="section-label">API KEYS</div>
      <KeyCard
        title="TMDB API key"
        badge={p.settings.tmdbKey ? ['CONNECTED', OK] : ['OFFLINE CATALOGUE', WARN]}
        body={<>Movies and TV. Needed for full search and posters. Get a free key at <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noreferrer">themoviedb.org</a>. API key or read access token both work.</>}
        placeholder="Paste key"
        has={!!p.settings.tmdbKey}
        removeLabel="Remove key"
        onSave={saveTmdb}
        onRemove={() => { p.onSettings({ tmdbKey: '' }); p.toast('TMDB key removed'); }}
      />
      <KeyCard
        title="MyAnimeList client ID"
        badge={p.settings.malKey ? ['SAVED', OK] : ['NOT SET', WARN]}
        body={<>Anime search and details. Create one at <a href="https://myanimelist.net/apiconfig" target="_blank" rel="noreferrer">myanimelist.net/apiconfig</a>. Optional: without it, anime comes from Jikan, a free mirror of MyAnimeList.</>}
        placeholder="Paste client ID"
        has={!!p.settings.malKey}
        removeLabel="Remove client ID"
        onSave={saveMal}
        onRemove={() => { p.onSettings({ malKey: '' }); p.toast('Client ID removed'); }}
      />

      <div className="section-label">DISPLAY</div>
      <div className="card">
        <div className="setting">
          <span className="setting-label">Library layout</span>
          <div className="seg">
            {(['list', 'grid'] as const).map((v) => (
              <Chip key={v} className="chip--wide" on={p.settings.layout === v} onClick={() => p.onSettings({ layout: v })}>{v === 'list' ? 'List' : 'Grid'}</Chip>
            ))}
          </div>
        </div>
        <div className="divider" />
        <div className="setting">
          <span className="setting-label">Rating input</span>
          <div className="seg">
            {(['slider', 'tap'] as const).map((v) => (
              <Chip key={v} className="chip--wide" on={p.settings.rating === v} onClick={() => p.onSettings({ rating: v })}>{v === 'slider' ? 'Slider' : 'Tap'}</Chip>
            ))}
          </div>
        </div>
      </div>

      <div className="center-row" style={{ paddingTop: 28 }}>
        <button className="text-btn" onClick={p.onErase}><Icon name="delete_forever" />Erase all data</button>
      </div>
    </div>
  );
}
