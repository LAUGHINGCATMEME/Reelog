import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { isNative } from './native';

/**
 * Posters in the Android app are saved to app storage the first time they're seen and served
 * from there afterwards, so they show offline and survive the WebView cache being cleared.
 * The web build gets the same from the service worker.
 */
const DIR = 'posters';
const saved = new Set<string>();
const pending = new Set<string>();
const queue: [string, string][] = [];
let base: string | null = null;
let active = 0;

/** Stable file name for a URL: two 32-bit FNV-1a hashes plus the image extension. */
function fileName(url: string) {
  let a = 0x811c9dc5, b = 0x050c5d1f;
  for (let i = 0; i < url.length; i++) {
    const c = url.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x01000193) ^ (b >>> 15);
  }
  const ext = /\.(jpe?g|png|webp)(?:$|\?)/i.exec(url)?.[1].toLowerCase() ?? 'jpg';
  return `${(a >>> 0).toString(36)}${(b >>> 0).toString(36)}.${ext}`;
}

/** Resolves once the saved posters are known; render after this so they don't flash in. */
export const postersReady: Promise<void> = isNative
  ? (async () => {
      try {
        await Filesystem.mkdir({ path: DIR, directory: Directory.Data, recursive: true });
      } catch {
        /* already exists */
      }
      try {
        const { files } = await Filesystem.readdir({ path: DIR, directory: Directory.Data });
        for (const f of files) if (!f.name.endsWith('.part')) saved.add(f.name);
        base = Capacitor.convertFileSrc((await Filesystem.getUri({ path: DIR, directory: Directory.Data })).uri);
      } catch {
        /* storage unavailable — fall back to loading from the network */
      }
    })()
  : Promise.resolve();

function pump() {
  while (active < 3 && queue.length) {
    const [url, name] = queue.shift()!;
    active++;
    void (async () => {
      const part = `${DIR}/${name}.part`;
      try {
        // Download beside the final name so an interrupted download is never mistaken for a poster.
        await Filesystem.downloadFile({ url, path: part, directory: Directory.Data, connectTimeout: 15000, readTimeout: 30000 });
        await Filesystem.rename({ from: part, to: `${DIR}/${name}`, directory: Directory.Data, toDirectory: Directory.Data });
        saved.add(name);
      } catch {
        /* offline or gone — tried again the next time it's shown */
      }
      pending.delete(name);
      active--;
      pump();
    })();
  }
}

/** Saves a poster to the device if it isn't saved yet. */
export function keepPoster(url: string | undefined) {
  if (!url || !base || !/^https?:/.test(url)) return;
  const name = fileName(url);
  if (saved.has(name) || pending.has(name)) return;
  pending.add(name);
  queue.push([url, name]);
  pump();
}

/** The URL to show a poster from: the saved copy if there is one, otherwise the network (and save it). */
export function posterSrc(url: string | undefined) {
  if (!url || !base) return url;
  const name = fileName(url);
  if (saved.has(name)) return `${base}/${name}`;
  keepPoster(url);
  return url;
}
