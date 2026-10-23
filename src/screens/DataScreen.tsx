import { useRef, useState } from 'react';
import { Brand, Icon } from '../components/ui';
import { verifyKey } from '../lib/tmdb';
import type { Settings } from '../lib/types';
import type { Stats } from './Library';

type Props = {
  stats: Stats;
  csvPreview: string;
  settings: Settings;
  onSettings: (p: Partial<Settings>) => void;
  onExportCsv: () => void;
  onExportJson: () => void;
  onCsvFile: (f: File) => void;
  onJsonFile: (f: File) => void;
  onErase: () => void;
  notify: (title: string, body: string) => void;
};

export function DataScreen(p: Props) {
  const csvRef = useRef<HTMLInputElement>(null);
  const jsonRef = useRef<HTMLInputElement>(null);
  const [key, setKey] = useState(p.settings.tmdbKey);
  const [checking, setChecking] = useState(false);
  const dirty = key.trim() !== p.settings.tmdbKey;

  const pick = (fn: (f: File) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) fn(f);
  };

  const saveKey = async () => {
    const k = key.trim();
    if (!k) {
      p.onSettings({ tmdbKey: '' });
      return;
    }
    setChecking(true);
    try {
      await verifyKey(k);
      p.onSettings({ tmdbKey: k });
      p.notify('TMDB connected', 'Search now uses TMDB. Posters and details fill in automatically.');
    } catch (e) {
      p.notify('Key not accepted', e instanceof Error ? e.message : 'Could not verify the key.');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="screen" style={{ paddingBottom: 120 }}>
      <div className="topbar"><Brand /></div>
      <div className="page-head">
        <h1 className="h1">Data</h1>
        <div className="stats">
          <span>{p.stats.watches} entries · {p.stats.films} films · stored on device</span>
        </div>
      </div>

      <div className="section-label">EXPORT</div>
      <div className="card">
        <div className="card-head">
          <div className="card-title-row">
            <span className="card-title">Yamtrack CSV</span>
            <span className="tag tag--ok">COMPATIBLE</span>
          </div>
          <div className="card-body">One row per watch. In Yamtrack: Settings → Import data → Yamtrack.</div>
        </div>
        <div className="csv-preview"><pre>{p.csvPreview}</pre></div>
        <div className="card-actions">
          <button className="btn btn--primary btn--sm" onClick={p.onExportCsv} disabled={!p.stats.watches}>
            <Icon name="download" />Export CSV
          </button>
          <button className="btn btn--secondary btn--sm" onClick={p.onExportJson}>
            <Icon name="backup" />JSON backup
          </button>
        </div>
      </div>

      <div className="section-label">IMPORT</div>
      <div className="card">
        <button className="menu-btn" onClick={() => csvRef.current?.click()}>
          <Icon name="upload_file" />
          <div className="menu-text">
            <span className="menu-title">From Yamtrack CSV</span>
            <span className="menu-sub">Movie rows only. TV, anime, games are skipped.</span>
          </div>
          <Icon name="chevron_right" className="chev" />
        </button>
        <div className="divider" />
        <button className="menu-btn" onClick={() => jsonRef.current?.click()}>
          <Icon name="settings_backup_restore" className="icon-btn--muted" />
          <div className="menu-text">
            <span className="menu-title">Restore JSON backup</span>
            <span className="menu-sub">Merges with what's already here.</span>
          </div>
          <Icon name="chevron_right" className="chev" />
        </button>
      </div>
      <input ref={csvRef} type="file" accept=".csv,text/csv" hidden onChange={pick(p.onCsvFile)} />
      <input ref={jsonRef} type="file" accept=".json,application/json" hidden onChange={pick(p.onJsonFile)} />

      <div className="section-label">SETTINGS</div>
      <div className="card">
        <div className="card-head">
          <div className="card-title-row">
            <span className="card-title">TMDB API key</span>
            {p.settings.tmdbKey
              ? <span className="tag tag--ok">CONNECTED</span>
              : <span className="tag tag--warn">OFFLINE CATALOGUE</span>}
          </div>
          <div className="card-body">
            Needed for full search and posters. Get a free key at{' '}
            <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noreferrer">themoviedb.org</a>.
            API key or read access token both work.
          </div>
        </div>
        <div className="key-row">
          <div className="field">
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={key}
              placeholder="Paste key"
              aria-label="TMDB API key"
              onChange={(e) => setKey(e.target.value)}
              style={{ fontSize: 13, paddingRight: 14 }}
            />
          </div>
          <button className="btn btn--secondary btn--sm" style={{ flex: 'none' }} disabled={!dirty || checking} onClick={saveKey}>
            {checking ? 'Checking…' : 'Save'}
          </button>
        </div>
        <div className="divider" />
        <div className="setting">
          <span className="setting-label">Library layout</span>
          <div className="seg">
            {(['list', 'grid'] as const).map((v) => (
              <button key={v} className="chip" aria-pressed={p.settings.layout === v} onClick={() => p.onSettings({ layout: v })}>
                {v === 'list' ? 'List' : 'Grid'}
              </button>
            ))}
          </div>
        </div>
        <div className="divider" />
        <div className="setting">
          <span className="setting-label">Rating input</span>
          <div className="seg">
            {(['slider', 'tap'] as const).map((v) => (
              <button key={v} className="chip" aria-pressed={p.settings.ratingInput === v} onClick={() => p.onSettings({ ratingInput: v })}>
                {v === 'slider' ? 'Slider' : 'Tap'}
              </button>
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
