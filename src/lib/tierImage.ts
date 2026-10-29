import { fmtDateLong, todayIso } from './format';
import { posterSrc } from './posters';
import { itemMeta, rankedCount } from './tiers';
import type { Data, TierList } from './types';

/*
 * A tier list drawn as an image to share: the tiers with their posters, in the current theme's
 * colours. Posters come from the saved copies in the Android app (same origin) or over CORS in
 * the browser; one that can't be drawn becomes a tile with its title.
 */

const W = 1080;
const PAD = 40;
const LABEL_W = 132;
const COLS = 7;
const GAP = 10;
const INNER = 12;
const PW = Math.floor((W - PAD * 2 - LABEL_W - INNER * 2 - GAP * (COLS - 1)) / COLS);
const PH = Math.round(PW * 1.5);
const HEAD = 150;

/**
 * Size and format for each Settings.shareQuality, 1 to 10: how many times the layout size it's
 * drawn at, and the JPEG quality. 10 is lossless PNG at about the posters' own resolution
 * (AniList's are ~460px wide, TMDB's 342px, against 112px in the layout); more adds nothing.
 */
const QUALITY: Record<number, { scale: number; jpeg: number | null }> = {
  1: { scale: 1, jpeg: 0.7 },
  2: { scale: 1.25, jpeg: 0.75 },
  3: { scale: 1.5, jpeg: 0.8 },
  4: { scale: 1.75, jpeg: 0.85 },
  5: { scale: 2, jpeg: 0.88 },
  6: { scale: 2, jpeg: 0.92 },
  7: { scale: 2.5, jpeg: 0.92 },
  8: { scale: 3, jpeg: 0.95 },
  9: { scale: 3.5, jpeg: 0.97 },
  10: { scale: 4, jpeg: null },
};
/** A canvas bigger than this fails on many phones; a long list is drawn smaller to fit. */
const MAX_PIXELS = 32_000_000;

/** A canvas this device can't make, or can't turn into an image. */
class TooBig extends Error {}

const rowH = (n: number) => Math.max(1, Math.ceil(n / COLS)) * (PH + GAP) - GAP + INNER * 2;
const layoutHeight = (list: TierList) => PAD + HEAD + list.tiers.reduce((h, t) => h + rowH(t.items.length) + 8, 0) + PAD;

/** The image `tierImage` makes of `list` at `quality`: its size in pixels and its format. */
export function tierImageSize(list: TierList, quality: number) {
  const q = QUALITY[quality] ?? QUALITY[6];
  const height = layoutHeight(list);
  const scale = Math.min(q.scale, Math.sqrt(MAX_PIXELS / (W * height)));
  return { scale, width: Math.round(W * scale), height: Math.round(height * scale), png: q.jpeg == null, jpeg: q.jpeg ?? 1 };
}

/**
 * Loads an image for drawing. A poster from another site gets its own URL here: AniList only adds
 * CORS headers when asked, so a copy the browser cached for an <img> can't be drawn.
 */
function load(url: string): Promise<HTMLImageElement | null> {
  let src = url;
  try {
    const u = new URL(url, location.href);
    if (u.origin !== location.origin) {
      u.searchParams.set('cors', '1');
      src = u.href;
    }
  } catch {
    /* not a URL: try it as it is */
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const t = window.setTimeout(() => resolve(null), 10000);
    img.onload = () => {
      window.clearTimeout(t);
      resolve(img);
    };
    img.onerror = () => {
      window.clearTimeout(t);
      resolve(null);
    };
    img.src = src;
  });
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  // Older Android WebViews (before Chrome 99) have no roundRect: square corners there.
  if (g.roundRect) g.roundRect(x, y, w, h, r);
  else g.rect(x, y, w, h);
}

/** Words of `text` wrapped to `width`, at most `max` lines (the last one cut with an ellipsis). */
function wrap(g: CanvasRenderingContext2D, text: string, width: number, max: number) {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (g.measureText(next).width <= width || !line) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length > max) {
    lines.length = max;
    let last = lines[max - 1];
    while (last && g.measureText(`${last}…`).width > width) last = last.slice(0, -1);
    lines[max - 1] = `${last}…`;
  }
  return lines;
}

