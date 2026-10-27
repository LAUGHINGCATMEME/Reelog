import { fromMalIds } from './anime';
import { clean } from './library';
import { entrySig } from './store';
import type { Data, LegacyMal, Meta } from './types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Every MyAnimeList id the old anime records mention. */
function malIds(l: LegacyMal) {
  const ids = new Set<number>();
  for (const e of l.entries) ids.add(e.ref);
  for (const k of [...Object.keys(l.status), ...Object.keys(l.rates)]) ids.add(+k.split(':')[1]);
  for (const [k, v] of Object.entries(l.animeGroups)) ids.add(+k).add(v);
  return [...ids].filter((n) => Number.isInteger(n) && n > 0);
}

export type Converted = { map: Map<number, number>; meta: Map<number, Partial<Meta>>; missing: number };

/** Looks up the AniList id of every old MAL id, 50 per request. Throws when offline. */
export async function lookupLegacy(l: LegacyMal): Promise<Converted> {
  const ids = malIds(l);
  const map = new Map<number, number>();
  const meta = new Map<number, Partial<Meta>>();
  for (let i = 0; i < ids.length; i += 50) {
    if (i) await sleep(2100);
    const r = await fromMalIds(ids.slice(i, i + 50));
    for (const [mal, x] of r) {
      map.set(mal, x.id);
      meta.set(x.id, x.meta);
    }
  }
  return { map, meta, missing: ids.filter((id) => !map.has(id)).length };
}

/**
 * Moves the old anime records into the log under their AniList ids. Anything AniList has no
 * match for stays in legacyMal, so it's kept and still goes into backups.
 */
export function applyLegacy(d: Data, c: Converted): Data {
  const l = d.legacyMal;
  if (!l) return d;
  const to = (mal: number) => c.map.get(mal);
  const keyTo = (k: string) => {
    const id = to(+k.split(':')[1]);
    return id ? `anime:${id}` : null;
  };
  const left: LegacyMal = { entries: [], status: {}, rates: {}, animeGroups: {}, titles: {} };

  const seen = new Set(d.entries.map(entrySig));
  const entries = [...d.entries];
  for (const e of l.entries) {
    const id = to(e.ref);
    if (!id) {
      left.entries.push(e);
      continue;
    }
    const n = { ...e, ref: id };
    if (!seen.has(entrySig(n))) entries.push(n);
  }

  const status = { ...d.status };
  for (const [k, v] of Object.entries(l.status)) {
    const nk = keyTo(k);
    if (!nk) left.status[k] = v;
    else status[nk] ??= v;
  }
  const rates = { ...d.rates };
  for (const [k, v] of Object.entries(l.rates)) {
    const nk = keyTo(k);
    if (!nk) left.rates[k] = v;
    else rates[nk] ??= v;
  }
  const animeGroups = { ...d.animeGroups };
  for (const [k, v] of Object.entries(l.animeGroups)) {
    const a = to(+k);
    const b = to(v);
    if (a && b) animeGroups[a] ??= b;
    else left.animeGroups[k] = v;
  }

  const meta = { ...d.meta };
  for (const [id, m] of c.meta) meta[`anime:${id}`] = { ...clean(m), ...meta[`anime:${id}`] };

  for (const id of malIds(left)) if (l.titles?.[id]) left.titles[id] = l.titles[id];
  const hasLeft = left.entries.length || Object.keys(left.status).length || Object.keys(left.rates).length;
  const { legacyMal: _, ...rest } = d;
  return { ...rest, entries, status, rates, animeGroups, meta, ...(hasLeft ? { legacyMal: left } : {}) };
}
