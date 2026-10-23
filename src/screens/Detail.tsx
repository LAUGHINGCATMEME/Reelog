import { Icon, Poster } from '../components/ui';
import { fmtDate, fmtRuntime, fmtScore } from '../lib/format';
import type { Entry } from '../lib/types';
import type { Group } from './Library';

type Props = {
  group: Group;
  onBack: () => void;
  onAdd: () => void;
  onEdit: (e: Entry) => void;
  onRemove: () => void;
};

export function Detail({ group, onBack, onAdd, onEdit, onRemove }: Props) {
  const { movie: m, entries } = group;
  const scored = entries.filter((e) => e.score != null);
  const dated = entries.filter((e) => e.date);
  const avg = scored.length
    ? fmtScore(Math.round((scored.reduce((a, e) => a + (e.score ?? 0), 0) / scored.length) * 10) / 10)
    : '—';
  const first = dated.length ? dated[dated.length - 1].date.slice(0, 4) : '—';

  return (
    <div className="screen" style={{ paddingBottom: 120 }}>
      <div className="topbar topbar--back">
        <button className="icon-btn" aria-label="Back" onClick={onBack}><Icon name="arrow_back" /></button>
      </div>
      <div className="detail-head">
        <Poster src={m.image} size="lg" />
        <div className="detail-info">
          <h2 className="h2">{m.title}</h2>
          <div className="meta">{[m.year, fmtRuntime(m.runtime)].filter(Boolean).join(' · ')}</div>
          {m.director && <div className="meta">{m.director}</div>}
          {!!m.genres.length && (
            <div className="genres">
              {m.genres.map((g) => <span key={g} className="genre">{g}</span>)}
            </div>
          )}
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat"><span className="stat-label">WATCHES</span><span className="stat-value">{entries.length}</span></div>
        <div className="stat"><span className="stat-label">AVG</span><span className="stat-value">{avg}</span></div>
        <div className="stat"><span className="stat-label">FIRST</span><span className="stat-value">{first}</span></div>
      </div>

      <div style={{ padding: '16px 16px 0' }}>
        <button className="btn btn--primary btn--block" onClick={onAdd}><Icon name="add" />Log another watch</button>
      </div>

      <div className="history-head">
        <span className="history-title">Watch history</span>
        <span className="history-hint">tap to edit</span>
      </div>
      <div className="history">
        {entries.map((e, i) => (
          <button key={e.id} className="entry" onClick={() => onEdit(e)}>
            <div className="entry-date">{fmtDate(e.date)}</div>
            <div className="entry-body">
              <span className="entry-label">Watch #{entries.length - i}</span>
              {e.notes && <span className="entry-notes">{e.notes}</span>}
            </div>
            <span className={'entry-score' + (e.score == null ? ' muted-score' : '')}>{fmtScore(e.score)}</span>
          </button>
        ))}
      </div>

      <div className="center-row">
        <button className="text-btn" onClick={onRemove}><Icon name="delete" />Remove from library</button>
      </div>
    </div>
  );
}
