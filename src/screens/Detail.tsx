import { useState } from 'react';
import { TitleDetails, WatchSpan } from '../components/Details';
import { Backdrop, BackBar, Genres, Icon, Poster, StatusChips, StatusText } from '../components/ui';
import { fmtDate, fmtRuntime, fmtScore, plural } from '../lib/format';
import {
  avg, byEndDesc, dateLabel, entriesOf, epLabel, getMeta, isFilm, libIds, nextEpisode, skey, statusOf, titleInfo, total, touchedSeasons, watchCounts, watched,
} from '../lib/library';
import { groupInfo, groupKey, groupRate, sectionOf, SECTIONS, type AnimeGroup, type Grouping, type Section } from '../lib/groups';
import type { Data, EpEntry, EpKind, Kind, Meta, MovieEntry, Settings, Status } from '../lib/types';

const scoreClass = (s: number | null | undefined) => (s == null ? ' disabled' : '');
const NOUNS: Record<Section, [string, string]> = { Series: ['series', 'series'], Movies: ['movie', 'movies'], 'OVAs & specials': ['OVA or special', 'OVAs and specials'] };
const pct = (n: number, of: number) => (of ? `${Math.min(100, Math.round((n / of) * 100))}%` : '0%');

type Common = {
  data: Data;
  tmdbKey: string;
  /** Settings → Public ratings. */
  publicScores: boolean;
  onBack: () => void;
  onGenre: (kind: Kind, genre: string) => void;
  onStatus: (key: string, s: Status) => void;
  onRemove: () => void;
};

/** Anime: the franchise group this one belongs to, when it has others. */
export type PartOf = { title: string; n: number; onOpen: () => void };

function PartOfLink({ title, n, onOpen }: PartOf) {
  return (
    <div className="pad-row" style={{ paddingTop: 14 }}>
      <button className="part-of" onClick={onOpen}>
        <Icon name="video_library" />
        <span className="part-of-text">Part of <b>{title}</b></span>
        <span className="part-of-n">{n}</span>
        <Icon name="chevron_right" className="chev" />
      </button>
    </div>
  );
}

/** Your notes on a title or group (not on a watch): shown under its stats, tap to edit. */
function TitleNote({ text, onEdit }: { text?: string; onEdit: () => void }) {
  return (
    <div className="pad-row" style={{ paddingTop: 10 }}>
      {text ? (
        <button className="title-note" onClick={onEdit}>
          <span className="stat-label">YOUR NOTES<Icon name="edit" /></span>
          <span className="title-note-text">{text}</span>
        </button>
      ) : (
        <button className="text-btn text-btn--muted" onClick={onEdit}><Icon name="edit" />Add notes</button>
      )}
    </div>
  );
}

const SHADES = [1, 2, 3, 4];

/**
 * One episode's button: red once it's watched; with Settings → Rewatch shading, a darker red for
 * each time it was watched again, up to 4.
 */
