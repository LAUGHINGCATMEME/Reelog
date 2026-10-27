import { HttpError } from './tmdb';
import type { Details, Meta, Person, SearchHit } from './types';

/*
 * Anime data comes from AniList's public GraphQL API: no key, and it allows browser requests,
 * so the web build and the Android app work the same way. AniList ids are the anime ids
 * everywhere in Reelog.
 */

const API = 'https://graphql.anilist.co';

/**
 * Relations that put two anime in the same group. Spin-offs, alternative versions and
 * "character" links are left out: they would chain whole unrelated franchises together.
 */
const LINKS = new Set(['SEQUEL', 'PREQUEL', 'SIDE_STORY', 'PARENT']);

/** Waits out a 429 before the next request, from AniList's Retry-After header. */
export class RateLimited extends HttpError {
  constructor(public retryAfter: number) {
    super(429);
  }
}

async function gql<T>(query: string, variables: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables }),
    signal,
  });
  if (res.status === 429) throw new RateLimited(+(res.headers.get('Retry-After') ?? 60) || 60);
  if (!res.ok) throw new HttpError(res.status);
  const body = (await res.json()) as { data?: T; errors?: { message: string; status?: number }[] };
  if (!body.data) throw new HttpError(body.errors?.[0]?.status ?? 500);
  return body.data;
}

// ---- Shapes ----

type FuzzyDate = { year?: number | null; month?: number | null; day?: number | null } | null;
type Title = { romaji?: string | null; english?: string | null; native?: string | null; userPreferred?: string | null };

type Basic = {
  id: number;
  idMal?: number | null;
  title: Title;
  format?: string | null;
  episodes?: number | null;
  duration?: number | null;
  startDate?: FuzzyDate;
  coverImage?: { large?: string | null; extraLarge?: string | null } | null;
  genres?: string[] | null;
};

type Full = Basic & {
  type?: string | null;
  relations?: { edges: { relationType: string; node: Basic & { type?: string | null } }[] } | null;
};

const BASIC = 'id idMal title { romaji english } format episodes duration startDate { year month day } coverImage { large extraLarge } genres';
const FULL = `${BASIC} type relations { edges { relationType(version: 2) node { ${BASIC} type } } }`;

export const FORMATS: Record<string, string> = {
  TV: 'TV', TV_SHORT: 'TV Short', MOVIE: 'Movie', SPECIAL: 'Special', OVA: 'OVA', ONA: 'ONA', MUSIC: 'Music',
};

const pad = (n: number) => String(n).padStart(2, '0');
/** AniList's fuzzy date → YYYY, YYYY-MM or YYYY-MM-DD ('' when the year is unknown). */
function fuzzy(d?: FuzzyDate) {
  if (!d?.year) return '';
  if (!d.month) return String(d.year);
  return `${d.year}-${pad(d.month)}` + (d.day ? `-${pad(d.day)}` : '');
}

/** Romaji title (what AniList lists by default) and English title, falling back to each other. */
function titles(t: Title, id: number) {
  const title = t.romaji || t.userPreferred || t.english || `AniList #${id}`;
  return { title, titleEn: t.english || title };
}

function fromBasic(a: Basic): SearchHit {
  const start = fuzzy(a.startDate);
  return {
    id: a.id,
    ...titles(a.title, a.id),
    year: start.slice(0, 4),
    img: a.coverImage?.extraLarge || a.coverImage?.large || undefined,
    episodes: a.episodes || undefined,
    genres: (a.genres ?? []).slice(0, 6),
    type: a.format ? FORMATS[a.format] ?? a.format : undefined,
    dur: a.duration || undefined,
    start: start || undefined,
    idMal: a.idMal || undefined,
  };
}

/** Full details plus the basic details of every linked anime, keyed by id. */
function fromFull(a: Full): { meta: Partial<Meta>; related: Map<number, Partial<Meta>> } {
  const related = new Map<number, Partial<Meta>>();
  const rel: number[] = [];
  for (const e of a.relations?.edges ?? []) {
    if (e.node.type !== 'ANIME' || e.node.format === 'MUSIC' || !LINKS.has(e.relationType)) continue;
    rel.push(e.node.id);
    const { id, ...m } = fromBasic(e.node);
    related.set(id, m);
  }
  const { id: _id, ...m } = fromBasic(a);
  return { meta: { ...m, rel, full: true }, related };
}

// ---- Public API ----

export async function searchAnime(query: string, signal?: AbortSignal): Promise<SearchHit[]> {
  const d = await gql<{ Page: { media: Basic[] } }>(
    `query ($q: String) { Page(perPage: 20) { media(search: $q, type: ANIME, sort: SEARCH_MATCH, isAdult: false) { ${BASIC} } } }`,
    { q: query },
    signal,
  );
  return d.Page.media.map((a) => ({ ...fromBasic(a), full: false }));
}

/** Most anime one request can fetch with their relations, within AniList's query complexity limit. */
export const BATCH = 15;

/**
 * Full details for up to BATCH anime at once, plus basic details of every anime they link to
 * (so a franchise's other entries show up with a title and poster before they're fetched).
 */
export async function animeBatch(ids: number[]) {
  const d = await gql<{ Page: { media: Full[] } }>(
    `query ($ids: [Int]) { Page(perPage: ${BATCH}) { media(id_in: $ids, type: ANIME) { ${FULL} } } }`,
    { ids },
  );
  const full = new Map<number, Partial<Meta>>();
  const related = new Map<number, Partial<Meta>>();
  for (const a of d.Page.media) {
    const r = fromFull(a);
    full.set(a.id, r.meta);
    for (const [k, v] of r.related) related.set(k, v);
  }
  return { full, related };
}

/** Most anime one titles-only request asks for. */
export const TITLE_BATCH = 50;