/** Draws `list` at `quality` (Settings.shareQuality) and resolves to a JPEG or PNG data URL. */
export async function tierImage(data: Data, list: TierList, quality: number): Promise<string> {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  const C = { bg: v('--bg'), surface: v('--surface'), surface2: v('--surface-2'), border: v('--border'), text: v('--text'), muted: v('--text-muted'), accent: v('--accent-text') };
  await Promise.all(['800 40px Archivo', '600 20px Archivo', '600 20px "JetBrains Mono"'].map((f) => document.fonts.load(f).catch(() => {})));

  const keys = list.tiers.flatMap((t) => t.items);
  const metas = new Map(keys.map((k) => [k, itemMeta(data, k).m]));
  const imgs = new Map<string, HTMLImageElement | null>();
  await Promise.all(keys.map(async (k) => {
    const src = posterSrc(metas.get(k)?.img);
    imgs.set(k, src ? await load(src) : null);
  }));

  const height = layoutHeight(list);
  const size = tierImageSize(list, quality);

  const draw = (withImages: boolean, scale: number) => {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(W * scale);
    canvas.height = Math.round(height * scale);
    const g = canvas.getContext('2d');
    if (!g) throw new TooBig();
    g.scale(scale, scale);
    g.imageSmoothingQuality = 'high';
    g.fillStyle = C.bg;
    g.fillRect(0, 0, W, height);

    // Header: brand, name, what's in it.
    g.textBaseline = 'alphabetic';
    g.fillStyle = C.accent;
    g.font = '600 20px "JetBrains Mono", monospace';
    g.fillText('REELOG · TIER LIST', PAD, PAD + 20);
    g.fillStyle = C.text;
    g.font = '800 52px Archivo, sans-serif';
    g.fillText(wrap(g, list.name, W - PAD * 2, 1)[0], PAD, PAD + 84);
    g.fillStyle = C.muted;
    g.font = '500 22px Archivo, sans-serif';
    g.fillText(`${rankedCount(list)} ranked · ${fmtDateLong(todayIso())}`, PAD, PAD + 122);

    let y = PAD + HEAD;
    for (const t of list.tiers) {
      const h = rowH(t.items.length);
      // Row and label.
      g.fillStyle = C.surface;
      roundRect(g, PAD, y, W - PAD * 2, h, 18);
      g.fill();
      g.save();
      roundRect(g, PAD, y, W - PAD * 2, h, 18);
      g.clip();
      g.fillStyle = t.color;
      g.fillRect(PAD, y, LABEL_W, h);
      g.restore();
      g.fillStyle = '#1B1415';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const size = t.label.length <= 2 ? 64 : t.label.length <= 4 ? 40 : 26;
      g.font = `800 ${size}px Archivo, sans-serif`;
      const lines = wrap(g, t.label || ' ', LABEL_W - 20, 3);
      lines.forEach((line, i) => g.fillText(line, PAD + LABEL_W / 2, y + h / 2 + (i - (lines.length - 1) / 2) * size * 1.05));
      g.textAlign = 'left';
      g.textBaseline = 'alphabetic';

      // Posters.
      t.items.forEach((k, i) => {
        const x = PAD + LABEL_W + INNER + (i % COLS) * (PW + GAP);
        const py = y + INNER + Math.floor(i / COLS) * (PH + GAP);
        const img = withImages ? imgs.get(k) : null;
        g.save();
        roundRect(g, x, py, PW, PH, 10);
        g.clip();
        if (img) {
          // Cover the 2:3 frame, cropping the excess.
          const s = Math.max(PW / img.naturalWidth, PH / img.naturalHeight);
          const sw = PW / s;
          const sh = PH / s;
          g.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, py, PW, PH);
        } else {
          g.fillStyle = C.surface2;
          g.fillRect(x, py, PW, PH);
          g.fillStyle = C.text;
          g.font = '600 15px Archivo, sans-serif';
          wrap(g, metas.get(k)?.title ?? '', PW - 14, 6).forEach((line, j) => g.fillText(line, x + 7, py + 22 + j * 19));
        }
        g.restore();
        g.strokeStyle = C.border;
        g.lineWidth = 1;
        roundRect(g, x + 0.5, py + 0.5, PW - 1, PH - 1, 10);
        g.stroke();
      });
      y += h + 8;
    }
    const url = size.png ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', size.jpeg);
    // What a canvas too big for this device gives instead of an image.
    if (url.length < 100) throw new TooBig();
    return url;
  };

  // Too big for this phone: try again at half the pixels, down to the smallest size.
  for (let scale = size.scale; ; scale /= Math.SQRT2) {
    try {
      try {
        return draw(true, scale);
      } catch (e) {
        if (e instanceof TooBig) throw e;
        // A poster that loaded without CORS taints the canvas: draw them all as title tiles instead.
        return draw(false, scale);
      }
    } catch (e) {
      if (!(e instanceof TooBig) || scale <= 1) throw e;
    }
  }
}
