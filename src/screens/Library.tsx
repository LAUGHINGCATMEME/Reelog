import { useState } from 'react';
import { Brand, Chip, Icon, Menu, Poster, StatusText } from '../components/ui';
import { fmtDateLong, fmtScore } from '../lib/format';
import { avg, eCount, getMeta, SMAP, STATUSES, type TitleInfo, type UpNext } from '../lib/library';
import type { Data, Filter, Kind, Settings, Sort } from '../lib/types';

export const TAB: Record<Kind, { title: string; icon: string; fab: string; ph: string; empty: string }> = {
  movie: { title: 'Movies', icon: 'movie', fab: 'Log movie', ph: 'Search movies', empty: 'Search a movie, add the date you watched it and a rating.' },
  tv: { title: 'TV', icon: 'tv', fab: 'Add show', ph: 'Search TV shows', empty: 'Search a show, open a season and log episodes one by one or as a range.' },
  anime: { title: 'Anime', icon: 'animation', fab: 'Add anime', ph: 'Search anime', empty: 'Search an anime and log episodes one by one or as a range.' },
};

const SORTS: [Sort, string][] = [['started', 'First started'], ['recent', 'Last ended'], ['rating', 'Rating'], ['title', 'A–Z']];

type Props = {
  kind: Kind;
  data: Data;
  /** What this tab lists (see shelf.ts). */
  titles: TitleInfo[];
  /** TV and anime with an episode to log next. */
  upNext: UpNext[];
  filter: Filter;
  layout: Settings['layout'];
  onFilter: (p: Partial<Filter>) => void;
  onSearch: () => void;
  onOpen: (kind: Kind, id: number) => void;
  onOpenNext: (u: UpNext) => void;
  /** Logs the next episode, dated today. */
  onPlusOne: (u: UpNext) => void;
};

