import { useState } from 'react';
import { BackBar, Chip, Icon, Poster } from '../components/ui';
import { fmtDateLong, fmtScore, pad, plural, todayIso } from '../lib/format';
import { avg, eCount, eEnd, eStart, getMeta, libIds, STATUSES, titleInfo, type TitleInfo } from '../lib/library';
import type { Data, Entry, Kind, Status } from '../lib/types';

const MON = 'JFMAMJJASOND';
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const KINDS: [Kind, string, string][] = [
  ['movie', 'Movies', 'var(--accent)'],
  ['tv', 'TV', 'var(--text)'],
  ['anime', 'Anime', 'var(--text-muted)'],
];
const share = (n: number, max: number) => `${Math.round((n / Math.max(1, max)) * 100)}%`;

// Calendar days as whole numbers, so ranges and streaks are simple arithmetic.
const dayNum = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 864e5;
const dayStr = (n: number) => new Date(n * 864e5).toISOString().slice(0, 10);

/**
 * Spreads an entry's watches/episodes evenly over the days it covers, so a range logged
 * as "E1–24, 1–10 Mar" counts towards each of those days rather than piling onto the last.
 */
function spread(e: Entry): [string, number][] {
  const b = eEnd(e);
  if (!/^\d{4}-\d\d-\d\d$/.test(b)) return [];
  const a = /^\d{4}-\d\d-\d\d$/.test(eStart(e)) ? eStart(e) : b;
  const n = dayNum(b) - dayNum(a) + 1;
  if (n < 1 || n > 366) return [[b, eCount(e)]];
  return Array.from({ length: n }, (_, i) => [dayStr(dayNum(a) + i), eCount(e) / n]);
}

function minutesOf(data: Data, e: Entry) {
  const m = getMeta(data, e.kind, e.ref);
  const per = e.kind === 'movie' ? m.runtime : e.kind === 'tv' ? m.epRuntime : m.dur;
  return per ? per * eCount(e) : null;
}

function longestRun(days: number[]) {
  let best = { len: 0, end: 0 };
  let len = 0;
  for (let i = 0; i < days.length; i++) {
    len = i && days[i] === days[i - 1] + 1 ? len + 1 : 1;
    if (len > best.len) best = { len, end: days[i] };
  }
  return best;
}

function Bars({ items, height }: { items: { l: string; v: number; muted?: boolean }[]; height: number }) {
  const max = Math.max(1, ...items.map((x) => x.v));
  return (
    <div className="chart">
      <div className="bars" style={{ height }}>
        {items.map((b, i) => (
          <div key={i}>
            <span className="bars-v">{b.v ? Math.round(b.v) : ''}</span>
            <div className="bars-bar" style={{ height: share(b.v, max), background: b.muted && !b.v ? 'var(--surface-3)' : undefined }} />
          </div>
        ))}
      </div>
      <div className="bars-labels">{items.map((b, i) => <span key={i}>{b.l}</span>)}</div>
    </div>
  );
}

function Tile({ icon, label, value, sub }: { icon: string; label: string; value: string; sub?: string }) {
  return (
    <div className="tile">
      <span className="stat-label"><Icon name={icon} />{label}</span>
      <span className="tile-v">{value}</span>
      {sub && <span className="overview-sub">{sub}</span>}
    </div>
  );
}

function TitleList({ items, onOpen }: { items: { x: TitleInfo; right: string; sub: string }[]; onOpen: (k: Kind, id: number) => void }) {
  return (
    <div className="list list--flush">
      {items.map(({ x, right, sub }, i) => (
        <button key={`${x.kind}${x.id}`} className="row-btn row-btn--compact" onClick={() => onOpen(x.kind, x.id)}>
          <span className="rank">{i + 1}</span>
          <Poster src={x.m.img} size="sm" />
          <div className="row-body">
            <div className="row-title row-title--sm ellipsis">{x.m.title}</div>
            <div className="row-sub">{sub}</div>
          </div>
          <div className="row-score">{right}</div>
        </button>
      ))}
    </div>
  );
}

