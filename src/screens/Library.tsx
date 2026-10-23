import { Brand, Chip, Icon, Poster, StatusText } from '../components/ui';
import { fmtScore } from '../lib/format';
import { avg, eCount, SMAP, STATUSES, titleInfo, libIds } from '../lib/library';
import type { Data, Filter, Kind, Settings, Sort } from '../lib/types';

export const TAB: Record<Kind, { title: string; icon: string; fab: string; ph: string; empty: string }> = {
  movie: { title: 'Movies', icon: 'movie', fab: 'Log movie', ph: 'Search movies', empty: 'Search a movie, add the date you watched it and a rating.' },
  tv: { title: 'TV', icon: 'tv', fab: 'Add show', ph: 'Search TV shows', empty: 'Search a show, open a season and log episodes one by one or as a range.' },
  anime: { title: 'Anime', icon: 'animation', fab: 'Add anime', ph: 'Search anime', empty: 'Search an anime and log episodes one by one or as a range.' },
};

const SORTS: [Sort, string][] = [['recent', 'Recent'], ['rating', 'Rating'], ['title', 'A–Z']];

type Props = {
  kind: Kind;
  data: Data;
  filter: Filter;
  layout: Settings['layout'];
  onFilter: (p: Partial<Filter>) => void;
  onSearch: () => void;
  onOpen: (id: number) => void;
};

export function Library({ kind: K, data, filter: F, layout, onFilter, onSearch, onOpen }: Props) {
  const T = TAB[K];
  const all = libIds(data, K).map((id) => titleInfo(data, K, id));

  const counts: Record<string, number> = {};
  for (const x of all) for (const s of new Set(x.statuses)) counts[s] = (counts[s] ?? 0) + 1;
  const genreCounts: Record<string, number> = {};
  for (const x of all) for (const g of x.m.genres ?? []) genreCounts[g] = (genreCounts[g] ?? 0) + 1;

  const items = all.filter(
    (x) => (F.status === 'all' || x.statuses.includes(F.status)) && (!F.genre || (x.m.genres ?? []).includes(F.genre)),
  );
  const sorters: Record<Sort, (a: typeof all[0], b: typeof all[0]) => number> = {
    recent: (a, b) => b.last.localeCompare(a.last) || a.m.title.localeCompare(b.m.title),
    rating: (a, b) => (b.score ?? -1) - (a.score ?? -1) || a.m.title.localeCompare(b.m.title),
    title: (a, b) => a.m.title.localeCompare(b.m.title),
  };
  items.sort(sorters[F.sort]);

  const entries = data.entries.filter((e) => e.kind === K);
  const scores = all.flatMap((x) => (x.score != null ? [x.score] : []));
  const stats =
    K === 'movie'
      ? [[all.length, 'films'], [entries.length, 'watches'], [fmtScore(avg(scores)), 'avg']]
      : [[all.length, K === 'tv' ? 'shows' : 'titles'], [entries.reduce((a, e) => a + eCount(e), 0), 'episodes'], [fmtScore(avg(scores)), 'avg']];
  const si = SORTS.findIndex((x) => x[0] === F.sort);

  const statusChips = [
    { k: 'all' as const, label: 'All', n: all.length },
    ...STATUSES.map(([k, label]) => ({ k, label, n: counts[k] ?? 0 })),
  ].filter((x) => x.k === 'all' || x.n > 0 || F.status === x.k);
  const genres = Object.entries(genreCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

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
            <button className="sort-btn" onClick={() => onFilter({ sort: SORTS[(si + 1) % SORTS.length][0] })}>
              <Icon name="sort" />{SORTS[si][1]}
            </button>
          )}
        </div>
      </div>
      <div className="pad-row">
        <button className="search-fake" onClick={onSearch}><Icon name="search" />{T.ph} or your library</button>
      </div>

      {!!all.length && (
        <>
          <div className="chips" role="toolbar" aria-label="Filter by status">
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
            // A completed movie is the default; only call out other statuses.
            const showStatus = x.status && !(K === 'movie' && x.status === 'completed') ? x.status : null;
            return (
              <button key={x.id} className="row-btn" onClick={() => onOpen(x.id)}>
                <Poster src={x.m.img} size="md" />
                <div className="row-body">
                  <div className="row-title ellipsis">{x.m.title}</div>
                  {x.sub && <div className="row-sub ellipsis">{x.sub}</div>}
                  <div className="row-meta">
                    <StatusText status={showStatus} />
                    <span>{x.line}</span>
                    {K === 'movie' && x.es.length > 1 && <span className="badge">×{x.es.length}</span>}
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
            const showStatus = x.status && !(K === 'movie' && x.status === 'completed') ? x.status : null;
            return (
              <button key={x.id} className="grid-btn" onClick={() => onOpen(x.id)}>
                <div className="grid-cover">
                  <Poster src={x.m.img} size="grid" />
                  <div className="grid-score">{fmtScore(x.score)}</div>
                  {showStatus && <div className="grid-dot" style={{ background: SMAP[showStatus].color }} title={SMAP[showStatus].label} />}
                  {K === 'movie' && x.es.length > 1 && <div className="grid-count">×{x.es.length}</div>}
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
