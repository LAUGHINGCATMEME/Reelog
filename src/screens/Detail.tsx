import { useState } from 'react';
import { Backdrop, BackBar, Genres, Icon, Poster, StatusChips, StatusText } from '../components/ui';
import { fmtDate, fmtRuntime, fmtScore, plural } from '../lib/format';
import {
  avg, byEndDesc, dateLabel, entriesOf, epLabel, getMeta, libIds, nextEpisode, skey, statusOf, total, touchedSeasons, watched,
} from '../lib/library';
import { groupInfo, sectionOf, SECTIONS, type AnimeGroup, type Grouping, type Section } from '../lib/groups';
import type { Data, EpEntry, EpKind, Kind, MovieEntry, Status } from '../lib/types';

const scoreClass = (s: number | null | undefined) => (s == null ? ' disabled' : '');
const NOUNS: Record<Section, [string, string]> = { Series: ['series', 'series'], Movies: ['movie', 'movies'], 'OVAs & specials': ['OVA or special', 'OVAs and specials'] };
const pct = (n: number, of: number) => (of ? `${Math.min(100, Math.round((n / of) * 100))}%` : '0%');

type Common = {
  data: Data;
  onBack: () => void;
  onGenre: (kind: Kind, genre: string) => void;
  onStatus: (key: string, s: Status) => void;
  onRemove: () => void;
};

// ---- Movie ----

export function MovieDetail({ id, data, onBack, onGenre, onStatus, onRemove, onLog }: Common & { id: number; onLog: (entry?: MovieEntry) => void }) {
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
      {inLib && (
        <div className="center-row">
          <button className="text-btn" onClick={onRemove}><Icon name="delete" />Remove from library</button>
        </div>
      )}
    </div>
  );
}

// ---- TV show ----

export function ShowDetail({ id, data, loading, hasKey, onBack, onGenre, onRemove, onSeason }: Omit<Common, 'onStatus'> & {
  id: number; loading: boolean; hasKey: boolean; onSeason: (n: number) => void;
}) {
  const m = getMeta(data, 'tv', id);
  const seasons = m.seasons?.length
    ? m.seasons
    : touchedSeasons(data, id).map((n) => ({ n, name: `Season ${n}`, episodes: 0, year: undefined }));
  const metaLine = [m.year, m.seasons?.length && `${m.seasons.length} seasons`].filter(Boolean).join(' · ');

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
      {libIds(data, 'tv').includes(id) && (
        <div className="center-row">
          <button className="text-btn" onClick={onRemove}><Icon name="delete" />Remove show</button>
        </div>
      )}
    </div>
  );
}

// ---- Episodes (a TV season or an anime) ----

export function Episodes({ kind: K, refId: ref, season: sn, data, partOf, onBack, onGenre, onStatus, onRemove, onLog, onRate }: Common & {
  kind: EpKind; refId: number; season?: number;
  /** Anime: the group this one belongs to, when it has others. */
  partOf?: { title: string; n: number; onOpen: () => void };
  onLog: (entry?: EpEntry, ep?: number) => void;
  onRate: () => void;
}) {
  const m = getMeta(data, K, ref);
  const season = K === 'tv' ? m.seasons?.find((x) => x.n === sn) ?? { n: sn!, name: `Season ${sn}`, episodes: 0, year: undefined, img: undefined } : null;
  const tot = total(data, K, ref, sn);
  const w = watched(data, K, ref, sn);
  const es = (entriesOf(data, K, ref, sn) as EpEntry[]).sort((a, b) => byEndDesc(a, b) || b.epTo - a.epTo);
  const key = skey(K, ref, sn);
  const r = data.rates[key];
  const epAvg = avg(es.flatMap((e) => (e.score != null ? [e.score] : [])));
  const next = nextEpisode(data, K, ref, sn);
  const done = !!tot && w.size >= tot;
  const metaLine = (K === 'tv' ? [tot && `${tot} episodes`, season?.year] : [m.year, m.episodes && `${m.episodes} eps`, m.type]).filter(Boolean).join(' · ');
  const inLib = es.length > 0 || !!data.status[key] || r != null;

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
      {partOf && (
        <div className="pad-row" style={{ paddingTop: 14 }}>
          <button className="part-of" onClick={partOf.onOpen}>
            <Icon name="video_library" />
            <span className="part-of-text">Part of <b>{partOf.title}</b></span>
            <span className="part-of-n">{partOf.n}</span>
            <Icon name="chevron_right" className="chev" />
          </button>
        </div>
      )}
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
      </div>
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
              <button key={n} className="ep-n" data-on={w.has(n)} aria-label={`Log episode ${n}`} onClick={() => onLog(undefined, n)}>{n}</button>
            ))}
          </div>
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
      {inLib && (
        <div className="center-row">
          <button className="text-btn" onClick={onRemove}><Icon name="delete" />{K === 'tv' ? 'Clear this season' : 'Remove from library'}</button>
        </div>
      )}
    </div>
  );
}

// ---- Anime group (a franchise's seasons, movies and OVAs) ----

export function AnimeGroupDetail({ group: g, grouping, data, onBack, onGenre, onOpen, onSplit, onUnsplit, onUnmove, onMerge }: {
  group: AnimeGroup;
  grouping: Grouping;
  data: Data;
  onBack: () => void;
  onGenre: (kind: Kind, genre: string) => void;
  onOpen: (id: number) => void;
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
  const tot = g.ids.reduce((n, id) => n + (metas.get(id)!.episodes ?? 0), 0);
  const done = g.ids.filter((id) => statusOf(data, 'anime', id) === 'completed').length;
  const looking = g.ids.some((id) => !metas.get(id)!.linked);
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
          <div className="stat"><span className="stat-label">AVG</span><span className={'stat-value' + scoreClass(info.score)}>{fmtScore(info.score)}</span></div>
          <div className="stat"><span className="stat-label">DONE</span><span className="stat-value">{done}/{g.ids.length}</span></div>
        </div>
        <div className="stat-bar"><div style={{ width: pct(eps, tot) }} /></div>
      </div>
      {looking && <div className="note" style={{ paddingTop: 14 }}>Looking up related seasons on MyAnimeList…</div>}

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
                const body = (
                  <>
                    <Poster src={m.img} size="sm" />
                    <div className="season-body">
                      <span className="season-name">{m.title}</span>
                      <span className="season-sub">{[m.type, m.year, m.episodes && `${m.episodes} eps`].filter(Boolean).join(' · ')}</span>
                      <div className="bar"><div style={{ width: pct(w, m.episodes ?? 0) }} /></div>
                      <div className="season-meta">
                        <span>{m.episodes ? `${w}/${m.episodes}` : `${w} eps`}</span>
                        {st ? <StatusText status={st} /> : <span className="disabled">Not started</span>}
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
      {!editing && <div className="time-note" style={{ textAlign: 'center', padding: '0 32px' }}>Grouped by MyAnimeList sequel and prequel links.</div>}
    </div>
  );
}