function EpButton({ label, count, shades, name, onClick }: { label: string | number; count: number; shades: boolean; name: string; onClick: () => void }) {
  return (
    <button
      className="ep-n"
      data-on={count > 0}
      data-shade={shades && count > 1 ? Math.min(count, 4) : undefined}
      aria-label={`Log ${name}${count > 1 ? `, watched ${count} times` : ''}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

/** What the shades mean, when some episode was watched more than once. */
function ShadeKey({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="shade-key" aria-hidden="true">
      <span>Watched</span>
      {SHADES.map((n) => (
        <span key={n} className="shade-key-item"><span className="ep-swatch" data-shade={n > 1 ? n : undefined} />{n === 4 ? '4+' : n}</span>
      ))}
      <span>times</span>
    </div>
  );
}

// ---- Movie ----

export function MovieDetail({ id, data, tmdbKey, publicScores, onBack, onGenre, onStatus, onRemove, onLog }: Common & { id: number; onLog: (entry?: MovieEntry) => void }) {
  const m = getMeta(data, 'movie', id);
  const es = (entriesOf(data, 'movie', id) as MovieEntry[]).sort(byEndDesc);
  const scores = es.flatMap((e) => (e.score != null ? [e.score] : []));
  const metaLine = [m.year, fmtRuntime(m.runtime)].filter(Boolean).join(' · ');
  const inLib = es.length > 0 || !!data.status[`movie:${id}`];

  return (
    <div className="screen screen--detail">
      <Backdrop src={m.img} />
      <BackBar onBack={onBack} />
      <div className="detail-head">
        <Poster src={m.img} size="lg" />
        <div className="detail-info">
          <h2 className="h2">{m.title}</h2>
          {metaLine && <div className="meta">{metaLine}</div>}
          {m.director && <div className="meta">{m.director}</div>}
          <Genres genres={m.genres} onPick={(g) => onGenre('movie', g)} />
        </div>
      </div>
      <StatusChips value={statusOf(data, 'movie', id)} onChange={(s) => onStatus(`movie:${id}`, s)} />
      <div className="stat-card">
        <div className="stat-grid">
          <div className="stat"><span className="stat-label">WATCHES</span><span className="stat-value">{es.length}</span></div>
          <div className="stat"><span className="stat-label">AVG</span><span className="stat-value">{fmtScore(avg(scores))}</span></div>
          <div className="stat"><span className="stat-label">FIRST</span><span className="stat-value">{es.length ? es[es.length - 1].date.slice(0, 4) : '—'}</span></div>
        </div>
        {es.length > 1 && <WatchSpan first={es[es.length - 1].date} last={es[0].date} />}
      </div>
      <div className="pad-row">
        <button className="btn btn--primary btn--block" onClick={() => onLog()}>
          <Icon name="add" />{es.length ? 'Log another watch' : 'Log a watch'}
        </button>
      </div>
      {!!es.length && (
        <>
          <div className="section-head"><span className="section-title">Watch history</span><span className="section-hint">tap to edit</span></div>
          <div className="cards">
            {es.map((e, i) => (
              <button key={e.id} className="entry" onClick={() => onLog(e)}>
                <div className="entry-body">
                  <span className="entry-main">{fmtDate(e.date)}</span>
                  <span className="entry-sub">Watch #{es.length - i}</span>
                  {e.notes && <span className="entry-notes">{e.notes}</span>}
                </div>
                <span className={'entry-score' + scoreClass(e.score)}>{fmtScore(e.score)}</span>
              </button>
            ))}
          </div>
        </>
      )}
      <TitleDetails kind="movie" id={id} tmdbKey={tmdbKey} score={publicScores} />
      {inLib && (
        <div className="center-row">
          <button className="text-btn" onClick={onRemove}><Icon name="delete" />Remove from library</button>
        </div>
      )}
    </div>
  );
}

// ---- Anime film (or a one-episode OVA or special) ----

/**
 * Logged like a movie, as dated watches. Its rating is the anime's own (as for any anime), so one
 * imported or set before stays where it was; its watches have no rating of their own.
 */
export function FilmDetail({ refId: ref, data, tmdbKey, publicScores, partOf, onBack, onGenre, onStatus, onRemove, onLog, onRate }: Common & {
  refId: number;
  partOf?: PartOf;
  onLog: (entry?: EpEntry) => void;
  onRate: () => void;
}) {
  const m = getMeta(data, 'anime', ref);
  const es = (entriesOf(data, 'anime', ref) as EpEntry[]).sort(byEndDesc);
  const key = skey('anime', ref);
  const r = data.rates[key];
  const metaLine = [m.year, m.type, fmtRuntime(m.dur)].filter(Boolean).join(' · ');
  const inLib = es.length > 0 || !!data.status[key] || r != null || !!data.notes?.[key];
  const first = es.reduce((a, e) => (e.start < a ? e.start : a), es[0]?.start ?? '');

  return (
    <div className="screen screen--detail">
      <Backdrop src={m.img} />
      <BackBar onBack={onBack} />
      <div className="detail-head">
        <Poster src={m.img} size="lg" />
        <div className="detail-info">
          <h2 className="h2">{m.title}</h2>
          {metaLine && <div className="meta">{metaLine}</div>}
          <Genres genres={m.genres} onPick={(g) => onGenre('anime', g)} />
        </div>
      </div>
      {partOf && <PartOfLink {...partOf} />}
      <StatusChips value={statusOf(data, 'anime', ref)} onChange={(s) => onStatus(key, s)} />
      <div className="stat-card">
        <div className="stat-grid">
          <div className="stat"><span className="stat-label">WATCHES</span><span className="stat-value">{es.length}</span></div>
          <button className="stat" onClick={onRate}>
            <span className="stat-label">RATING<Icon name="edit" /></span>
            <span className={'stat-value' + scoreClass(r)}>{fmtScore(r)}</span>
          </button>
          <div className="stat"><span className="stat-label">FIRST</span><span className="stat-value">{first ? first.slice(0, 4) : '—'}</span></div>
        </div>
        {es.length > 1 && <WatchSpan first={first} last={es[0].end} />}
      </div>
      <TitleNote text={data.notes?.[key]} onEdit={onRate} />
      <div className="pad-row">
        <button className="btn btn--primary btn--block" onClick={() => onLog()}>
          <Icon name="add" />{es.length ? 'Log another watch' : 'Log a watch'}
        </button>
      </div>
      {!!es.length && (
        <>
          <div className="section-head"><span className="section-title">Watch history</span><span className="section-hint">tap to edit</span></div>
          <div className="cards">
            {es.map((e, i) => (
              <button key={e.id} className="entry" onClick={() => onLog(e)}>
                <div className="entry-body">
                  <span className="entry-main">{dateLabel(e)}</span>
                  <span className="entry-sub">Watch #{es.length - i}</span>
                  {e.notes && <span className="entry-notes">{e.notes}</span>}
                </div>
              </button>
            ))}
          </div>
        </>
      )}
      <TitleDetails kind="anime" id={ref} tmdbKey={tmdbKey} title={m.title} score={publicScores} />
      {inLib && (
        <div className="center-row">
          <button className="text-btn" onClick={onRemove}><Icon name="delete" />Remove from library</button>
        </div>
      )}
    </div>
  );
}

// ---- TV show ----

export function ShowDetail({ id, data, tmdbKey, publicScores, loading, hasKey, onBack, onGenre, onRemove, onSeason }: Omit<Common, 'onStatus'> & {
  id: number; loading: boolean; hasKey: boolean; onSeason: (n: number) => void;
}) {
  const m = getMeta(data, 'tv', id);
  const seasons = m.seasons?.length
    ? m.seasons
    : touchedSeasons(data, id).map((n) => ({ n, name: `Season ${n}`, episodes: 0, year: undefined }));
  const metaLine = [m.year, m.seasons?.length && plural(m.seasons.length, 'season')].filter(Boolean).join(' · ');
  const info = titleInfo(data, 'tv', id);

  return (
    <div className="screen screen--detail">
      <Backdrop src={m.img} />
      <BackBar onBack={onBack} />
      <div className="detail-head">
        <Poster src={m.img} size="lg" />
        <div className="detail-info">
          <h2 className="h2">{m.title}</h2>
          {metaLine && <div className="meta">{metaLine}</div>}
          <Genres genres={m.genres} onPick={(g) => onGenre('tv', g)} />
        </div>
      </div>
      {!!info.first && <div className="stat-card"><WatchSpan first={info.first} last={info.last} /></div>}
      <div className="section-label" style={{ paddingTop: 26 }}>SEASONS</div>
      {loading && !m.seasons?.length && <div className="note">Loading seasons…</div>}
      {!loading && !m.seasons?.length && (
        <div className="note">
          {hasKey ? "Couldn't load this show's seasons. Check your connection." : "Add a TMDB key in Settings to load this show's seasons."}
        </div>
      )}
      <div className="cards">
        {seasons.map((x) => {
          const w = watched(data, 'tv', id, x.n).size;
          const st = statusOf(data, 'tv', id, x.n);
          const r = data.rates[skey('tv', id, x.n)];
          return (
            <button key={x.n} className="season" onClick={() => onSeason(x.n)}>
              <div className="season-body">
                <div className="season-title">
                  <span className="season-name">{x.name}</span>
                  <span className="season-sub">{[x.episodes && `${x.episodes} eps`, x.year].filter(Boolean).join(' · ')}</span>
                </div>
                <div className="bar"><div style={{ width: pct(w, x.episodes) }} /></div>
                <div className="season-meta">
                  <span>{x.episodes ? `${w}/${x.episodes}` : `${w} eps`}</span>
                  <StatusText status={st} />
                </div>
              </div>
              <span className={'entry-score' + scoreClass(r)}>{fmtScore(r)}</span>
              <Icon name="chevron_right" className="chev" />
            </button>
          );
        })}
      </div>
      <TitleDetails kind="tv" id={id} tmdbKey={tmdbKey} score={publicScores} />
      {libIds(data, 'tv').includes(id) && (
        <div className="center-row">
          <button className="text-btn" onClick={onRemove}><Icon name="delete" />Remove show</button>
        </div>
      )}
    </div>
  );
}

// ---- Episodes (a TV season or an anime) ----

export function Episodes({ kind: K, refId: ref, season: sn, data, tmdbKey, publicScores, shades, partOf, onBack, onGenre, onStatus, onRemove, onLog, onRate }: Common & {
  kind: EpKind; refId: number; season?: number;
  /** Settings → Rewatch shading. */
  shades: boolean;
  partOf?: PartOf;
  onLog: (entry?: EpEntry, ep?: number) => void;
  onRate: () => void;
}) {
  const m = getMeta(data, K, ref);
  const season = K === 'tv' ? m.seasons?.find((x) => x.n === sn) ?? { n: sn!, name: `Season ${sn}`, episodes: 0, year: undefined, img: undefined } : null;
  const tot = total(data, K, ref, sn);
  const w = watched(data, K, ref, sn);
  const counts = watchCounts(data, K, ref, sn);
  const es = (entriesOf(data, K, ref, sn) as EpEntry[]).sort((a, b) => byEndDesc(a, b) || b.epTo - a.epTo);
  const key = skey(K, ref, sn);
  const r = data.rates[key];
  const epAvg = avg(es.flatMap((e) => (e.score != null ? [e.score] : [])));
  const next = nextEpisode(data, K, ref, sn);
  const done = !!tot && w.size >= tot;
  const metaLine = (K === 'tv' ? [tot && `${tot} episodes`, season?.year] : [m.year, m.episodes && `${m.episodes} eps`, m.type]).filter(Boolean).join(' · ');
  const inLib = es.length > 0 || !!data.status[key] || r != null || !!data.notes?.[key];

  return (
    <div className="screen screen--detail">
      <Backdrop src={season?.img || m.img} />
      <BackBar onBack={onBack} />
      <div className="detail-head">
        <Poster src={season?.img || m.img} size="lg" />
        <div className="detail-info">
          {season && <span className="kicker">{season.name.toUpperCase()}</span>}
          <h2 className="h2">{m.title}</h2>
          {metaLine && <div className="meta">{metaLine}</div>}
          {K === 'anime' && <Genres genres={m.genres} onPick={(g) => onGenre('anime', g)} />}
        </div>
      </div>
      {partOf && <PartOfLink {...partOf} />}
      <StatusChips value={statusOf(data, K, ref, sn)} onChange={(s) => onStatus(key, s)} />
      <div className="stat-card">
        <div className="stat-grid">
          <div className="stat"><span className="stat-label">WATCHED</span><span className="stat-value">{tot ? `${w.size}/${tot}` : w.size}</span></div>
          <button className="stat" onClick={onRate}>
            <span className="stat-label">{K === 'tv' ? 'SEASON' : 'RATING'}<Icon name="edit" /></span>
            <span className={'stat-value' + scoreClass(r)}>{fmtScore(r)}</span>
          </button>
          <div className="stat"><span className="stat-label">EP AVG</span><span className="stat-value">{fmtScore(epAvg)}</span></div>
        </div>
        <div className="stat-bar"><div style={{ width: pct(w.size, tot) }} /></div>
        {!!es.length && <WatchSpan first={es.reduce((a, e) => (e.start < a ? e.start : a), es[0].start)} last={es[0].end} />}
      </div>
      <TitleNote text={data.notes?.[key]} onEdit={onRate} />
      <div className="pad-row">
        <button className="btn btn--primary btn--block" onClick={() => onLog()}>
          <Icon name="add" />Log episodes{!done && <span className="btn-extra">· E{next}</span>}
        </button>
      </div>
      {tot > 0 && tot <= 500 && (
        <>
          <div className="section-head" style={{ paddingBottom: 10 }}><span className="section-title">Episodes</span><span className="section-hint">tap one to log it</span></div>
          <div className="ep-grid">
            {Array.from({ length: tot }, (_, i) => i + 1).map((n) => (
              <EpButton key={n} label={n} count={counts.get(n) ?? 0} shades={shades} name={`episode ${n}`} onClick={() => onLog(undefined, n)} />
            ))}
          </div>
          <ShadeKey show={shades && [...counts.values()].some((c) => c > 1)} />
        </>
      )}
      {!!es.length && (
        <>
          <div className="section-head"><span className="section-title">Watch log</span><span className="section-hint">tap to edit</span></div>
          <div className="cards">
            {es.map((e) => (
              <button key={e.id} className="entry" onClick={() => onLog(e)}>
                <div className="entry-body">
                  <span className="entry-main">{epLabel(e)}</span>
                  <span className="entry-sub">{dateLabel(e)}</span>
                  {e.notes && <span className="entry-notes">{e.notes}</span>}
                </div>
                <span className={'entry-score' + scoreClass(e.score)}>{fmtScore(e.score)}</span>
              </button>
            ))}
          </div>
        </>
      )}
      {K === 'anime' && <TitleDetails kind="anime" id={ref} tmdbKey={tmdbKey} title={m.title} score={publicScores} />}
      {inLib && (
        <div className="center-row">
          <button className="text-btn" onClick={onRemove}><Icon name="delete" />{K === 'tv' ? 'Clear this season' : 'Remove from library'}</button>
        </div>
      )}
    </div>
  );
}

// ---- Anime group (a franchise's seasons, movies and OVAs) ----

/** The group's series, in order, with the episodes each shows on the group page. */
function groupSeasons(data: Data, g: AnimeGroup, metas: Map<number, Meta>) {
  let at = 0;
  return g.ids.flatMap((id) => {
    const m = metas.get(id)!;
    if (sectionOf(m) !== 'Series' || isFilm(m)) return [];
    const counts = watchCounts(data, 'anime', id);
    // Still airing, with no episode count yet: as far as you've watched.
    const n = Math.min(m.episodes || Math.max(0, ...counts.keys()), 2000);
    if (!n) return [];
    const s = { id, m, n, counts, from: at + 1 };
    at += n;
    return [s];
  });
}

/** Every episode of a group's series on one page: numbered on through the seasons, or per season. */
function GroupEpisodes({ data, g, metas, mode, shades, onLog }: {
  data: Data; g: AnimeGroup; metas: Map<number, Meta>; mode: 'continuous' | 'seasons'; shades: boolean;
  onLog: (id: number, ep: number) => void;
}) {
  const seasons = groupSeasons(data, g, metas);
  const all = seasons.reduce((n, x) => n + x.n, 0);
  if (!seasons.length || all > 3000) return null;
  const many = seasons.some((x) => [...x.counts.values()].some((c) => c > 1));
  const tile = (x: (typeof seasons)[number], ep: number, label: number, i: number) => (
    <EpButton
      key={`${x.id}:${ep}`} label={label} count={x.counts.get(ep) ?? 0} shades={shades}
      name={`S${i + 1} episode ${ep}, ${x.m.title}`} onClick={() => onLog(x.id, ep)}
    />
  );
  const eps = (x: (typeof seasons)[number]) => Array.from({ length: x.n }, (_, k) => k + 1);
  return (
    <>
      <div className="section-head" style={{ paddingBottom: 10 }}><span className="section-title">All episodes</span><span className="section-hint">tap one to log it</span></div>
      {mode === 'continuous' ? (
        <>
          {seasons.length > 1 && (
            <div className="time-note ep-ranges">
              {seasons.map((x, i) => `S${i + 1}: ${x.from}–${x.from + x.n - 1}`).join(' · ')}
            </div>
          )}
          <div className="ep-grid">{seasons.flatMap((x, i) => eps(x).map((ep) => tile(x, ep, x.from + ep - 1, i)))}</div>
        </>
      ) : (
        seasons.map((x, i) => {
          const w = [...x.counts.keys()].filter((ep) => ep <= x.n).length;
          return (
            <div key={x.id} className="ep-season">
              <div className="ep-season-head">
                <span className="ep-season-n">S{i + 1}</span>
                <span className="ep-season-title">{x.m.title}</span>
                <span className="ep-season-count">{w}/{x.n}</span>
              </div>
              <div className="ep-grid">{eps(x).map((ep) => tile(x, ep, ep, i))}</div>
            </div>
          );
        })
      )}
      <ShadeKey show={shades && many} />
    </>
  );
}

export function AnimeGroupDetail({ group: g, grouping, data, tmdbKey, publicScores, shades, groupEps, onBack, onGenre, onOpen, onRate, onLogEp, onSplit, onUnsplit, onUnmove, onMerge }: {
  group: AnimeGroup;
  grouping: Grouping;
  data: Data;
  tmdbKey: string;
  publicScores: boolean;
  shades: boolean;
  groupEps: Settings['groupEps'];
  onBack: () => void;
  onGenre: (kind: Kind, genre: string) => void;
  onOpen: (id: number) => void;
  /** Rates the group as a whole (and edits its notes). */
  onRate: () => void;
  /** Logs episode `ep` of member `id`, from the all-episodes grid. */
  onLogEp: (id: number, ep: number) => void;
  onSplit: (id: number) => void;
  /** Puts a split-out anime back in its automatic group. */
  onUnsplit: (id: number) => void;
  /** Sends an anime that was moved here back to its automatic group. */
  onUnmove: (id: number) => void;
  onMerge: (other: AnimeGroup) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [q, setQ] = useState('');
  const info = groupInfo(data, g);
  const metas = new Map(g.ids.map((id) => [id, getMeta(data, 'anime', id)]));
  const eps = g.ids.reduce((n, id) => n + watched(data, 'anime', id).size, 0);
  const tot = g.ids.every((id) => metas.get(id)!.episodes) ? g.ids.reduce((n, id) => n + metas.get(id)!.episodes!, 0) : 0;
  const done = g.ids.filter((id) => statusOf(data, 'anime', id) === 'completed').length;
  const looking = g.ids.some((id) => !metas.get(id)!.full);
  const own = groupRate(data, g);
  const seasonAvg = avg(g.lib.flatMap((id) => {
    const x = titleInfo(data, 'anime', id).score;
    return x != null ? [x] : [];
  }));
  const moved = new Set(grouping.movedIn.get(g.key) ?? []);
  const splits = grouping.splitFrom.get(g.key) ?? [];
  const counts = SECTIONS.map((s) => [s, g.ids.filter((id) => sectionOf(metas.get(id)!) === s).length] as const).filter(([, n]) => n);
  const ql = q.trim().toLowerCase();
  const others = editing
    ? grouping.groups
        .filter((x) => x !== g)
        .map((x) => ({ g: x, m: getMeta(data, 'anime', x.root) }))
        .filter((x) => !ql || x.m.title.toLowerCase().includes(ql))
        .sort((a, b) => a.m.title.localeCompare(b.m.title))
        .slice(0, ql ? 30 : 8)
    : [];

  return (
    <div className="screen screen--detail">
      <Backdrop src={info.m.img} />
      <BackBar onBack={onBack} />
      <div className="detail-head">
        <Poster src={info.m.img} size="lg" />
        <div className="detail-info">
          <span className="kicker">ANIME · {g.ids.length} ENTRIES</span>
          <h2 className="h2">{info.m.title}</h2>
          <div className="meta">{counts.map(([s, n]) => plural(n, ...NOUNS[s])).join(' · ')}</div>
          <Genres genres={info.m.genres.slice(0, 6)} onPick={(x) => onGenre('anime', x)} />
        </div>
      </div>
      <div className="stat-card">
        <div className="stat-grid">
          <div className="stat"><span className="stat-label">EPISODES</span><span className="stat-value">{tot ? `${eps}/${tot}` : eps}</span></div>
          <button className="stat" onClick={onRate}>
            <span className="stat-label">RATING<Icon name="edit" /></span>
            <span className={'stat-value' + scoreClass(own)}>{fmtScore(own)}</span>
            {seasonAvg != null && <span className="stat-sub">AVG {fmtScore(seasonAvg)}</span>}
          </button>
          <div className="stat"><span className="stat-label">DONE</span><span className="stat-value">{done}/{g.ids.length}</span></div>
        </div>
        <div className="stat-bar"><div style={{ width: pct(eps, tot) }} /></div>
        <WatchSpan first={info.first} last={info.last} />
      </div>
      {!editing && <TitleNote text={data.groupNotes?.[groupKey(data.groupNotes, g)]} onEdit={onRate} />}
      {looking && <div className="note" style={{ paddingTop: 14 }}>Looking up related seasons on AniList…</div>}
      {!editing && groupEps !== 'off' && <GroupEpisodes data={data} g={g} metas={metas} mode={groupEps} shades={shades} onLog={onLogEp} />}

      {SECTIONS.map((sec) => {
        const ids = g.ids.filter((id) => sectionOf(metas.get(id)!) === sec);
        if (!ids.length) return null;
        return (
          <div key={sec}>
            <div className="section-label" style={{ paddingTop: 26 }}>{sec.toUpperCase()}</div>
            <div className="cards">
              {ids.map((id) => {
                const m = metas.get(id)!;
                const w = watched(data, 'anime', id).size;
                const st = statusOf(data, 'anime', id);
                const r = data.rates[skey('anime', id)];
                const film = isFilm(m);
                const watches = film ? entriesOf(data, 'anime', id).length : 0;
                const body = (
                  <>
                    <Poster src={m.img} size="sm" />
                    <div className="season-body">
                      <span className="season-name">{m.title}</span>
                      <span className="season-sub">
                        {[m.type, m.year, film ? fmtRuntime(m.dur) : m.episodes && `${m.episodes} eps`].filter(Boolean).join(' · ')}
                      </span>
                      {!film && <div className="bar"><div style={{ width: pct(w, m.episodes ?? 0) }} /></div>}
                      <div className="season-meta">
                        {film
                          ? watches > 1 && <span>×{watches}</span>
                          : <span>{m.episodes ? `${w}/${m.episodes}` : `${w} eps`}</span>}
                        {st ? <StatusText status={st} /> : <span className="disabled">{film ? 'Not watched' : 'Not started'}</span>}
                        {moved.has(id) && <span className="disabled">Added by you</span>}
                      </div>
                    </div>
                  </>
                );
                if (editing) {
                  return (
                    <div key={id} className="season season--edit">
                      {body}
                      {g.ids.length > 1 && (
                        <button
                          className="icon-btn"
                          aria-label={moved.has(id) ? `Remove ${m.title} from this group` : `Split ${m.title} out of this group`}
                          onClick={() => (moved.has(id) ? onUnmove(id) : onSplit(id))}
                        >
                          <Icon name={moved.has(id) ? 'remove' : 'call_split'} />
                        </button>
                      )}
                    </div>
                  );
                }
                return (
                  <button key={id} className={'season' + (st || w ? '' : ' season--new')} onClick={() => onOpen(id)}>
                    {body}
                    <span className={'entry-score' + scoreClass(r)}>{fmtScore(r)}</span>
                    <Icon name="chevron_right" className="chev" />
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {editing && (
        <>
          {!!splits.length && (
            <>
              <div className="section-head"><span className="section-title">Split out</span><span className="section-hint">tap to put back</span></div>
              <div className="cards">
                {splits.map((id) => {
                  const m = getMeta(data, 'anime', id);
                  return (
                    <button key={id} className="season" onClick={() => onUnsplit(id)}>
                      <Poster src={m.img} size="sm" />
                      <div className="season-body">
                        <span className="season-name">{m.title}</span>
                        <span className="season-sub">{[m.type, m.year].filter(Boolean).join(' · ')}</span>
                      </div>
                      <Icon name="undo" className="chev" />
                    </button>
                  );
                })}
              </div>
            </>
          )}
          <div className="section-head"><span className="section-title">Add to this group</span><span className="section-hint">from your library</span></div>
          <div className="pad-row" style={{ paddingTop: 0 }}>
            <div className="search-field">
              <Icon name="search" />
              <input value={q} placeholder="Search your anime" aria-label="Search your anime" onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>
          <div className="list">
            {others.map(({ g: x, m }) => (
              <button key={x.key} className="row-btn row-btn--compact" onClick={() => { onMerge(x); setQ(''); }}>
                <Poster src={m.img} size="sm" />
                <div className="row-body">
                  <div className="row-title row-title--sm">{m.title}</div>
                  <div className="row-sub">{x.ids.length > 1 ? `${x.ids.length} entries` : [m.type, m.year].filter(Boolean).join(' · ')}</div>
                </div>
                <Icon name="merge" className="muted" />
              </button>
            ))}
            {!others.length && <div className="note">No other anime match.</div>}
          </div>
        </>
      )}

      <div className="center-row">
        <button className="text-btn" onClick={() => { setEditing(!editing); setQ(''); }}>
          <Icon name={editing ? 'check' : 'edit'} />{editing ? 'Done' : 'Edit group'}
        </button>
      </div>
      {!editing && <div className="time-note" style={{ textAlign: 'center', padding: '0 32px' }}>Grouped by AniList sequel, prequel and side-story links.</div>}
      {!editing && <TitleDetails kind="anime" id={g.root} tmdbKey={tmdbKey} title={info.m.title} score={publicScores} />}
    </div>
  );
}
