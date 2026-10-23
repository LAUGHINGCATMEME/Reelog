import { useEffect, useRef } from 'react';
import { fmtDate, fmtScore, maskDate, parseDate, todayIso, yesterdayIso } from '../lib/format';
import type { Movie, Settings } from '../lib/types';
import { Icon, Poster } from './ui';

export type SheetState = {
  open: boolean;
  mode: 'add' | 'edit';
  movie: Movie;
  entryId: string | null;
  date: string;
  dateText: string;
  score: number;
  hasScore: boolean;
  notes: string;
};

type Props = {
  sheet: SheetState;
  /** How many watches of this movie are already logged. */
  existing: number;
  ratingInput: Settings['ratingInput'];
  patch: (p: Partial<SheetState>) => void;
  onClose: () => void;
  onSave: () => void;
  onDelete: () => void;
};

export function LogSheet({ sheet, existing, ratingInput, patch, onClose, onSave, onDelete }: Props) {
  const pickerRef = useRef<HTMLInputElement>(null);
  const today = todayIso();
  const yday = yesterdayIso();
  const m = sheet.movie;
  const dateValid = !!parseDate(sheet.dateText);
  const setDate = (d: string) => patch({ date: d, dateText: fmtDate(d) });
  const dim = sheet.hasScore ? '' : ' dim';

  const sheetRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (sheet.open && sheetRef.current) sheetRef.current.scrollTop = 0;
  }, [sheet.open]);

  const kicker = sheet.mode === 'edit' ? 'EDIT ENTRY' : existing > 0 ? `LOG WATCH #${existing + 1}` : 'LOG A WATCH';

  const openPicker = () => {
    const el = pickerRef.current;
    if (!el) return;
    try {
      el.showPicker();
    } catch {
      el.focus();
      el.click();
    }
  };

  return (
    <>
      <div className="scrim" data-on={sheet.open} onClick={onClose} />
      <div
        ref={sheetRef}
        className="sheet"
        data-on={sheet.open}
        role="dialog"
        aria-modal="true"
        aria-label={kicker}
        aria-hidden={!sheet.open}
      >
        <div className="grabber" />
        <div className="sheet-head">
          <Poster src={m.image} size="sm" label={false} />
          <div className="row-body">
            <span className="kicker">{kicker}</span>
            <span className="sheet-title">{m.title}</span>
            <span className="row-sub">{[m.year, m.director].filter(Boolean).join(' · ')}</span>
          </div>
          <button className="icon-btn" aria-label="Close" onClick={onClose}><Icon name="close" /></button>
        </div>

        <div className="label">Watched on</div>
        <div className="date-row">
          <div className="field" data-invalid={!dateValid}>
            <input
              type="text"
              inputMode="numeric"
              value={sheet.dateText}
              placeholder="DD/MM/YYYY"
              maxLength={10}
              aria-label="Watch date"
              onChange={(e) => {
                const t = maskDate(e.target.value);
                const p = parseDate(t);
                patch(p ? { dateText: t, date: p } : { dateText: t });
              }}
            />
            <button className="icon-btn" aria-label="Pick date" onClick={openPicker}><Icon name="calendar_month" /></button>
            <input
              ref={pickerRef}
              type="date"
              className="date-native"
              value={sheet.date}
              max={today}
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => e.target.value && setDate(e.target.value)}
            />
          </div>
          <button className="pill-btn" aria-pressed={sheet.date === today && dateValid} onClick={() => setDate(today)}>Today</button>
          <button className="pill-btn" aria-pressed={sheet.date === yday && dateValid} onClick={() => setDate(yday)} style={{ padding: '0 12px' }}>
            Yesterday
          </button>
        </div>

        <div className="rating-head">
          <span className="label">Rating</span>
          <button className="toggle" aria-pressed={!sheet.hasScore} onClick={() => patch({ hasScore: !sheet.hasScore })}>
            <Icon name={sheet.hasScore ? 'check_box_outline_blank' : 'check_box'} />
            No rating
          </button>
        </div>
        <div className={'score-big' + dim}>
          <span className="score-big-n">{sheet.hasScore ? fmtScore(sheet.score) : '—'}</span>
          <span className="score-big-of">/ 10</span>
        </div>

        {ratingInput === 'slider' ? (
          <div className={'slider' + dim}>
            <input
              type="range"
              min={0}
              max={10}
              step={0.5}
              value={sheet.score}
              aria-label="Rating"
              onChange={(e) => patch({ score: parseFloat(e.target.value), hasScore: true })}
            />
            <div className="ticks"><span>0</span><span>5</span><span>10</span></div>
          </div>
        ) : (
          <>
            <div className={'segs' + dim}>
              {Array.from({ length: 10 }, (_, i) => {
                const n = i + 1;
                const fill = sheet.score >= n ? 'full' : sheet.score === n - 0.5 ? 'half' : undefined;
                return (
                  <button
                    key={n}
                    className="seg-n"
                    data-fill={fill}
                    aria-label={String(n)}
                    onClick={() => patch({ score: sheet.score === n ? n - 0.5 : n, hasScore: true })}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
            <div className="small-hint">Tap again for a half point.</div>
          </>
        )}

        <div className="label">
          Notes <span className="label-opt">· optional</span>
        </div>
        <textarea
          className="notes"
          rows={3}
          value={sheet.notes}
          placeholder="Where, with whom, what stuck with you"
          onChange={(e) => patch({ notes: e.target.value })}
        />

        <div className="sheet-actions">
          {sheet.mode === 'edit' && (
            <button className="btn btn--secondary btn--danger-text" style={{ fontSize: 14 }} onClick={onDelete}>
              <Icon name="delete" />
              Delete
            </button>
          )}
          <button className="btn btn--primary" onClick={onSave}>
            {sheet.mode === 'edit' ? 'Save changes' : 'Save entry'}
          </button>
        </div>
      </div>
    </>
  );
}
