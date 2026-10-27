import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { animeBatch, animeTitles, BATCH, RateLimited, TITLE_BATCH } from './anime';
import { clean, getMeta, mkey } from './library';
import { movieDetails, tvDetails } from './tmdb';
import type { Data, Kind, Meta, Settings } from './types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Queue key for fetching just an anime's English title. */
const TITLE = 'title:';

/** Retries an AniList request once after waiting out a rate limit. */
async function paced<T>(f: () => Promise<T>): Promise<T> {
  try {
    return await f();
  } catch (e) {
    if (!(e instanceof RateLimited)) throw e;
    await sleep(Math.min(90, e.retryAfter) * 1000);
    return f();
  }
}

/**
 * Background queue that fetches full details (posters, runtimes, seasons, episode counts) for
 * titles. One request at a time. Anime go to AniList up to BATCH per request, paced for its
 * rate limit (30 requests a minute while it's degraded, 90 normally), which matters when a
 * library's franchise links are first walked. Anime saved before Reelog kept English titles get
 * theirs with a lighter query, TITLE_BATCH at a time, in the same queue.
 */
export function useEnricher(data: Data, setData: Dispatch<SetStateAction<Data>>, settings: Settings) {
  const dataRef = useRef(data);
  dataRef.current = data;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const queue = useRef<string[]>([]);
  const queued = useRef(new Set<string>());
  const running = useRef(false);
  const [loading, setLoading] = useState<ReadonlySet<string>>(new Set());

  const mark = (keys: string[], on: boolean) =>
    setLoading((s) => {
      const n = new Set(s);
      for (const k of keys) on ? n.add(k) : n.delete(k);
      return n;
    });

  /** Fills in fields of `k` the record doesn't have yet (for anime only seen as a relation). */
  const fill = (meta: Data['meta'], k: string, m: Partial<Meta>) => {
    meta[k] = { ...clean(m), ...meta[k] };
  };

  const runTitles = async (keys: string[]) => {
    const ids = keys.map((k) => +k.split(':')[2]);
    const r = await paced(() => animeTitles(ids));
    setData((prev) => {
      const meta = { ...prev.meta };
      for (const id of ids) {
        const k = mkey('anime', id);
        const t = r.get(id);
        // Ones AniList doesn't know any more keep the title they have, so they aren't asked for again.
        meta[k] = t ? { ...meta[k], ...t } : { ...meta[k], titleEn: meta[k]?.titleEn || meta[k]?.title || `AniList #${id}` };
      }
      return { ...prev, meta };
    });
  };

  const runAnime = async (keys: string[]) => {
    const ids = keys.map((k) => +k.split(':')[1]);
    const r = await paced(() => animeBatch(ids));
    setData((prev) => {
      const meta = { ...prev.meta };
      for (const [id, m] of r.related) fill(meta, mkey('anime', id), m);
      for (const [id, m] of r.full) meta[mkey('anime', id)] = { ...meta[mkey('anime', id)], ...clean(m), rel: m.rel ?? [] };
      // Ids AniList doesn't know (removed entries): stop asking for them.
      for (const id of ids) if (!r.full.has(id)) meta[mkey('anime', id)] = { ...meta[mkey('anime', id)], full: true, rel: [] };
      return { ...prev, meta };
    });
  };

  const pump = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    while (queue.current.length) {
      const first = queue.current[0];
      const isAnime = first.startsWith('anime:');
      const isTitle = first.startsWith(TITLE);
      // Anime go in batches: the first in the queue plus the next ones waiting.
      const batch = (prefix: string, n: number) => queue.current.filter((k) => k.startsWith(prefix)).slice(0, n);
      const keys = isAnime ? batch('anime:', BATCH) : isTitle ? batch(TITLE, TITLE_BATCH) : [first];
      queue.current = queue.current.filter((k) => !keys.includes(k));
      mark(keys, true);
      try {
        if (isAnime) await runAnime(keys);
        else if (isTitle) await runTitles(keys);
        else {
          const [kind, id] = first.split(':') as [Kind, string];
          const s = settingsRef.current;
          const m = kind === 'movie' ? await movieDetails(s.tmdbKey, +id) : await tvDetails(s.tmdbKey, +id);
          setData((prev) => ({ ...prev, meta: { ...prev.meta, [first]: { ...prev.meta[first], ...clean(m) } } }));
        }
      } catch {
        // Offline, bad key or AniList down: keep what we have and try again next launch.
      }
      // Keys stay in `queued` either way: a failure is retried next launch, not in a loop now.
      mark(keys, false);
      if (isAnime || isTitle) await sleep(2100);
    }
    running.current = false;
  }, [setData]);

  /** Queues a title for details if it doesn't have them yet. `priority` puts it first (the open screen). */
  const ensure = useCallback(
    (kind: Kind, id: number, priority = false) => {
      if (kind !== 'anime' && !settingsRef.current.tmdbKey) return;
      if (getMeta(dataRef.current, kind, id).full) return;
      const k = mkey(kind, id);
      if (queued.current.has(k)) {
        if (priority && queue.current.includes(k)) queue.current = [k, ...queue.current.filter((x) => x !== k)];
      } else {
        queued.current.add(k);
        if (priority) queue.current.unshift(k);
        else queue.current.push(k);
      }
      void pump();
    },
    [pump],
  );

  /**
   * Queues English titles for anime that were saved without one. Anime still waiting for full
   * details are skipped: those details bring the English title with them.
   */
  const ensureTitles = useCallback(
    (ids: number[]) => {
      let added = false;
      for (const id of ids) {
        const m = dataRef.current.meta[mkey('anime', id)];
        const k = `${TITLE}anime:${id}`;
        if (!m?.full || m.titleEn || queued.current.has(k)) continue;
        queued.current.add(k);
        queue.current.push(k);
        added = true;
      }
      if (added) void pump();
    },
    [pump],
  );

  return { ensure, ensureTitles, loading };
}
