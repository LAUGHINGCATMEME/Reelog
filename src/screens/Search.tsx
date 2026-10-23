import { useEffect, useRef, useState } from 'react';
import { Icon, Poster } from '../components/ui';
import { searchCatalog } from '../lib/catalog';
import { plural } from '../lib/format';
import { searchMovies } from '../lib/tmdb';
import type { Movie } from '../lib/types';

type Status = 'idle' | 'loading' | 'done' | 'error';

type Props = {
  query: string;
  onQuery: (q: string) => void;
  tmdbKey: string;
  loggedCount: (id: number) => number;
  /** Fills in director/year for catalogue movies we already know about. */
  known: (m: Movie) => Movie;
  onBack: () => void;
  onPick: (m: Movie) => void;
};

export function Search({ query, onQuery, tmdbKey, loggedCount, known, onBack, onPick }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [results, setResults] = useState<Movie[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const q = query.trim();

  useEffect(() => {
    const t = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!q) {
      setStatus('idle');
      setResults([]);
      return;
    }
    setStatus('loading');
    const ctrl = new AbortController();
    const t = window.setTimeout(async () => {
      try {
        const res = tmdbKey ? await searchMovies(q, tmdbKey, ctrl.signal) : searchCatalog(q);
        setResults(res);
        setStatus('done');
      } catch (e) {
        if (ctrl.signal.aborted) return;
        setError(e instanceof Error && e.message.startsWith('TMDB') ? e.message : "Couldn't reach TMDB. Check your connection.");
        setStatus('error');
      }
    }, tmdbKey ? 350 : 200);
    return () => {
      ctrl.abort();
      window.clearTimeout(t);
    };
  }, [q, tmdbKey, retry]);

  return (
    <div className="screen" style={{ paddingBottom: 120 }}>
      <div className="topbar topbar--back">
        <button className="icon-btn" aria-label="Back" onClick={onBack}><Icon name="arrow_back" /></button>
        <div className="search-field">
          <input
            ref={inputRef}
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            value={query}
            placeholder="Search movies"
            aria-label="Search movies"
            onChange={(e) => onQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.blur()}
          />
          {query && (
            <button
              className="icon-btn icon-btn--muted"
              aria-label="Clear"
              onClick={() => {
                onQuery('');
                inputRef.current?.focus();
              }}
            >
              <Icon name="close" />
            </button>
          )}
        </div>
      </div>

      {status === 'idle' && (
        <div className="hint">
          Search by title. Tap a result to log a watch.
          <div className="hint-sub">{tmdbKey ? 'Results from TMDB' : 'Built-in catalogue · add a TMDB key in Data for full search'}</div>
        </div>
      )}

      {status === 'loading' && (
        <div className="skeletons" aria-label="Loading">
          {[1, 2, 3, 4].map((k) => (
            <div key={k} className="skel">
              <div className="skel-poster" />
              <div className="skel-lines"><div className="skel-line" /><div className="skel-line" /></div>
            </div>
          ))}
        </div>
      )}

      {status === 'error' && (
        <div className="hint">
          {error}
          <div style={{ marginTop: 14, display: 'flex', justifyContent: 'center' }}>
            <button className="text-btn" onClick={() => setRetry((r) => r + 1)}><Icon name="refresh" />Try again</button>
          </div>
        </div>
      )}

      {status === 'done' && !results.length && <div className="hint">No movies match “{q}”.</div>}

      {status === 'done' && !!results.length && (
        <>
          <div className="result-count">{plural(results.length, 'result')}</div>
          <div className="results">
            {results.map((r) => {
              const m = known(r);
              const n = loggedCount(r.id);
              return (
                <button key={r.id} className="row-btn" onClick={() => onPick(m)}>
                  <Poster src={m.image} size="sm" label={false} />
                  <div className="row-body">
                    <div className="row-title">{m.title}</div>
                    <div className="row-sub">{[m.year, m.director].filter(Boolean).join(' · ') || 'Year unknown'}</div>
                    {n > 0 && <div className="logged">Logged ×{n}</div>}
                  </div>
                  <Icon name="add_circle" className="icon-btn--muted" />
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
