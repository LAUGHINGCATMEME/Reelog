import { useEffect, useRef, useState } from 'react';
import { BackBar, Icon, Poster, Skeletons, StatusText } from '../components/ui';
import { searchAnime } from '../lib/anime';
import { searchCatalog } from '../lib/catalog';
import { fmtRuntime } from '../lib/format';
import { entriesOf, getMeta, isFilm, showTitle, SMAP, statusOf, titleInfo } from '../lib/library';
import { findInLibrary } from '../lib/shelf';
import { searchMovies, searchTv } from '../lib/tmdb';
import type { Data, Kind, SearchHit, Settings } from '../lib/types';
import { TAB } from './Library';

type Status = 'idle' | 'loading' | 'done' | 'error';

type Props = {
  kind: Kind;
  /** Kept by the app so the query survives opening a result and coming back. */
  query: string;
  onQuery: (q: string) => void;
  data: Data;
  settings: Settings;
  onBack: () => void;
  onOpen: (kind: Kind, id: number) => void;
  onPick: (hit: SearchHit) => void;
  onTogglePlan: (hit: SearchHit) => void;
};

const HINTS: Record<Kind, string> = {
  movie: 'Search by title. Tap a result to log a watch.',
  tv: 'Search by title, then pick a season to log episodes.',
  anime: 'Search by title, then log episodes.',
};

// Recent online results, so going back to a search shows them at once instead of refetching.
const recent = new Map<string, SearchHit[]>();

export function Search({ kind: K, query, onQuery: setQuery, data, settings, onBack, onOpen, onPick, onTogglePlan }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const q = query.trim();
  const cached = recent.get(`${K}|${q}`);
  const [results, setResults] = useState<SearchHit[]>(cached ?? []);
  const [status, setStatus] = useState<Status>(cached ? 'done' : 'idle');
  const [retry, setRetry] = useState(0);
  const online = K === 'anime' || !!settings.tmdbKey;

  useEffect(() => {
    if (query) return; // coming back to a search: don't pop the keyboard over the results
    const t = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!q) {
      setStatus('idle');
      setResults([]);
      return;
    }
    if (!online) {
      setResults(searchCatalog(K, q));
      setStatus('done');
      return;
    }
    const hit = recent.get(`${K}|${q}`);
    if (hit && !retry) {
      setResults(hit);
      setStatus('done');
      return;
    }
    setStatus('loading');
    const ctrl = new AbortController();
    const t = window.setTimeout(async () => {
      try {
        const res =
          K === 'movie' ? await searchMovies(settings.tmdbKey, q, ctrl.signal)
          : K === 'tv' ? await searchTv(settings.tmdbKey, q, ctrl.signal)
          : await searchAnime(q, ctrl.signal);
        recent.set(`${K}|${q}`, res);
        if (recent.size > 20) recent.delete(recent.keys().next().value!);
        setResults(res);
        setStatus('done');
      } catch {
        if (!ctrl.signal.aborted) setStatus('error');
      }
    }, K === 'anime' ? 450 : 350);
    return () => {
      ctrl.abort();
      window.clearTimeout(t);
    };
  }, [q, K, online, settings.tmdbKey, retry]);

  const local = findInLibrary(data, K, settings.animeFilms, q).slice(0, 6);
  const source = K === 'anime' ? 'ANILIST' : settings.tmdbKey ? 'TMDB' : 'BUILT-IN CATALOGUE';

  return (
    <div className="screen">
      <BackBar onBack={onBack}>
        <div className="search-field">
          <input
            ref={inputRef}
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            value={query}
            placeholder={TAB[K].ph}
            aria-label={TAB[K].ph}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.blur()}
          />
          {query && (
            <button className="icon-btn" aria-label="Clear" onClick={() => { setQuery(''); inputRef.current?.focus(); }}>
              <Icon name="close" />
            </button>
          )}
        </div>
      </BackBar>

      {!q && (
        <div className="hint">
          {HINTS[K]}
          <div className="hint-sub">
            {K === 'anime' ? 'Results from AniList' : settings.tmdbKey ? 'Results from TMDB' : 'Built-in catalogue · add a TMDB key in Settings for full search'}
          </div>
        </div>
      )}

      {!!local.length && (
        <>
          <div className="section-label" style={{ paddingTop: 8 }}>IN YOUR LIBRARY</div>
          <div className="list list--flush">
            {local.map((x) => (
              <button key={`${x.kind}:${x.id}`} className="row-btn row-btn--compact" onClick={() => onOpen(x.kind, x.id)}>
                <Poster src={x.m.img} size="sm" />
                <div className="row-body">
                  <div className="row-title row-title--sm">{x.m.title}</div>
                  <StatusText status={x.status} className="row-tag" />
                </div>
                <Icon name="chevron_right" className="chev" />
              </button>
            ))}
          </div>
        </>
      )}

      {!!q && (
        <div className="source-row"><span>FROM {source}</span><span>{status === 'done' ? results.length : ''}</span></div>
      )}
      {!!q && status === 'loading' && <Skeletons />}
      {!!q && status === 'error' && (
        <div className="empty empty--sm">
          <Icon name="cloud_off" />
          <div className="empty-body empty-body--wide">
            {K === 'anime' ? "Couldn't reach AniList. Check your connection." : "Couldn't reach TMDB. Check your connection."}
          </div>
          <button className="text-btn text-btn--strong" onClick={() => setRetry((r) => r + 1)}><Icon name="refresh" />Try again</button>
        </div>
      )}
      {!!q && status === 'done' && !results.length && <div className="hint" style={{ padding: 32 }}>No matches for “{q}”.</div>}

      {!!q && status === 'done' && !!results.length && (
        <div className="list list--flush">
          {results.map((r) => {
            const m = getMeta(data, K, r.id);
            const img = r.img || m.img;
            const st = K === 'tv' ? titleInfo(data, 'tv', r.id).status : statusOf(data, K, r.id);
            const film = K === 'anime' && isFilm(r);
            const watches = K === 'movie' || film ? entriesOf(data, K, r.id).length : 0;
            const sub = (K === 'anime' ? [r.year, film ? fmtRuntime(r.dur) : r.episodes && `${r.episodes} eps`, r.type] : [r.year || m.year, K === 'movie' && m.director])
              .filter(Boolean).join(' · ') || 'Year unknown';
            const planned = st === 'planned';
            return (
              <div key={r.id} className="result-row">
                <button className="row-btn row-btn--compact" onClick={() => onPick(r)}>
                  <Poster src={img} size="sm" />
                  <div className="row-body">
                    <div className="row-title row-title--sm">{showTitle(r)}</div>
                    <div className="row-sub">{sub}</div>
                    {st && (
                      <div className="row-tag" style={{ color: SMAP[st].color }}>
                        {watches ? `Logged ×${watches}` : SMAP[st].label}
                      </div>
                    )}
                  </div>
                  {K === 'movie' && <Icon name="add_circle" className="muted" />}
                </button>
                {/* TV status lives per season, so shows are planned from their seasons instead. */}
                {K !== 'tv' && (
                  <button
                    className="icon-btn plan-btn"
                    aria-label={planned ? 'Remove from Planned' : 'Add to Planned'}
                    disabled={!!st && !planned}
                    onClick={() => onTogglePlan(r)}
                    style={planned ? { color: 'var(--accent-text)' } : undefined}
                  >
                    <Icon name={planned ? 'bookmark_added' : st ? 'check' : 'bookmark_add'} className={planned ? 'ms--fill' : ''} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
