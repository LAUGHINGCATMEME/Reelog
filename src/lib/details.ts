import { useEffect, useState } from 'react';
import { animeExtra } from './anime';
import { movieExtra, tvExtra } from './tmdb';
import type { Details, Kind } from './types';

/*
 * Overviews, cast and crew are only needed on detail pages, and are much bigger than the rest
 * of a title's details. So they're fetched when a page opens and kept in their own cache: the
 * most recently opened titles, capped, apart from the log so they can never crowd it out of storage.
 */

const KEY = 'reelog-details';
const MAX = 150;
/** Refetch after this long, so airing dates and statuses stay current. */
const STALE = 3 * 864e5;

let cache: Record<string, Details> | null = null;

function load() {
  if (!cache) {
    try {
      cache = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, Details>;
    } catch {
      cache = {};
    }
  }
  return cache;
}

function store(k: string, d: Details) {
  const c = load();
  delete c[k];
  c[k] = d;
  const keys = Object.keys(c);
  for (const old of keys.slice(0, Math.max(0, keys.length - MAX))) delete c[old];
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    /* full: it's only a cache */
  }
}

export function clearDetails() {
  cache = {};
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

const inflight = new Map<string, Promise<Details>>();

function fetchDetails(kind: Kind, id: number, tmdbKey: string) {
  const k = `${kind}:${id}`;
  let p = inflight.get(k);
  if (!p) {
    p = kind === 'anime' ? animeExtra(id) : kind === 'movie' ? movieExtra(tmdbKey, id) : tvExtra(tmdbKey, id);
    inflight.set(k, p);
    void p.then((d) => store(k, d), () => {}).finally(() => inflight.delete(k));
  }
  return p;
}

/** A title's details: from the cache at once, refetched in the background when stale. */
export function useDetails(kind: Kind, id: number, tmdbKey: string) {
  const k = `${kind}:${id}`;
  const [state, setState] = useState<{ k: string; d?: Details; loading: boolean }>(() => ({ k, d: load()[k], loading: false }));
  const online = kind === 'anime' || !!tmdbKey;

  useEffect(() => {
    const have = load()[k];
    setState({ k, d: have, loading: false });
    if (!online || (have && Date.now() - have.at < STALE)) return;
    let live = true;
    setState({ k, d: have, loading: true });
    fetchDetails(kind, id, tmdbKey).then(
      (d) => live && setState({ k, d, loading: false }),
      () => live && setState({ k, d: have, loading: false }),
    );
    return () => {
      live = false;
    };
  }, [k, online, tmdbKey]);

  return state.k === k ? state : { k, d: load()[k], loading: false };
}
