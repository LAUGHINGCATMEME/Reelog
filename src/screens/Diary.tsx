import { Fragment, useEffect, useRef, useState } from 'react';
import { BackBar, Chip, Icon, Poster } from '../components/ui';
import { fmtDateLong, fmtScore, plural } from '../lib/format';
import { eEnd, eStart, epShort, getMeta, isEp, isFilm, skey } from '../lib/library';
import type { Data, Entry, Kind } from '../lib/types';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const KINDS: [Kind | 'all', string][] = [['all', 'All'], ['movie', 'Movies'], ['tv', 'TV'], ['anime', 'Anime']];
/** Rows rendered at a time; more are added as you scroll near the end. */
const STEP = 120;

/** Every watch, newest first, grouped by month: a log of what you watched when. */
export function Diary({ data, onBack, onOpen }: { data: Data; onBack: () => void; onOpen: (e: Entry) => void }) {
  const [kind, setKind] = useState<Kind | 'all'>('all');
  const [year, setYear] = useState('all');
  const [limit, setLimit] = useState(STEP);
  const end = useRef<HTMLDivElement>(null);

  // Which watch of a movie or film each entry is, counting by date.
  const nth = new Map<string, number>();
  const byTitle = new Map<string, Entry[]>();
  for (const e of data.entries) {
    const k = `${e.kind}:${e.ref}`;
    byTitle.set(k, [...(byTitle.get(k) ?? []), e]);
  }
  for (const es of byTitle.values()) {
    es.sort((a, b) => eEnd(a).localeCompare(eEnd(b))).forEach((e, i) => nth.set(e.id, i + 1));
  }

  const years = [...new Set(data.entries.map((e) => eEnd(e).slice(0, 4)))].sort().reverse();
  const rows = data.entries
    .filter((e) => (kind === 'all' || e.kind === kind) && (year === 'all' || eEnd(e).startsWith(year)))
    .sort((a, b) => eEnd(b).localeCompare(eEnd(a)) || (isEp(b) ? b.epTo : 0) - (isEp(a) ? a.epTo : 0));
  const shown = rows.slice(0, limit);

  useEffect(() => setLimit(STEP), [kind, year]);
  useEffect(() => {
    const el = end.current;
    if (!el || shown.length >= rows.length) return;
    const io = new IntersectionObserver((xs) => xs.some((x) => x.isIntersecting) && setLimit((n) => n + STEP), { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [shown.length, rows.length]);

  const monthCount = new Map<string, number>();
  for (const e of rows) monthCount.set(eEnd(e).slice(0, 7), (monthCount.get(eEnd(e).slice(0, 7)) ?? 0) + 1);

  const describe = (e: Entry) => {
    const m = getMeta(data, e.kind, e.ref);
    const n = nth.get(e.id) ?? 1;
    const film = e.kind === 'movie' || isFilm(m);
    const from = eStart(e) !== eEnd(e) ? ` · from ${fmtDateLong(eStart(e)).slice(0, 6)}` : '';
    const season = isEp(e) && e.kind === 'tv' ? e.season : undefined;
    const sub = film
      ? `${e.kind === 'movie' ? 'Movie' : `Anime · ${m.type || 'film'}`}${n > 1 ? ` · rewatch #${n}` : ''}`
      : isEp(e)
        ? `${e.kind === 'tv' ? (season ? `S${season} · ` : 'Specials · ') : ''}${epShort(e)}${from}`
        : '';
    // A film's rating is the anime's own; other entries carry theirs.
    const score = e.score ?? (e.kind === 'anime' && film ? data.rates[skey('anime', e.ref)] ?? null : null);
    const img = (season != null && m.seasons?.find((s) => s.n === season)?.img) || m.img;
    return { m, sub, score, img };
  };

  return (
    <div className="screen">
      <BackBar onBack={onBack} />
      <div className="page-head" style={{ paddingTop: 4 }}>
        <h1 className="h1">Diary</h1>
        <div className="stats" style={{ marginTop: 8 }}><span>{plural(rows.length, 'entry', 'entries')}</span></div>
      </div>
      {!!data.entries.length && (
        <>
          <div className="chips" role="toolbar" aria-label="Kind">
            {KINDS.map(([k, label]) => <Chip key={k} on={kind === k} onClick={() => setKind(k)}>{label}</Chip>)}
          </div>
          {years.length > 1 && (
            <div className="chips chips--tight" role="toolbar" aria-label="Year">
              <Chip className="chip--round" on={year === 'all'} onClick={() => setYear('all')}>All years</Chip>
              {years.map((y) => <Chip key={y} className="chip--round" on={year === y} onClick={() => setYear(y)}>{y}</Chip>)}
            </div>
          )}
        </>
      )}

      {!rows.length && (
        <div className="empty">
          <Icon name="menu_book" />
          <div className="empty-title">{data.entries.length ? 'Nothing here' : 'Nothing logged yet'}</div>
          <div className="empty-body">{data.entries.length ? 'No entries match these filters.' : 'Every movie, episode and anime you log shows up here, by date.'}</div>
        </div>
      )}

      <div className="diary">
        {shown.map((e, i) => {
          const day = eEnd(e);
          const prev = i ? eEnd(shown[i - 1]) : '';
          const newMonth = day.slice(0, 7) !== prev.slice(0, 7);
          const newDay = day !== prev;
          const d = new Date(`${day}T12:00:00`);
          const { m, sub, score, img } = describe(e);
          return (
            <Fragment key={e.id}>
              {newMonth && (
                <div className="diary-month">
                  <span>{MONTHS[+day.slice(5, 7) - 1]?.toUpperCase()} {day.slice(0, 4)}</span>
                  <span>{monthCount.get(day.slice(0, 7))}</span>
                </div>
              )}
              <button className="row-btn row-btn--compact diary-row" onClick={() => onOpen(e)}>
                <div className="diary-day" aria-hidden={!newDay}>
                  {newDay && <><b>{+day.slice(8, 10)}</b><span>{DAYS[d.getDay()]}</span></>}
                </div>
                <Poster src={img} size="sm" />
                <div className="row-body">
                  <div className="row-title row-title--sm ellipsis">{m.title}</div>
                  <div className="row-sub ellipsis">{sub}</div>
                  {e.notes && <div className="diary-notes">{e.notes}</div>}
                </div>
                {score != null && <div className="row-score row-score--sm">{fmtScore(score)}</div>}
              </button>
            </Fragment>
          );
        })}
        {shown.length < rows.length && <div ref={end} className="note" style={{ textAlign: 'center' }}>Loading more…</div>}
      </div>
    </div>
  );
}
