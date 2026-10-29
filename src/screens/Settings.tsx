import { useRef, useState } from 'react';
import { Brand, Chip, Icon } from '../components/ui';
import { fmtDateLong, plural } from '../lib/format';
import { libIds } from '../lib/library';
import { BACKUP_DIR, isNative } from '../lib/native';
import { HttpError, verifyKey } from '../lib/tmdb';
import type { Data, Settings as SettingsT, Theme } from '../lib/types';
import { latestRelease, newer, REPO_URL } from '../lib/update';

export type LastBackup = { at: string; name: string } | null;

type Props = {
  data: Data;
  settings: SettingsT;
  lastBackup: LastBackup;
  onSettings: (p: Partial<SettingsT>) => void;
  onStats: () => void;
  onDiary: () => void;
  onTiers: () => void;
  onExport: () => void;
  onRestoreFile: (f: File) => void;
  onBackupNow: () => void;
  onClearCache: () => void;
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
const THEMES: [Theme, string][] = [['system', 'System'], ['black', 'Black'], ['oled', 'OLED'], ['white', 'White']];
const FILMS: [SettingsT['animeFilms'], string][] = [['anime', 'Anime'], ['movies', 'Movies'], ['both', 'Both']];
const GROUP_EPS: [SettingsT['groupEps'], string][] = [['off', 'Off'], ['continuous', 'Continuous'], ['seasons', 'By season']];

export function Settings(p: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [checking, setChecking] = useState(false);
  const n = (k: 'movie' | 'tv' | 'anime') => libIds(p.data, k).length;
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) p.onRestoreFile(f);
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

  const checkUpdate = async () => {
    setChecking(true);
    try {
      const r = await latestRelease();
      if (r && newer(r.version, __APP_VERSION__)) {
        p.notify(`Reelog ${r.version} is out`, `You have ${__APP_VERSION__}. Download the new APK from the Releases page on GitHub and install it over this one; your data stays.`);
        window.open(r.url, '_blank');
      } else p.toast(`Reelog ${__APP_VERSION__} is the latest`);
    } catch {
      p.notify("Couldn't check for updates", 'Check your connection and try again.');
    }
    setChecking(false);
  };

  const tiers = p.data.tierLists?.length ?? 0;
  const pending = p.data.legacyMal?.entries.length ?? 0;
  const pendingTitles = [...new Set(p.data.legacyMal?.entries.map((e) => p.data.legacyMal?.titles?.[e.ref] ?? `MAL #${e.ref}`))];
  const backupSub = !isNative
    ? 'Automatic backups are made by the Android app.'
    : p.lastBackup
      ? `Last: ${fmtDateLong(p.lastBackup.at.slice(0, 10))}, ${p.lastBackup.at.slice(11, 16)} · Documents/${BACKUP_DIR}`
      : `Each day you change something, to Documents/${BACKUP_DIR}. The newest 10 are kept.`;

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
        <div className="divider" />
        <button className="menu-btn" onClick={p.onDiary}>
          <Icon name="menu_book" />
          <div className="menu-text">
            <span className="menu-title">Diary</span>
            <span className="menu-sub">Every watch, by date</span>
          </div>
          <Icon name="chevron_right" className="chev" />
        </button>
        <div className="divider" />
        <button className="menu-btn" onClick={p.onTiers}>
          <Icon name="leaderboard" />
          <div className="menu-text">
            <span className="menu-title">Tier lists</span>
            <span className="menu-sub">{tiers ? `${plural(tiers, 'list')} · S to F` : "Rank what you've watched, S to F"}</span>
          </div>
          <Icon name="chevron_right" className="chev" />
        </button>
      </div>

      {!!pending && (
        <div className="card" style={{ marginTop: 8 }}>
          <div className="card-head">
            <div className="card-title-row">
              <span className="card-title">Anime to match</span>
              <span className="tag" style={{ color: WARN }}>{plural(pending, 'ENTRY', 'ENTRIES')}</span>
            </div>
            <div className="card-body">
              Logged before Reelog moved to AniList. They're matched in the background when you're online. Any still here after that aren't on AniList: add them again by hand if you find them. Until then they're kept, and go into backups.
            </div>
            <div className="card-body legacy-list">{pendingTitles.slice(0, 12).join(' · ')}{pendingTitles.length > 12 ? ` and ${pendingTitles.length - 12} more` : ''}</div>
          </div>
        </div>
      )}

      <div className="section-label">BACKUP</div>
      <div className="card">
        <div className="card-head">
          <div className="card-title-row">
            <span className="card-title">Reelog backup</span>
            <span className="tag" style={{ color: OK }}>EVERYTHING</span>
          </div>
          <div className="card-body">
            One .json file with every entry, status, rating, note, anime group and tier list, plus your display settings. API keys are never included.
          </div>
        </div>
        <div className="card-actions">
          <button className="btn btn--primary btn--sm" onClick={p.onExport}><Icon name="share" />Export</button>
          <button className="btn btn--secondary btn--sm" onClick={() => fileRef.current?.click()}><Icon name="settings_backup_restore" />Restore</button>
        </div>
        <div className="divider" />
        <div className="setting">
          <div className="setting-text">
            <span className="setting-label">Auto-backup</span>
            <span className="setting-sub">{backupSub}</span>
          </div>
          {isNative && (
            <div className="seg">
              {([true, false] as const).map((v) => (
                <Chip key={String(v)} className="chip--wide" on={p.settings.autoBackup === v} onClick={() => p.onSettings({ autoBackup: v })}>{v ? 'On' : 'Off'}</Chip>
              ))}
            </div>
          )}
        </div>
        {isNative && p.settings.autoBackup && (
          <div className="key-remove"><button className="text-btn text-btn--muted" onClick={p.onBackupNow}><Icon name="backup" />Back up now</button></div>
        )}
      </div>
      <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={pick} />

      <div className="section-label">DISPLAY</div>
      <div className="card">
        <div className="setting setting--stack">
          <span className="setting-label">Theme</span>
          <div className="seg seg--fill">
            {THEMES.map(([v, label]) => (
              <Chip key={v} className="chip--wide" on={p.settings.theme === v} onClick={() => p.onSettings({ theme: v })}>{label}</Chip>
            ))}
          </div>
        </div>
        <div className="divider" />
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
        {p.settings.rating === 'tap' && (
          <>
            <div className="divider" />
            <div className="setting">
              <div className="setting-text">
                <span className="setting-label">Tapping again</span>
                <span className="setting-sub">Tap 6 twice for {p.settings.tapHalf === 'up' ? '6.5' : '5.5'}</span>
              </div>
              <div className="seg">
                {(['down', 'up'] as const).map((v) => (
                  <Chip key={v} className="chip--wide" on={p.settings.tapHalf === v} onClick={() => p.onSettings({ tapHalf: v })}>{v === 'down' ? '−0.5' : '+0.5'}</Chip>
                ))}
              </div>
            </div>
          </>
        )}
        <div className="divider" />
        <div className="setting">
          <div className="setting-text">
            <span className="setting-label">Public ratings</span>
            <span className="setting-sub">AniList and TMDB scores on title pages</span>
          </div>
          <div className="seg">
            {([true, false] as const).map((v) => (
              <Chip key={String(v)} className="chip--wide" on={p.settings.publicScores === v} onClick={() => p.onSettings({ publicScores: v })}>{v ? 'Show' : 'Hide'}</Chip>
            ))}
          </div>
        </div>
        <div className="divider" />
        <div className="setting">
          <div className="setting-text">
            <span className="setting-label">Rewatch shading</span>
            <span className="setting-sub">Episodes watched more often are a darker red</span>
          </div>
          <div className="seg">
            {([true, false] as const).map((v) => (
              <Chip key={String(v)} className="chip--wide" on={p.settings.rewatchShades === v} onClick={() => p.onSettings({ rewatchShades: v })}>{v ? 'On' : 'Off'}</Chip>
            ))}
          </div>
        </div>
        <div className="divider" />
        <div className="setting">
          <div className="setting-text">
            <span className="setting-label">Group anime</span>
            <span className="setting-sub">Seasons, movies and OVAs as one title</span>
          </div>
          <div className="seg">
            {([true, false] as const).map((v) => (
              <Chip key={String(v)} className="chip--wide" on={p.settings.groupAnime === v} onClick={() => p.onSettings({ groupAnime: v })}>{v ? 'On' : 'Off'}</Chip>
            ))}
          </div>
        </div>
        {p.settings.groupAnime && (
          <>
            <div className="divider" />
            <div className="setting setting--stack">
              <div className="setting-text">
                <span className="setting-label">All episodes on a group</span>
                <span className="setting-sub">
                  {p.settings.groupEps === 'continuous'
                    ? 'One run of numbers through every season'
                    : p.settings.groupEps === 'seasons'
                      ? 'Each season numbered from 1, under S1, S2…'
                      : "Every season's episodes on the group's page"}
                </span>
              </div>
              <div className="seg seg--fill">
                {GROUP_EPS.map(([v, label]) => (
                  <Chip key={v} className="chip--wide" on={p.settings.groupEps === v} onClick={() => p.onSettings({ groupEps: v })}>{label}</Chip>
                ))}
              </div>
            </div>
          </>
        )}
        <div className="divider" />
        <div className="setting">
          <div className="setting-text">
            <span className="setting-label">Anime titles</span>
            <span className="setting-sub">Shingeki no Kyojin or Attack on Titan</span>
          </div>
          <div className="seg">
            {(['romaji', 'english'] as const).map((v) => (
              <Chip key={v} className="chip--wide" on={p.settings.titles === v} onClick={() => p.onSettings({ titles: v })}>{v === 'romaji' ? 'Japanese' : 'English'}</Chip>
            ))}
          </div>
        </div>
        <div className="divider" />
        <div className="setting setting--stack">
          <div className="setting-text">
            <span className="setting-label">Anime films</span>
            <span className="setting-sub">Which tab lists your anime movies</span>
          </div>
          <div className="seg seg--fill">
            {FILMS.map(([v, label]) => (
              <Chip key={v} className="chip--wide" on={p.settings.animeFilms === v} onClick={() => p.onSettings({ animeFilms: v })}>{label}</Chip>
            ))}
          </div>
        </div>
      </div>

      <div className="section-label">SOURCES</div>
      <KeyCard
        title="TMDB API key"
        badge={p.settings.tmdbKey ? ['CONNECTED', OK] : ['OFFLINE CATALOGUE', WARN]}
        body={<>Movies and TV: search, posters, seasons, cast. Get a free key at <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noreferrer">themoviedb.org</a>. API key or read access token both work.</>}
        placeholder="Paste key"
        has={!!p.settings.tmdbKey}
        removeLabel="Remove key"
        onSave={saveTmdb}
        onRemove={() => { p.onSettings({ tmdbKey: '' }); p.toast('TMDB key removed'); }}
      />
      <div className="card">
        <div className="card-head">
          <div className="card-title-row">
            <span className="card-title">AniList</span>
            <span className="tag" style={{ color: OK }}>NO KEY NEEDED</span>
          </div>
          <div className="card-body">Anime: search, posters, related seasons and movies, characters and staff, from <a href="https://anilist.co" target="_blank" rel="noreferrer">anilist.co</a>.</div>
        </div>
      </div>

      <div className="section-label">ABOUT</div>
      <div className="card">
        <div className="card-head">
          <div className="card-title-row">
            <span className="card-title">Reelog {__APP_VERSION__}</span>
          </div>
          <div className="card-body">
            Your log stays on this device. Reelog has no account and no analytics; it only talks to TMDB and AniList to look titles up, and to GitHub when you check for updates.
          </div>
        </div>
        <button className="menu-btn" disabled={checking} onClick={checkUpdate}>
          <Icon name="system_update" />
          <div className="menu-text">
            <span className="menu-title">{checking ? 'Checking…' : 'Check for updates'}</span>
          </div>
        </button>
        <div className="divider" />
        <a className="menu-btn" href={REPO_URL} target="_blank" rel="noreferrer">
          <Icon name="code" />
          <div className="menu-text">
            <span className="menu-title">Source code and releases</span>
            <span className="menu-sub">github.com/LAUGHINGCATMEME/Reelog</span>
          </div>
          <Icon name="open_in_new" className="chev" />
        </a>
        <div className="divider" />
        <div className="card-head">
          <div className="card-body attribution">
            This product uses the TMDB API but is not endorsed or certified by TMDB. Anime data from AniList. Movie, show and anime names, images and descriptions belong to their owners.
          </div>
        </div>
      </div>

      <div className="section-label">DATA</div>
      <div className="card">
        <button className="menu-btn" onClick={p.onClearCache}>
          <Icon name="refresh" className="muted" />
          <div className="menu-text">
            <span className="menu-title">Refresh title details</span>
            <span className="menu-sub">Fetch posters, episode counts and cast again. Your log isn't touched.</span>
          </div>
        </button>
      </div>
      <div className="center-row" style={{ paddingTop: 28 }}>
        <button className="text-btn" onClick={p.onErase}><Icon name="delete_forever" />Erase all data</button>
      </div>
    </div>
  );
}
