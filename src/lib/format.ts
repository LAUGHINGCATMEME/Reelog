const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const pad = (n: number) => String(n).padStart(2, '0');
export const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayIso = () => iso(new Date());
export const yesterdayIso = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return iso(d);
};

/** 2024-03-01 → 01/03/2024 */
export function fmtDate(s: string) {
  if (!s) return 'No date';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

/** 2024-03-01 → 01 Mar 2024 */
export function fmtDateLong(s: string) {
  if (!s) return 'No date';
  const [y, m, d] = s.split('-');
  return `${d} ${MON[+m - 1]} ${y}`;
}

/** Formats free typing into DD/MM/YYYY as the user types. */
export function maskDate(v: string) {
  const n = v.replace(/\D/g, '').slice(0, 8);
  return [n.slice(0, 2), n.slice(2, 4), n.slice(4)].filter(Boolean).join('/');
}

/** DD/MM/YYYY → ISO, or null if it isn't a real calendar date. */
export function parseDate(t: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t);
  if (!m) return null;
  const [, d, mo, y] = m;
  const dt = new Date(+y, +mo - 1, +d);
  if (dt.getDate() !== +d || dt.getMonth() !== +mo - 1) return null;
  return `${y}-${mo}-${d}`;
}

export const fmtScore = (s: number | null | undefined) =>
  s == null ? '—' : s % 1 ? s.toFixed(1) : String(s);

export const fmtRuntime = (min?: number) => (min ? `${Math.floor(min / 60)}h ${min % 60}m` : '');

export const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;