export function Stats({ data, onBack, onOpen }: { data: Data; onBack: () => void; onOpen: (kind: Kind, id: number) => void }) {
  const [period, setPeriod] = useState<'all' | string>('all');
  const allTitles = (['movie', 'tv', 'anime'] as const).flatMap((k) => libIds(data, k).map((id) => titleInfo(data, k, id)));

  if (!data.entries.length && !allTitles.length) {
    return (
      <div className="screen">
        <BackBar onBack={onBack} />
        <div style={{ padding: '4px 20px 0' }}><h1 className="h1">Statistics</h1></div>
        <div className="hint" style={{ padding: '48px 32px' }}>Log a movie, episode or anime to see statistics.</div>
      </div>
    );
  }

  const years = [...new Set(data.entries.map((e) => eEnd(e).slice(0, 4)).filter((y) => /^\d{4}$/.test(y)))].sort().reverse();
  const inPeriod = (e: Entry) => period === 'all' || eEnd(e).startsWith(period);
  const E = data.entries.filter(inPeriod);
  const titles = period === 'all' ? allTitles : allTitles.filter((x) => x.es.some(inPeriod));
  const kindLabel: Record<Kind, string> = { movie: 'Movie', tv: 'TV', anime: 'Anime' };

  const of = (k: Kind) => E.filter((e) => e.kind === k);
  const sum = (a: Entry[]) => a.reduce((x, e) => x + eCount(e), 0);
  const refs = (a: Entry[]) => new Set(a.map((e) => e.ref)).size;
  const [mv, tv, an] = [of('movie'), of('tv'), of('anime')];

  // ---- Time ----
  const mins: Record<Kind, number> = { movie: 0, tv: 0, anime: 0 };
  let unknown = 0;
  for (const e of E) {
    const m = minutesOf(data, e);
    if (m == null) unknown++;
    else mins[e.kind] += m;
  }
  const totalMin = mins.movie + mins.tv + mins.anime;

  // ---- Days ----
  const perDay = new Map<string, number>();
  for (const e of E) for (const [d, v] of spread(e)) if (period === 'all' || d.startsWith(period)) perDay.set(d, (perDay.get(d) ?? 0) + v);
  const days = [...perDay.keys()].map(dayNum).sort((a, b) => a - b);
  const run = longestRun(days);
  const today = dayNum(todayIso());
  const daySet = new Set(days);
  let current = 0;
  for (let d = daySet.has(today) ? today : today - 1; daySet.has(d); d--) current++;
  const busiest = [...perDay].sort((a, b) => b[1] - a[1])[0];
  const units = sum(E);
  const first = data.entries.reduce((a, e) => { const s = eStart(e) || eEnd(e); return s && (!a || s < a) ? s : a; }, '');

  // ---- Charts ----
  const now = new Date();
  const months =
    period === 'all'
      ? Array.from({ length: 12 }, (_, i) => {
          const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
          return { k: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`, l: MON[d.getMonth()], v: 0, muted: true };
        })
      : Array.from({ length: 12 }, (_, i) => ({ k: `${period}-${pad(i + 1)}`, l: MON[i], v: 0, muted: true }));
  const yearBars = [...years].reverse().map((y) => ({ k: y, l: `'${y.slice(2)}`, v: 0 }));
  const weekdays = DAYS.map((l) => ({ l: l[0], v: 0 }));
  for (const [d, v] of perDay) {
    const mo = months.find((x) => x.k === d.slice(0, 7));
    if (mo) mo.v += v;
    const yb = yearBars.find((x) => x.k === d.slice(0, 4));
    if (yb) yb.v += v;
    weekdays[(new Date(d + 'T12:00:00').getDay() + 6) % 7].v += v;
  }
  const topDay = weekdays.reduce((a, b, i) => (b.v > weekdays[a].v ? i : a), 0);
  const topMonth = months.reduce((a, b) => (b.v > a.v ? b : a), months[0]);

  // ---- Titles ----
  const statusCounts: Partial<Record<Status, number>> = {};
  for (const x of titles) for (const s of x.statuses) statusCounts[s] = (statusCounts[s] ?? 0) + 1;
  const statusMax = Math.max(1, ...Object.values(statusCounts));

  const rated = titles.filter((x) => x.score != null);
  const scores = rated.map((x) => x.score!);
  const buckets = Array.from({ length: 10 }, (_, i) => ({ l: String(i + 1), v: 0 }));
  for (const s of scores) buckets[Math.min(9, Math.max(0, Math.ceil(s) - 1))].v++;
  const topRated = [...rated].sort((a, b) => b.score! - a.score! || b.last.localeCompare(a.last)).slice(0, 5);

  const epsOf = (x: TitleInfo) => x.es.filter(inPeriod).reduce((n, e) => n + eCount(e), 0);
  const mostWatched = titles
    .filter((x) => !x.film)
    .map((x) => ({ x, n: epsOf(x) }))
    .filter((y) => y.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 5);
  // Movies and anime films.
  const rewatched = titles
    .filter((x) => x.film)
    .map((x) => ({ x, n: x.es.filter(inPeriod).length }))
    .filter((y) => y.n > 1)
    .sort((a, b) => b.n - a.n)
    .slice(0, 5);

  const genreCounts: Record<string, number> = {};
  for (const x of titles) for (const g of x.m.genres ?? []) genreCounts[g] = (genreCounts[g] ?? 0) + 1;
  const top = Object.entries(genreCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);

  return (
    <div className="screen">
      <BackBar onBack={onBack} />
      <div style={{ padding: '4px 20px 0' }}><h1 className="h1">Statistics</h1></div>
      {!!years.length && (
        <div className="chips" role="toolbar" aria-label="Period">
          <Chip on={period === 'all'} onClick={() => setPeriod('all')}>All time</Chip>
          {years.map((y) => <Chip key={y} on={period === y} onClick={() => setPeriod(y)}>{y}</Chip>)}
        </div>
      )}

      <div className="overview">
        <div><span className="stat-label">MOVIES</span><span className="overview-v">{refs(mv)}</span><span className="overview-sub">{plural(mv.length, 'watch', 'watches')}</span></div>
        <div><span className="stat-label">TV EPS</span><span className="overview-v">{sum(tv)}</span><span className="overview-sub">{plural(refs(tv), 'show')}</span></div>
        <div><span className="stat-label">ANIME EPS</span><span className="overview-v">{sum(an)}</span><span className="overview-sub">{plural(refs(an), 'title')}</span></div>
      </div>

      <div className="time-card time-card--big">
        <div className="time-row">
          <span className="section-title">Time watched</span>
          <span className="stat-value">{Math.round(totalMin / 60).toLocaleString()} h</span>
        </div>
        {totalMin > 0 && (
          <>
            <div className="split-bar">
              {KINDS.map(([k, , c]) => mins[k] > 0 && <div key={k} style={{ width: share(mins[k], totalMin), background: c }} />)}
            </div>
            <div className="legend">
              {KINDS.map(([k, label, c]) => (
                <span key={k}><i style={{ background: c }} />{label} <b>{Math.round(mins[k] / 60)} h</b></span>
              ))}
            </div>
            <div className="overview-sub">That's {(totalMin / 1440).toFixed(1)} days{days.length ? `, or ${Math.round(totalMin / days.length)} min per active day` : ''}.</div>
          </>
        )}
      </div>
      <div className="time-note">
        Estimated from runtimes.{unknown ? ` ${unknown} ${unknown === 1 ? 'entry has' : 'entries have'} no runtime yet.` : ''}
      </div>

      <div className="chart-head"><span>HIGHLIGHTS</span></div>
      <div className="tiles">
        <Tile icon="calendar_today" label="ACTIVE DAYS" value={days.length.toLocaleString()} sub={days.length ? `${(units / days.length).toFixed(1)} per day` : undefined} />
        <Tile icon="local_fire_department" label="LONGEST STREAK" value={plural(run.len, 'day')} sub={run.len ? `ended ${fmtDateLong(dayStr(run.end))}` : undefined} />
        {period === 'all' || period === String(now.getFullYear())
          ? <Tile icon="bolt" label="CURRENT STREAK" value={plural(current, 'day')} sub={current ? 'keep it going' : 'watch something today'} />
          : <Tile icon="star" label="BEST MONTH" value={topMonth.v ? ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][+topMonth.k.slice(5) - 1] : '—'} sub={topMonth.v ? `${Math.round(topMonth.v)} watched` : undefined} />}
        <Tile icon="event" label="BUSIEST DAY" value={busiest ? fmtDateLong(busiest[0]) : '—'} sub={busiest ? `${Math.round(busiest[1])} watched` : undefined} />
        <Tile icon="today" label="FAVOURITE DAY" value={days.length ? ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][topDay] : '—'} />
        {period === 'all'
          ? <Tile icon="history" label="LOGGING SINCE" value={first ? fmtDateLong(first) : '—'} sub={first ? plural(Math.max(1, today - dayNum(first)), 'day') : undefined} />
          : <Tile icon="playlist_add_check" label="TITLES" value={String(titles.length)} sub={`${titles.filter((x) => x.statuses.includes('completed')).length} completed`} />}
      </div>

      {period === 'all' && yearBars.length > 1 && (
        <>
          <div className="chart-head"><span>BY YEAR</span><span>{Math.round(units).toLocaleString()} watches & episodes</span></div>
          <Bars items={yearBars} height={110} />
        </>
      )}
      <div className="chart-head">
        <span>{period === 'all' ? 'LAST 12 MONTHS' : `MONTHS OF ${period}`}</span>
        <span>{Math.round(months.reduce((a, b) => a + b.v, 0))} watches & episodes</span>
      </div>
      <Bars items={months} height={120} />
      <div className="chart-head"><span>BY WEEKDAY</span></div>
      <Bars items={weekdays} height={80} />

      {!!topRated.length && (
        <>
          <div className="chart-head"><span>TOP RATED</span></div>
          <TitleList items={topRated.map((x) => ({ x, right: fmtScore(x.score), sub: [kindLabel[x.kind], x.m.year].filter(Boolean).join(' · ') }))} onOpen={onOpen} />
        </>
      )}
      {!!mostWatched.length && (
        <>
          <div className="chart-head"><span>MOST EPISODES</span></div>
          <TitleList items={mostWatched.map(({ x, n }) => ({ x, right: String(n), sub: `${kindLabel[x.kind]} · episodes` }))} onOpen={onOpen} />
        </>
      )}
      {!!rewatched.length && (
        <>
          <div className="chart-head"><span>MOST REWATCHED</span></div>
          <TitleList items={rewatched.map(({ x, n }) => ({ x, right: `×${n}`, sub: [x.kind === 'anime' ? 'Anime' : '', x.m.year, x.m.director].filter(Boolean).join(' · ') }))} onOpen={onOpen} />
        </>
      )}

      <div className="chart-head"><span>STATUS</span><span>{plural(titles.length, 'title')}</span></div>
      <div className="hbars">
        {STATUSES.map(([k, label, color]) => (
          <div key={k} className="hbar">
            <span className="hbar-label" style={{ color }}>{label}</span>
            <div className="hbar-track"><div style={{ width: share(statusCounts[k] ?? 0, statusMax), background: color }} /></div>
            <span className="hbar-n">{statusCounts[k] ?? 0}</span>
          </div>
        ))}
      </div>

      <div className="chart-head">
        <span>RATINGS</span>
        <span>{scores.length ? `${fmtScore(avg(scores))} mean · ${scores.length} rated` : 'No ratings yet'}</span>
      </div>
      <Bars items={buckets} height={90} />

      {!!top.length && (
        <>
          <div className="chart-head"><span>TOP GENRES</span></div>
          <div className="hbars">
            {top.map(([g, n]) => (
              <div key={g} className="hbar hbar--wide">
                <span className="hbar-label">{g}</span>
                <div className="hbar-track"><div style={{ width: share(n, top[0][1]), background: 'var(--accent-text)' }} /></div>
                <span className="hbar-n">{n}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