function UpNextRow({ data, items, onOpen, onPlus }: { data: Data; items: UpNext[]; onOpen: (u: UpNext) => void; onPlus: (u: UpNext) => void }) {
  return (
    <>
      <div className="section-label">UP NEXT</div>
      <div className="up-row">
        {items.map((u) => {
          const m = getMeta(data, u.kind, u.ref);
          const season = u.kind === 'tv' ? m.seasons?.find((s) => s.n === u.season) : undefined;
          const sn = u.kind === 'tv' ? (u.season ? `S${u.season} · ` : 'Specials · ') : '';
          return (
            <div key={`${u.kind}:${u.ref}:${u.season ?? ''}`} className="up-card">
              <button className="up-open" onClick={() => onOpen(u)}>
                <Poster src={season?.img || m.img} size="sm" />
                <div className="up-body">
                  <span className="up-title">{m.title}</span>
                  <span className="up-sub">{sn}{u.total ? `${u.done}/${u.total}` : `${u.done} watched`}</span>
                  {!!u.total && <div className="bar"><div style={{ width: `${Math.round((u.done / u.total) * 100)}%` }} /></div>}
                </div>
              </button>
              <button className="up-plus" aria-label={`Log episode ${u.next} of ${m.title}, today`} onClick={() => onPlus(u)}>
                <Icon name="add" />
                <span>E{u.next}</span>
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}

export function Library({ kind: K, data, titles: all, upNext, filter: F, layout, onFilter, onSearch, onOpen, onOpenNext, onPlusOne }: Props) {
  const T = TAB[K];
  const [menu, setMenu] = useState(false);

  const counts: Record<string, number> = {};
  for (const x of all) for (const s of new Set(x.statuses)) counts[s] = (counts[s] ?? 0) + 1;
  const genreCounts: Record<string, number> = {};
  for (const x of all) for (const g of x.m.genres ?? []) genreCounts[g] = (genreCounts[g] ?? 0) + 1;

  const items = all.filter(
    (x) => (F.status === 'all' || x.statuses.includes(F.status)) && (!F.genre || (x.m.genres ?? []).includes(F.genre)),
  );
  const sorters: Record<Sort, (a: TitleInfo, b: TitleInfo) => number> = {
    started: (a, b) => b.first.localeCompare(a.first) || a.m.title.localeCompare(b.m.title),
    recent: (a, b) => b.last.localeCompare(a.last) || a.m.title.localeCompare(b.m.title),
    rating: (a, b) => (b.score ?? -1) - (a.score ?? -1) || a.m.title.localeCompare(b.m.title),
    title: (a, b) => a.m.title.localeCompare(b.m.title),
  };
  items.sort(sorters[F.sort]);
  // The date beside each title is the one the list is sorted by.
  const dateNote = (x: TitleInfo) =>
    F.sort === 'started' ? (x.first ? `Started ${fmtDateLong(x.first)}` : '') : x.last ? fmtDateLong(x.last) : '';

  const watches = all.reduce((n, x) => n + x.es.length, 0);
  const episodes = all.reduce((n, x) => n + x.es.reduce((a, e) => a + eCount(e), 0), 0);
  const scores = all.flatMap((x) => (x.score != null ? [x.score] : []));
  const stats =
    K === 'movie'
      ? [[all.length, 'films'], [watches, 'watches'], [fmtScore(avg(scores)), 'avg']]
      : [[all.length, K === 'tv' ? 'shows' : 'titles'], [episodes, 'episodes'], [fmtScore(avg(scores)), 'avg']];

  const statusChips = [
    { k: 'all' as const, label: 'All', n: all.length },
    ...STATUSES.map(([k, label]) => ({ k, label, n: counts[k] ?? 0 })),
  ].filter((x) => x.k === 'all' || x.n > 0 || F.status === x.k);
  const genres = Object.entries(genreCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const showUpNext = !!upNext.length && !F.genre && (F.status === 'all' || F.status === 'watching');
  // A completed movie is the default; only call out other statuses.
  const shownStatus = (x: TitleInfo) => (x.status && !(x.film && x.status === 'completed') ? x.status : null);

  return (
    <div className="screen screen--lib">
      <div className="topbar">
        <Brand />
        <button className="icon-btn" aria-label="Search" onClick={onSearch}><Icon name="search" /></button>
      </div>
      <div className="page-head">
        <h1 className="h1">{T.title}</h1>
        <div className="head-row">
          <div className="stats">
            {stats.map(([v, l]) => <span key={l}><b>{v}</b> {l}</span>)}
          </div>
          {!!all.length && (
            <div className="menu-anchor">
              <button className="sort-btn" aria-haspopup="listbox" aria-expanded={menu} onClick={() => setMenu(!menu)}>
                <Icon name="sort" />{SORTS.find((x) => x[0] === F.sort)?.[1]}<Icon name="expand_more" />
              </button>
              <Menu open={menu} onClose={() => setMenu(false)} head="SORT BY" role="listbox">
                {SORTS.map(([k, label]) => (
                  <button
                    key={k}
                    role="option"
                    aria-selected={F.sort === k}
                    className="menu-item"
                    onClick={() => { onFilter({ sort: k }); setMenu(false); }}
                  >
                    {label}{F.sort === k && <Icon name="check" />}
                  </button>
                ))}
              </Menu>
            </div>
          )}
        </div>
      </div>
      <div className="pad-row">
        <button className="search-fake" onClick={onSearch}><Icon name="search" />{T.ph} or your library</button>
      </div>

      {showUpNext && <UpNextRow data={data} items={upNext} onOpen={onOpenNext} onPlus={onPlusOne} />}

      {!!all.length && (
        <>
          {showUpNext && <div className="section-label section-label--near">LIBRARY</div>}
          <div className={showUpNext ? 'chips chips--flush' : 'chips'} role="toolbar" aria-label="Filter by status">
            {statusChips.map((c) => (
              <Chip key={c.k} on={F.status === c.k} onClick={() => onFilter({ status: c.k })}>
                {c.label}<span className="chip-n">{c.n}</span>
              </Chip>
            ))}
          </div>
          {!!genres.length && (
            <div className="chips chips--tight" role="toolbar" aria-label="Filter by genre">
              {genres.map(([g]) => (
                <Chip key={g} className="chip--round" on={F.genre === g} onClick={() => onFilter({ genre: F.genre === g ? null : g })}>
                  {g}{F.genre === g && <Icon name="close" />}
                </Chip>
              ))}
            </div>
          )}
        </>
      )}

      {!all.length && (
        <div className="empty">
          <Icon name={T.icon} />
          <div className="empty-title">Nothing logged yet</div>
          <div className="empty-body">{T.empty}</div>
        </div>
      )}
      {!!all.length && !items.length && (
        <div className="empty empty--sm">
          <div className="empty-body empty-body--wide">Nothing matches these filters.</div>
          <button className="text-btn text-btn--strong" onClick={() => onFilter({ status: 'all', genre: null })}>Clear filters</button>
        </div>
      )}

      {layout === 'list' ? (
        <div className="list">
          {items.map((x) => {
            const st = shownStatus(x);
            return (
              <button key={`${x.kind}:${x.id}`} className="row-btn" onClick={() => onOpen(x.kind, x.id)}>
                <Poster src={x.m.img} size="md" />
                <div className="row-body">
                  <div className="row-title ellipsis">{x.m.title}</div>
                  {x.sub && <div className="row-sub ellipsis">{x.sub}</div>}
                  <div className="row-meta">
                    <StatusText status={st} />
                    {[x.line, dateNote(x)].filter(Boolean).map((t) => <span key={t}>{t}</span>)}
                    {x.film && x.es.length > 1 && <span className="badge">×{x.es.length}</span>}
                  </div>
                </div>
                <div className={'row-score' + (x.score == null ? ' disabled' : '')}>{fmtScore(x.score)}</div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="grid">
          {items.map((x) => {
            const st = shownStatus(x);
            return (
              <button key={`${x.kind}:${x.id}`} className="grid-btn" onClick={() => onOpen(x.kind, x.id)}>
                <div className="grid-cover">
                  <Poster src={x.m.img} size="grid" />
                  <div className="grid-score">{fmtScore(x.score)}</div>
                  {st && <div className="grid-dot" style={{ background: SMAP[st].color }} title={SMAP[st].label} />}
                  {x.film && x.es.length > 1 && <div className="grid-count">×{x.es.length}</div>}
                </div>
                <div className="grid-title">{x.m.title}</div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
