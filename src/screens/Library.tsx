import { Brand, Icon, Poster } from '../components/ui';
import { fmtDateLong, fmtScore } from '../lib/format';
import type { Entry, Movie, Settings, Sort } from '../lib/types';

export type Group = { id: number; movie: Movie; entries: Entry[]; lastDate: string; score: number | null };
export type Stats = { films: number; watches: number; avg: string };

const SORTS: [Sort, string][] = [
  ['recent', 'Recent'],
  ['rating', 'Rating'],
  ['most', 'Most watched'],
  ['title', 'A–Z'],
];

const SORTERS: Record<Sort, (a: Group, b: Group) => number> = {
  recent: (a, b) => b.lastDate.localeCompare(a.lastDate),
  rating: (a, b) => (b.score ?? -1) - (a.score ?? -1) || b.lastDate.localeCompare(a.lastDate),
  title: (a, b) => a.movie.title.localeCompare(b.movie.title),
  most: (a, b) => b.entries.length - a.entries.length || b.lastDate.localeCompare(a.lastDate),
};

type Props = {
  groups: Group[];
  stats: Stats;
  sort: Sort;
  layout: Settings['layout'];
  onSort: (s: Sort) => void;
  onSearch: () => void;
  onOpen: (id: number) => void;
};

export function Library({ groups, stats, sort, layout, onSort, onSearch, onOpen }: Props) {
  const items = [...groups].sort(SORTERS[sort]);
  return (
    <div className="screen">
      <div className="topbar">
        <Brand />
        <button className="icon-btn" aria-label="Search" onClick={onSearch}><Icon name="search" /></button>
      </div>
      <div className="page-head">
        <h1 className="h1">Library</h1>
        <div className="stats">
          <span><b>{stats.films}</b> films</span>
          <span><b>{stats.watches}</b> watches</span>
          <span><b>{stats.avg}</b> avg</span>
        </div>
      </div>
      <div style={{ padding: '16px 16px 0' }}>
        <button className="search-fake" onClick={onSearch}>
          <Icon name="search" />
          Search a movie to log
        </button>
      </div>
      <div className="chips" role="toolbar" aria-label="Sort">
        {SORTS.map(([k, label]) => (
          <button key={k} className="chip" aria-pressed={sort === k} onClick={() => onSort(k)}>{label}</button>
        ))}
      </div>

      {!items.length && (
        <div className="empty">
          <Icon name="movie" />
          <div className="empty-title">Nothing logged yet</div>
          <div className="empty-body">Search a movie, add the date you watched it and a rating.</div>
        </div>
      )}

      {layout === 'list' ? (
        <div className="lib-list">
          {items.map((g) => (
            <button key={g.id} className="row-btn" onClick={() => onOpen(g.id)}>
              <Poster src={g.movie.image} size="md" />
              <div className="row-body">
                <div className="row-title ellipsis">{g.movie.title}</div>
                <div className="row-sub ellipsis">{[g.movie.year, g.movie.director].filter(Boolean).join(' · ')}</div>
                <div className="row-meta">
                  <span>{fmtDateLong(g.lastDate)}</span>
                  {g.entries.length > 1 && <span className="badge">×{g.entries.length}</span>}
                </div>
              </div>
              <div className={'row-score' + (g.score == null ? ' muted-score' : '')}>{fmtScore(g.score)}</div>
            </button>
          ))}
        </div>
      ) : (
        <div className="lib-grid">
          {items.map((g) => (
            <button key={g.id} className="grid-btn" onClick={() => onOpen(g.id)}>
              <div style={{ position: 'relative' }}>
                <Poster src={g.movie.image} size="grid" />
                <div className="grid-score">{fmtScore(g.score)}</div>
                {g.entries.length > 1 && <div className="grid-count">×{g.entries.length}</div>}
              </div>
              <div className="grid-title">{g.movie.title}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
