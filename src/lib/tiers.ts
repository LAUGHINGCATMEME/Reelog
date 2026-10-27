import { newId } from './store';
import { getMeta, mkey, type TitleInfo } from './library';
import type { Data, Kind, Meta, Tier, TierList } from './types';

/** Where an item sits or goes: a tier's id (or POOL, the unranked ones) and its position there. */
export type Place = { tier: string; index: number };
export const POOL = 'pool';

/** Tier colours, in the order new tiers take them. All read with dark text on top. */
export const TIER_COLORS = ['#E5485C', '#E8834A', '#D9B44A', '#7AA252', '#4FA3A0', '#5B8DB8', '#8B7FA8', '#A0989A'];
const DEFAULT_TIERS = ['S', 'A', 'B', 'C', 'D', 'F'];
/** Lowest score for each default tier when filling a list from ratings; below the last goes in F. */
const FLOORS = [9, 8, 7, 6, 5];

const tier = (label: string, color: string, items: string[] = []): Tier => ({ id: newId('r'), label, color, items });

/**
 * A new list with tiers S to F. With `rated`, every title that has a rating is placed by it
 * (9+ in S, 8+ in A, … under 5 in F), best first within each tier.
 */
export function newTierList(name: string, kinds: Kind[], rated?: TitleInfo[]): TierList {
  const now = new Date().toISOString();
  const tiers = DEFAULT_TIERS.map((label, i) => tier(label, TIER_COLORS[i]));
  const seen = new Set<string>();
  const ranked = [...(rated ?? [])].filter((x) => x.score != null).sort((a, b) => b.score! - a.score! || a.m.title.localeCompare(b.m.title));
  for (const x of ranked) {
    const k = mkey(x.kind, x.id);
    if (seen.has(k)) continue;
    seen.add(k);
    const i = FLOORS.findIndex((f) => x.score! >= f);
    tiers[i < 0 ? tiers.length - 1 : i].items.push(k);
  }
  return { id: newId('t'), name, kinds, tiers, pool: [], created: now, updated: now };
}

/** A tier for the end of the list: the next unused letter, and the next colour along. */
export function nextTier(l: TierList): Tier {
  const used = new Set(l.tiers.map((t) => t.label));
  const label = [...'SABCDEFGHIJ'].find((c) => !used.has(c)) ?? 'New';
  return tier(label, TIER_COLORS[l.tiers.length % TIER_COLORS.length]);
}

export const listKeys = (l: TierList) => [...l.tiers.flatMap((t) => t.items), ...l.pool];
export const rankedCount = (l: TierList) => l.tiers.reduce((n, t) => n + t.items.length, 0);

const rows = (l: TierList): [string, string[]][] => [...l.tiers.map((t): [string, string[]] => [t.id, t.items]), [POOL, l.pool]];

/** Where `key` is now, as a place it could be moved back to. */
export function placeOf(l: TierList, key: string): Place | null {
  for (const [id, items] of rows(l)) {
    const i = items.indexOf(key);
    if (i >= 0) return { tier: id, index: i };
  }
  return null;
}

/** Takes `key` out of wherever it is. */
export function removeItem(l: TierList, key: string): TierList {
  const out = (a: string[]) => a.filter((k) => k !== key);
  return { ...l, tiers: l.tiers.map((t) => ({ ...t, items: out(t.items) })), pool: out(l.pool) };
}

/** Moves (or adds) `key` to `to`. The index counts the target's items without `key` itself. */
export function moveItem(l: TierList, key: string, to: Place): TierList {
  const r = removeItem(l, key);
  const put = (a: string[]) => {
    const b = [...a];
    b.splice(Math.max(0, Math.min(to.index, b.length)), 0, key);
    return b;
  };
  if (to.tier === POOL) return { ...r, pool: put(r.pool) };
  return { ...r, tiers: r.tiers.map((t) => (t.id === to.tier ? { ...t, items: put(t.items) } : t)) };
}

/** Adds titles to the unranked pool, skipping ones already in the list. */
export function addItems(l: TierList, keys: string[]): TierList {
  const have = new Set(listKeys(l));
  return { ...l, pool: [...l.pool, ...keys.filter((k) => !have.has(k) && !!have.add(k))] };
}

/** Deletes a tier; its titles go back to the pool. */
export function deleteTier(l: TierList, id: string): TierList {
  const t = l.tiers.find((x) => x.id === id);
  return { ...l, tiers: l.tiers.filter((x) => x.id !== id), pool: [...(t?.items ?? []), ...l.pool] };
}

/** Moves a tier up (-1) or down (+1). */
export function shiftTier(l: TierList, id: string, by: -1 | 1): TierList {
  const i = l.tiers.findIndex((x) => x.id === id);
  const j = i + by;
  if (i < 0 || j < 0 || j >= l.tiers.length) return l;
  const tiers = [...l.tiers];
  [tiers[i], tiers[j]] = [tiers[j], tiers[i]];
  return { ...l, tiers };
}

/** Every ranked title back to the pool, in rank order. */
export const clearTiers = (l: TierList): TierList => ({
  ...l,
  tiers: l.tiers.map((t) => ({ ...t, items: [] })),
  pool: [...l.tiers.flatMap((t) => t.items), ...l.pool],
});

/** The title behind an item key. */
export function itemMeta(data: Data, key: string): { kind: Kind; id: number; m: Meta } {
  const [kind, id] = key.split(':') as [Kind, string];
  return { kind, id: +id, m: getMeta(data, kind, +id) };
}

const KIND_NAMES: Record<Kind, string> = { movie: 'Movies', tv: 'TV', anime: 'Anime' };
/** "Movies", "Movies & Anime", "Movies, TV & Anime". */
export function kindsLabel(kinds: Kind[]) {
  const n = (['movie', 'tv', 'anime'] as const).filter((k) => kinds.includes(k)).map((k) => KIND_NAMES[k]);
  return n.length > 1 ? `${n.slice(0, -1).join(', ')} & ${n[n.length - 1]}` : n[0] ?? '';
}

/** The list as plain text, one tier per line: "S: Heat, Drive". */
export function tierText(data: Data, l: TierList) {
  const name = (k: string) => itemMeta(data, k).m.title;
  const lines = l.tiers.map((t) => `${t.label || '·'}: ${t.items.map(name).join(', ') || '—'}`);
  return `${l.name}\n\n${lines.join('\n')}`;
}
