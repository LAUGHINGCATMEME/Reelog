import { useEffect, useRef } from 'react';
import { fmtDate, fmtScore, maskDate, parseDate, todayIso, yesterdayIso } from '../lib/format';
import type { Kind, Meta, Settings } from '../lib/types';
import { Icon, Poster } from './ui';

/** Ratings start as "No rating"; turning one on starts at this score. */
export const DEFAULT_SCORE = 7;

export type SheetState = {
  open: boolean;
  mode: 'movie' | 'eps' | 'rate';
  kind: Kind;
  ref: number;
  season?: number;
  entryId: string | null;
  epMode: 'single' | 'range';
  epFrom: string;
  epTo: string;
  start: string;
  startText: string;
  end: string;
  endText: string;
  score: number;
  hasScore: boolean;
  notes: string;
};

export function blankSheet(p: Partial<SheetState> & Pick<SheetState, 'mode' | 'kind' | 'ref'>): SheetState {
  const t = todayIso();
  return {
    open: true, entryId: null, epMode: 'single', epFrom: '1', epTo: '1',
    start: t, startText: fmtDate(t), end: t, endText: fmtDate(t),
    score: DEFAULT_SCORE, hasScore: false, notes: '',
    ...p,
  };
}

type Props = {
  sheet: SheetState;
  meta: Meta;
  /** Episode count of the anime / season, 0 when unknown. */
  total: number;
  /** Watches of the movie or anime film already logged, for the "LOG WATCH #n" kicker. */
  watches: number;
  ratingInput: Settings['rating'];
  patch: (p: Partial<SheetState>) => void;
  onClose: () => void;
  onSave: () => void;
  onDelete: () => void;
};

function DateField(props: { label: string; text: string; iso: string; near?: boolean; onText: (text: string, iso: string | null) => void; onPick: (iso: string) => void }) {
  const pickerRef = useRef<HTMLInputElement>(null);
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
    <div className="field" data-invalid={!parseDate(props.text)}>
      <input
        type="text"
        inputMode="numeric"
        value={props.text}
        placeholder="DD/MM/YYYY"
        maxLength={10}
        aria-label={props.label}
        onChange={(e) => {
          const t = maskDate(e.target.value);
          props.onText(t, parseDate(t));
        }}
      />
      <button className="icon-btn" aria-label={`Pick ${props.label.toLowerCase()}`} onClick={openPicker}><Icon name="calendar_month" /></button>
      <input
        ref={pickerRef}
        type="date"
        className="date-native"
        value={props.iso}
        max={todayIso()}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => e.target.value && props.onPick(e.target.value)}
      />
    </div>
  );
}

function Stepper({ label, value, max, onChange }: { label: string; value: string; max: number; onChange: (v: string) => void }) {
  const n = parseInt(value, 10) || 1;
  return (
    <div className="stepper">
      <span className="stepper-label">{label}</span>
      <button aria-label={`Decrease ${label}`} onClick={() => onChange(String(Math.max(1, n - 1)))}><Icon name="remove" /></button>
      <input
        value={value}
        inputMode="numeric"
        aria-label={label}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 4))}
      />
      <button aria-label={`Increase ${label}`} onClick={() => onChange(String(Math.min(max || 9999, n + 1)))}><Icon name="add" /></button>
    </div>
  );
}

