import { BackBar } from '../components/ui';
import { fmtScore, pad, plural } from '../lib/format';
import { avg, eCount, eEnd, getMeta, libIds, STATUSES, titleInfo } from '../lib/library';
import type { Data, Status } from '../lib/types';

const MON = 'JFMAMJJASOND';
const share = (n: number, max: number) => `${Math.round((n / Math.max(1, max)) * 100)}%`;

function Bars({ items, height }: { items: { l: string; v: number; muted?: boolean }[]; height: number }) {
  const max = Math.max(1, ...items.map((x) => x.v));
  return (
    <div className="chart">
      <div className="bars" style={{ height }}>
        {items.map((b, i) => (
          <div key={i}>
            <span className="bars-v">{b.v || ''}</span>
            <div className="bars-bar" style={{ height: share(b.v, max), background: b.muted && !b.v ? 'var(--surface-3)' : undefined }} />
          </div>
        ))}
      </div>
      <div className="bars-labels">{items.map((b, i) => <span key={i}>{b.l}</span>)}</div>
    </div>
  );
}

export function Stats({ data, onBack }: { data: Data; onBack: () => void }) {
  const E = data.entries;
  const titles = (['movie', 'tv', 'anime'] as const).flatMap((k) => libIds(data, k).map((id) => titleInfo(data, k, id)));

  if (!E.length && !titles.length) {
    return (
      <div className="screen">
        <BackBar onBack={onBack} />
        <div style={{ padding: '4px 20px 0' }}><h1 className="h1">Statistics</h1></div>
        <div className="hint" style={{ padding: '48px 32px' }}>Log a movie, episode or anime to see statistics.</div>
      </div>
    );
  }

  const of = (k: string) => E.filter((e) => e.kind === k);
  const sum = (a: typeof E) => a.reduce((x, e) => x + eCount(e), 0);
  const refs = (a: typeof E) => new Set(a.map((e) => e.ref)).size;
  const [mv, tv, an] = [of('movie'), of('tv'), of('anime')];

  let mins = 0;
  let unknown = 0;
  for (const e of E) {
    const m = getMeta(data, e.kind, e.ref);
    const per = e.kind === 'movie' ? m.runtime : e.kind === 'tv' ? m.epRuntime : m.dur;
    if (per) mins += per * eCount(e);
    else unknown++;
  }

  const now = new Date();
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
    return { k: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`, l: MON[d.getMonth()], v: 0, muted: true };
  });
  for (const e of E) {
    const mo = months.find((x) => x.k === eEnd(e).slice(0, 7));
    if (mo) mo.v += eCount(e);
  }

  const statusCounts: Partial<Record<Status, number>> = {};
  for (const x of titles) for (const s of x.statuses) statusCounts[s] = (statusCounts[s] ?? 0) + 1;
  const statusMax = Math.max(1, ...Object.values(statusCounts));

  // One score per rated thing: movie (latest watch), anime title, TV season.
  const scores: number[] = [];
  for (const x of titles) {
    if (x.kind === 'movie' && x.score != null) scores.push(x.score);
    if (x.kind === 'anime' && data.rates[`anime:${x.id}`] != null) scores.push(data.rates[`anime:${x.id}`]);
  }
  for (const [k, v] of Object.entries(data.rates)) if (k.startsWith('tv:')) scores.push(v);
  const buckets = Array.from({ length: 10 }, (_, i) => ({ l: String(i + 1), v: 0 }));
  for (const s of scores) buckets[Math.min(9, Math.max(0, Math.ceil(s) - 1))].v++;

  const genreCounts: Record<string, number> = {};
  for (const x of titles) for (const g of x.m.genres ?? []) genreCounts[g] = (genreCounts[g] ?? 0) + 1;
  const top = Object.entries(genreCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);

  return (
    <div className="screen">
      <BackBar onBack={onBack} />
      <div style={{ padding: '4px 20px 0' }}><h1 className="h1">Statistics</h1></div>

      <div className="overview">
        <div><span className="stat-label">MOVIES</span><span className="overview-v">{refs(mv)}</span><span className="overview-sub">{plural(mv.length, 'watch', 'watches')}</span></div>
        <div><span className="stat-label">TV EPS</span><span className="overview-v">{sum(tv)}</span><span className="overview-sub">{plural(refs(tv), 'show')}</span></div>
        <div><span className="stat-label">ANIME EPS</span><span className="overview-v">{sum(an)}</span><span className="overview-sub">{plural(refs(an), 'title')}</span></div>
      </div>
      <div className="time-card">
        <span className="section-title">Time watched</span>
        <span className="stat-value">{Math.round(mins / 60)} h</span>
      </div>
      <div className="time-note">
        Estimated from runtimes.{unknown ? ` ${unknown} ${unknown === 1 ? 'entry has' : 'entries have'} no runtime yet.` : ''}
      </div>

      <div className="chart-head"><span>LAST 12 MONTHS</span><span>{months.reduce((a, b) => a + b.v, 0)} watches & episodes</span></div>
      <Bars items={months} height={120} />

      <div className="chart-head"><span>STATUS</span></div>
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