/**
 * Romaji and English titles for up to TITLE_BATCH anime, keyed by id: for anime saved before
 * Reelog kept English titles. A much lighter query than animeBatch.
 */
export async function animeTitles(ids: number[]) {
  const d = await gql<{ Page: { media: { id: number; title: Title }[] } }>(
    `query ($ids: [Int]) { Page(perPage: ${TITLE_BATCH}) { media(id_in: $ids, type: ANIME) { id title { romaji english } } } }`,
    { ids },
  );
  return new Map(d.Page.media.map((a) => [a.id, titles(a.title, a.id)]));
}

/** AniList ids for MyAnimeList ids (for converting data from before the switch). */
export async function fromMalIds(mal: number[]): Promise<Map<number, { id: number; meta: Partial<Meta> }>> {
  const d = await gql<{ Page: { media: Basic[] } }>(
    `query ($ids: [Int]) { Page(perPage: 50) { media(idMal_in: $ids, type: ANIME) { ${BASIC} } } }`,
    { ids: mal },
  );
  const out = new Map<number, { id: number; meta: Partial<Meta> }>();
  for (const a of d.Page.media) {
    if (!a.idMal) continue;
    const { id, ...meta } = fromBasic(a);
    out.set(a.idMal, { id, meta });
  }
  return out;
}

// ---- Detail page ----

type Name = { full?: string | null };
type Img = { medium?: string | null; large?: string | null } | null;

type DetailMedia = {
  description?: string | null;
  title: Title;
  status?: string | null;
  format?: string | null;
  episodes?: number | null;
  duration?: number | null;
  startDate?: FuzzyDate;
  endDate?: FuzzyDate;
  season?: string | null;
  seasonYear?: number | null;
  source?: string | null;
  averageScore?: number | null;
  studios?: { nodes: { name: string }[] } | null;
  nextAiringEpisode?: { episode: number; airingAt: number } | null;
  characters?: { edges: { role: string; node: { name: Name; image: Img }; voiceActors: { name: Name }[] }[] } | null;
  staff?: { edges: { role: string; node: { name: Name; image: Img } }[] } | null;
};

const STATUS: Record<string, string> = {
  FINISHED: 'Finished', RELEASING: 'Airing', NOT_YET_RELEASED: 'Not yet aired', CANCELLED: 'Cancelled', HIATUS: 'On hiatus',
};
const words = (s?: string | null) => (s ? s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ') : '');

/** AniList descriptions carry a little HTML and a "(Source: …)" credit; keep just the text. */
export function plainText(html?: string | null) {
  if (!html) return '';
  const el = document.createElement('div');
  el.innerHTML = html.replace(/<br\s*\/?>/gi, '\n');
  return (el.textContent ?? '')
    .replace(/\n*\(Source:[^)]*\)\s*$/i, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fuzzyLong(d?: FuzzyDate) {
  if (!d?.year) return '';
  return [d.day, d.month ? MON[d.month - 1] : null, d.year].filter(Boolean).join(' ');
}

export async function animeExtra(id: number): Promise<Details> {
  const d = await gql<{ Media: DetailMedia }>(
    `query ($id: Int) { Media(id: $id, type: ANIME) {
      description title { english native romaji } status format episodes duration
      startDate { year month day } endDate { year month day } season seasonYear source averageScore
      studios(isMain: true) { nodes { name } }
      nextAiringEpisode { episode airingAt }
      characters(sort: [ROLE, RELEVANCE], perPage: 16) { edges { role node { name { full } image { medium } } voiceActors(language: JAPANESE) { name { full } } } }
      staff(sort: RELEVANCE, perPage: 8) { edges { role node { name { full } image { medium } } } }
    } }`,
    { id },
  );
  const a = d.Media;
  const start = fuzzyLong(a.startDate);
  const end = fuzzyLong(a.endDate);
  const aired = start && end && start !== end ? `${start} – ${end}` : start;
  const facts: [string, string][] = [
    ['Format', a.format ? FORMATS[a.format] ?? a.format : ''],
    ['Episodes', a.episodes ? `${a.episodes}${a.duration ? ` × ${a.duration} min` : ''}` : ''],
    ['Status', a.status ? STATUS[a.status] ?? words(a.status) : ''],
    ['Aired', aired],
    ['Season', a.season && a.seasonYear ? `${words(a.season)} ${a.seasonYear}` : ''],
    ['Studio', (a.studios?.nodes ?? []).map((s) => s.name).join(', ')],
    ['Source', words(a.source)],
    // The page hides whichever of these is the title it shows (Settings → Anime titles).
    ['English', a.title.english && a.title.english !== a.title.romaji ? a.title.english : ''],
    ['Romaji', a.title.romaji ?? ''],
    ['Native', a.title.native ?? ''],
  ];
  const cast: Person[] = (a.characters?.edges ?? []).map((e) => ({
    name: e.node.name.full ?? '',
    role: [e.voiceActors[0]?.name.full, e.role === 'MAIN' ? 'Main' : ''].filter(Boolean).join(' · '),
    img: e.node.image?.medium ?? undefined,
  }));
  const crew: Person[] = (a.staff?.edges ?? []).map((e) => ({ name: e.node.name.full ?? '', role: e.role, img: e.node.image?.medium ?? undefined }));
  return {
    overview: plainText(a.description),
    facts: facts.filter(([, v]) => v),
    cast: cast.filter((p) => p.name),
    crew: crew.filter((p) => p.name),
    score: a.averageScore ? a.averageScore / 10 : undefined,
    next: a.nextAiringEpisode
      ? { ep: a.nextAiringEpisode.episode, at: new Date(a.nextAiringEpisode.airingAt * 1000).toISOString() }
      : undefined,
    at: Date.now(),
  };
}
