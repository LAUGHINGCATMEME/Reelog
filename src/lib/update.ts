/** Where releases are published. The app checks it only when asked to. */
export const REPO = 'LAUGHINGCATMEME/Reelog';
export const REPO_URL = `https://github.com/${REPO}`;

const parts = (v: string) => v.replace(/^v/i, '').split(/[.-]/).map((x) => parseInt(x, 10) || 0);

/** a > b for versions like 1.2.0 / v1.10.3. */
export function newer(a: string, b: string) {
  const x = parts(a);
  const y = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  }
  return false;
}

/** The latest published release, or null if there is none yet. Throws when offline. */
export async function latestRelease(): Promise<{ version: string; url: string } | null> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const r = (await res.json()) as { tag_name: string; html_url: string };
  return { version: r.tag_name.replace(/^v/i, ''), url: r.html_url };
}