export function LogSheet({ sheet: S, meta: m, total, watches, ratingInput, patch, onClose, onSave, onDelete }: Props) {
  const today = todayIso();
  const yday = yesterdayIso();
  const isEps = S.mode === 'eps';
  const isRange = isEps && S.epMode === 'range';
  const season = S.kind === 'tv' ? m.seasons?.find((x) => x.n === S.season) : undefined;
  const dim = S.hasScore ? '' : ' dim';

  const sheetRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (S.open && sheetRef.current) sheetRef.current.scrollTop = 0;
  }, [S.open]);

  const kicker = S.entryId
    ? 'EDIT ENTRY'
    : S.mode === 'rate'
      ? S.kind === 'tv' ? 'RATE SEASON' : 'RATE'
      : isEps ? 'LOG EPISODES' : watches > 0 ? `LOG WATCH #${watches + 1}` : 'LOG A WATCH';
  const sub = S.kind === 'tv'
    ? season?.name ?? `Season ${S.season}`
    : [m.year, S.kind === 'movie' ? m.director : m.type].filter(Boolean).join(' · ') || 'Year unknown';

  const setEp = (field: 'epFrom' | 'epTo', v: string) => {
    const p: Partial<SheetState> = { [field]: v };
    const n = parseInt(v, 10);
    if (field === 'epFrom' && isRange && n > (parseInt(S.epTo, 10) || 0)) p.epTo = v;
    patch(p);
  };

  return (
    <>
      <div className="scrim" data-on={S.open} onClick={onClose} />
      <div ref={sheetRef} className="sheet" data-on={S.open} role="dialog" aria-modal="true" aria-label={kicker} aria-hidden={!S.open}>
        <div className="grabber" />
        <div className="sheet-head">
          <Poster src={season?.img || m.img} size="sm" className="poster--sheet" />
          <div className="row-body">
            <span className="kicker">{kicker}</span>
            <span className="sheet-title">{m.title}</span>
            <span className="row-sub">{sub}</span>
          </div>
          <button className="icon-btn" aria-label="Close" onClick={onClose}><Icon name="close" /></button>
        </div>

        {isEps && (
          <>
            <div className="label-row">
              <span className="label">Episodes</span>
              <div className="modes" role="group" aria-label="Episode mode">
                <button aria-pressed={S.epMode === 'single'} onClick={() => patch({ epMode: 'single' })}>Single</button>
                <button
                  aria-pressed={S.epMode === 'range'}
                  onClick={() => patch({ epMode: 'range', epTo: String(Math.max(parseInt(S.epFrom, 10) || 1, parseInt(S.epTo, 10) || 1)) })}
                >
                  Range
                </button>
              </div>
            </div>
            <div className="steppers">
              <Stepper label={isRange ? 'From' : 'Ep'} value={S.epFrom} max={total} onChange={(v) => setEp('epFrom', v)} />
              {isRange && <Stepper label="To" value={S.epTo} max={total} onChange={(v) => setEp('epTo', v)} />}
              {!!total && <span className="of-total">of {total}</span>}
              {isRange && !!total && S.epTo !== String(total) && (
                <button className="pill-btn pill-btn--sm" onClick={() => patch({ epTo: String(total) })}>To end</button>
              )}
            </div>
          </>
        )}

        {S.mode !== 'rate' && (
          <>
            <div className="label">{isRange ? 'Started' : 'Watched on'}</div>
            <div className="date-row">
              <DateField
                label={isRange ? 'Start date' : 'Watch date'}
                text={S.startText}
                iso={S.start}
                onText={(t, p) => patch(p ? { startText: t, start: p } : { startText: t })}
                onPick={(d) => patch({ start: d, startText: fmtDate(d) })}
              />
              {!isRange && (
                <>
                  <button className="pill-btn" aria-pressed={S.start === today && !!parseDate(S.startText)} onClick={() => patch({ start: today, startText: fmtDate(today) })}>Today</button>
                  <button className="pill-btn" aria-pressed={S.start === yday && !!parseDate(S.startText)} onClick={() => patch({ start: yday, startText: fmtDate(yday) })}>Yesterday</button>
                </>
              )}
            </div>
            {isRange && (
              <>
                <div className="label label--near">Finished</div>
                <div className="date-row">
                  <DateField
                    label="Finish date"
                    text={S.endText}
                    iso={S.end}
                    onText={(t, p) => patch(p ? { endText: t, end: p } : { endText: t })}
                    onPick={(d) => patch({ end: d, endText: fmtDate(d) })}
                  />
                </div>
              </>
            )}
          </>
        )}

        <div className="label-row">
          <span className="label">
            {S.mode === 'rate' ? (S.kind === 'tv' ? 'Season rating' : 'Your rating') : isEps ? 'Episode rating · optional' : 'Rating'}
          </span>
          <button className="toggle" aria-pressed={!S.hasScore} onClick={() => patch({ hasScore: !S.hasScore })}>
            <Icon name={S.hasScore ? 'check_box_outline_blank' : 'check_box'} />
            No rating
          </button>
        </div>
        <div className={'score-big' + dim}>
          <span className="score-big-n">{S.hasScore ? fmtScore(S.score) : '—'}</span>
          <span className="score-big-of">/ 10</span>
        </div>
        {ratingInput === 'slider' ? (
          <div className={'slider' + dim}>
            <input
              type="range" min={0} max={10} step={0.5} value={S.score} aria-label="Rating"
              onChange={(e) => patch({ score: parseFloat(e.target.value), hasScore: true })}
              onPointerDown={() => !S.hasScore && patch({ hasScore: true })}
            />
            <div className="ticks"><span>0</span><span>5</span><span>10</span></div>
          </div>
        ) : (
          <>
            <div className={'segs' + dim}>
              {Array.from({ length: 10 }, (_, i) => {
                const n = i + 1;
                const on = S.hasScore;
                const fill = on && S.score >= n ? 'full' : on && S.score === n - 0.5 ? 'half' : undefined;
                return (
                  <button
                    key={n} className="seg-n" data-fill={fill} aria-label={String(n)}
                    onClick={() => patch({ score: on && S.score === n ? n - 0.5 : n, hasScore: true })}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
            <div className="small-hint">Tap again for a half point.</div>
          </>
        )}

        {S.mode !== 'rate' && (
          <>
            <div className="label">Notes <span className="label-opt">· optional</span></div>
            <textarea
              className="notes" rows={3} value={S.notes} placeholder="Where, with whom, what stuck with you"
              onChange={(e) => patch({ notes: e.target.value })}
            />
          </>
        )}

        <div className="sheet-actions">
          {S.entryId && (
            <button className="btn btn--secondary" onClick={onDelete}><Icon name="delete" />Delete</button>
          )}
          <button className="btn btn--primary" onClick={onSave}>
            {S.mode === 'rate' ? 'Save rating' : S.entryId ? 'Save changes' : 'Save entry'}
          </button>
        </div>
      </div>
    </>
  );
}
