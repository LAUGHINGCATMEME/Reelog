import { useEffect, useState } from 'react';
import type { Data, Settings } from './types';

export const DATA_KEY = 'reelog-v1';
export const SETTINGS_KEY = 'reelog-settings';

export const EMPTY_DATA: Data = { entries: [], extra: {} };
export const DEFAULT_SETTINGS: Settings = {
  tmdbKey: import.meta.env.VITE_TMDB_KEY ?? '',
  layout: 'list',
  ratingInput: 'slider',
};

function load<T extends object>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

/** useState backed by localStorage. */
export function usePersisted<T extends object>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => load(key, fallback));
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage full or blocked — keep working in memory */
    }
  }, [key, value]);
  return [value, setValue] as const;
}

let uid = Date.now();
export const newId = (prefix = 'e') => prefix + (uid++).toString(36);
