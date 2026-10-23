import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { animeDetails } from './anime';
import { clean, getMeta, mkey } from './library';
import { HttpError, movieDetails, tvDetails } from './tmdb';
import type { Data, Kind, Meta, Settings } from './types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Background queue that fetches full details (posters, runtimes, seasons, episode counts) for
 * titles. One request at a time; anime is paced for Jikan's ~3 requests/second limit.
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

  const fetchOne = async (kind: Kind, id: number): Promise<Partial<Meta>> => {
    const s = settingsRef.current;
    if (kind === 'movie') return movieDetails(s.tmdbKey, id);
    if (kind === 'tv') return tvDetails(s.tmdbKey, id);
    try {
      return await animeDetails(id, s.malKey);
    } catch (e) {
      if (!(e instanceof HttpError && e.status === 429)) throw e;
      await sleep(1500);
      return animeDetails(id, s.malKey);
    }
  };

  const pump = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    while (queue.current.length) {
      const k = queue.current.shift()!;
      const [kind, idStr] = k.split(':') as [Kind, string];
      setLoading((s) => new Set(s).add(k));
      try {
        const m = await fetchOne(kind, +idStr);
        setData((prev) => ({ ...prev, meta: { ...prev.meta, [k]: { ...prev.meta[k], ...clean(m) } } }));
      } catch {
        /* offline, bad key or unknown id — keep what we have; retried next launch */
      }
      setLoading((s) => {
        const n = new Set(s);
        n.delete(k);
        return n;
      });
      if (kind === 'anime') await sleep(400);
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
        if (priority && queue.current.includes(k)) {
          queue.current = [k, ...queue.current.filter((x) => x !== k)];
        }
      } else {
        queued.current.add(k);
        if (priority) queue.current.unshift(k);
        else queue.current.push(k);
      }
      void pump();
    },
    [pump],
  );

  return { ensure, loading };
}
