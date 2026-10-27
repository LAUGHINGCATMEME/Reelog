import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { SMAP, STATUSES } from '../lib/library';
import { posterSrc } from '../lib/posters';
import type { Status, Tab } from '../lib/types';

export const Icon = ({ name, className = '' }: { name: string; className?: string }) => (
  <span className={`ms ${className}`} aria-hidden="true">{name}</span>
);

// ---- Overlays and the back button ----

/**
 * Where screens put sheets, bars and drag ghosts that must sit above the whole app (the nav, the
 * FAB) rather than inside the scrolling page. The app provides the element.
 */
const OverlayContext = createContext<HTMLElement | null>(null);
export const OverlayHost = OverlayContext.Provider;
export function Overlay({ children }: { children: ReactNode }) {
  const host = useContext(OverlayContext);
  return host ? createPortal(children, host) : null;
}

/*
 * Things a screen opens on top of itself (menus, sheets, a selection) register here, so the back
 * button closes the newest one before it leaves the screen.
 */
const layers: (() => void)[] = [];
const layerListeners = new Set<() => void>();
const layersChanged = () => layerListeners.forEach((f) => f());

/** While `open`, the back button calls `close` instead of going back. */
export function useBackLayer(open: boolean, close: () => void) {
  const ref = useRef(close);
  ref.current = close;
  useEffect(() => {
    if (!open) return;
    const fn = () => ref.current();
    layers.push(fn);
    layersChanged();
    return () => {
      const i = layers.lastIndexOf(fn);
      if (i >= 0) layers.splice(i, 1);
      layersChanged();
    };
  }, [open]);
}

/** Closes the newest open layer. False if there was none. */
export function closeTopLayer() {
  const top = layers[layers.length - 1];
  top?.();
  return !!top;
}

const watchLayers = (f: () => void) => {
  layerListeners.add(f);
  return () => void layerListeners.delete(f);
};
/** How many layers are open (re-renders when that changes). */
export const useLayerCount = () => useSyncExternalStore(watchLayers, () => layers.length);

/** A bottom sheet for a screen's own forms. Keep its content rendered while it closes, so it slides away. */
export function Sheet({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: ReactNode }) {
  useBackLayer(open, onClose);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open && ref.current) ref.current.scrollTop = 0;
  }, [open]);
  return (
    <Overlay>
      <div className="scrim" data-on={open} onClick={onClose} />
      <div ref={ref} className="sheet" data-on={open} role="dialog" aria-modal="true" aria-label={label} aria-hidden={!open}>
        <div className="grabber" />
        {children}
      </div>
    </Overlay>
  );
}

/** A dropdown under its anchor (put both in a `.menu-anchor`). */
export function Menu({ open, onClose, head, role = 'menu', children }: {
  open: boolean; onClose: () => void; head?: string; role?: 'menu' | 'listbox'; children: ReactNode;
}) {
  useBackLayer(open, onClose);
  if (!open) return null;
  return (
    <>
      <div className="menu-scrim" onClick={onClose} />
      <div className="menu" role={role} aria-label={head}>
        {head && <div className="menu-head">{head}</div>}
        {children}
      </div>
    </>
  );
}

/** Striped placeholder; the image fades in once it has loaded. Uses the saved copy when there is one. */
export function Poster({ src, size, className = '' }: { src?: string; size: 'xs' | 'sm' | 'md' | 'lg' | 'grid' | 'tier'; className?: string }) {
  // Track which URL loaded/failed rather than resetting on mount: a cached image can finish
  // loading before effects run, and a reset would then hide it for good.
  const [loaded, setLoaded] = useState<string>();
  const [failed, setFailed] = useState<string>();
  const local = posterSrc(src);
  // A saved copy that won't load falls back to the network.
  const url = failed && failed === local ? src : local;
  const imgRef = useCallback(
    (img: HTMLImageElement | null) => {
      if (img?.complete && img.naturalWidth > 0) setLoaded(url);
    },
    [url],
  );
  return (
    <div className={`poster poster--${size} ${className}`}>
      {url && failed !== url && (
        <img
          ref={imgRef}
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          className={loaded === url ? 'loaded' : undefined}
          onLoad={() => setLoaded(url)}
          onError={() => setFailed(url)}
        />
      )}
    </div>
  );
}

/** Blurred poster glow behind a detail header. */
export function Backdrop({ src }: { src?: string }) {
  const url = posterSrc(src);
  const [loaded, setLoaded] = useState<string>();
  if (!url) return <div className="backdrop" aria-hidden="true" />;
  return (
    <div className="backdrop" aria-hidden="true">
      <img src={url} alt="" decoding="async" className={loaded === url ? 'loaded' : undefined} onLoad={() => setLoaded(url)} />
    </div>
  );
}

/** The Reelog mark: a film reel with its tape running out flat. Same shape as the app icon. */
export const Logo = ({ className = '' }: { className?: string }) => (
  <svg className={`logo ${className}`} viewBox="-140 -132 280 264" aria-hidden="true">
    <path
      fill="currentColor"
      d="M120,0 A128,128 0 1 1 -136,0 A128,128 0 1 1 120,0 Z M-8,100 H122 A14,14 0 0 1 122,128 H-8 Z M20,-70 A28,28 0 1 0 -36,-70 A28,28 0 1 0 20,-70 Z M86.57,-21.63 A28,28 0 1 0 30.57,-21.63 A28,28 0 1 0 86.57,-21.63 Z M61.14,56.63 A28,28 0 1 0 5.14,56.63 A28,28 0 1 0 61.14,56.63 Z M-21.14,56.63 A28,28 0 1 0 -77.14,56.63 A28,28 0 1 0 -21.14,56.63 Z M-46.57,-21.63 A28,28 0 1 0 -102.57,-21.63 A28,28 0 1 0 -46.57,-21.63 Z M6,0 A14,14 0 1 0 -22,0 A14,14 0 1 0 6,0 Z"
    />
  </svg>
);

export function Brand() {
  return (
    <div className="brand">
      <Logo className="brand-mark" />
      <span className="brand-name">REELOG</span>
    </div>
  );
}

/** `children` fill the bar (a search field); `actions` sit at its right end. */
export function BackBar({ onBack, children, actions }: { onBack: () => void; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className={children ? 'backbar backbar--search' : 'backbar'}>
      <button className="icon-btn" aria-label="Back" onClick={onBack}><Icon name="arrow_back" /></button>
      {children}
      {actions && <div className="backbar-actions">{actions}</div>}
    </div>
  );
}

export function Chip({ on, onClick, children, className = '' }: { on: boolean; onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button className={`chip ${className}`} aria-pressed={on} onClick={onClick}>{children}</button>
  );
}

/** Status picker; tapping the active status clears it. */
export function StatusChips({ value, onChange }: { value: Status | null; onChange: (s: Status) => void }) {
  return (
    <div className="chips chips--detail" role="group" aria-label="Status">
      {STATUSES.map(([k, label]) => (
        <Chip key={k} on={value === k} onClick={() => onChange(k)}>{label}</Chip>
      ))}
    </div>
  );
}

export function StatusText({ status, className = '' }: { status: Status | null; className?: string }) {
  if (!status) return null;
  return <span className={className} style={{ color: SMAP[status].color }}>{SMAP[status].label}</span>;
}

export function Genres({ genres, onPick }: { genres: string[]; onPick: (g: string) => void }) {
  if (!genres.length) return null;
  return (
    <div className="genres">
      {genres.map((g) => <button key={g} className="genre" onClick={() => onPick(g)}>{g}</button>)}
    </div>
  );
}

export function Skeletons() {
  return (
    <div className="skeletons" aria-label="Loading">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="skel" style={{ animationDelay: `${i * 0.12}s` }}>
          <div className="skel-poster" />
          <div className="skel-lines"><div className="skel-line" /><div className="skel-line" /></div>
        </div>
      ))}
    </div>
  );
}

// ---- Dialog ----

/** `alt` is a second choice beside OK, such as Merge beside Replace. */
export type DialogSpec = { title: string; body: string; okLabel?: string; onOk?: () => void; alt?: { label: string; onClick: () => void } };

export function Dialog({ spec, open, onClose }: { spec: DialogSpec | null; open: boolean; onClose: () => void }) {
  const okRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) (okRef.current ?? cancelRef.current)?.focus();
  }, [open]);
  return (
    <div className="dlg-wrap" data-on={open} onClick={(e) => e.target === e.currentTarget && onClose()} aria-hidden={!open}>
      {spec && (
        <div role="alertdialog" aria-modal="true" aria-labelledby="dlg-title" className="dlg">
          <div id="dlg-title" className="dlg-title">{spec.title}</div>
          <div className="dlg-body">{spec.body}</div>
          <div className="dlg-actions">
            {spec.onOk ? (
              <>
                <button ref={cancelRef} className="dlg-btn" onClick={onClose}>Cancel</button>
                {spec.alt && <button className="dlg-btn dlg-btn--info" onClick={spec.alt.onClick}>{spec.alt.label}</button>}
                <button ref={okRef} className="dlg-btn dlg-btn--ok" onClick={spec.onOk}>{spec.okLabel}</button>
              </>
            ) : (
              <button ref={cancelRef} className="dlg-btn dlg-btn--info" onClick={onClose}>OK</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Toast ----

/** A button on a toast, such as Undo. */
export type ToastAction = { label: string; onClick: () => void };
type ToastState = { text: string; on: boolean; warn: boolean; action?: ToastAction };

export function useToast() {
  const [state, setState] = useState<ToastState>({ text: '', on: false, warn: false });
  const timer = useRef<number>();
  /** `warn` shows a warning icon and stays up longer; so does a toast with an action. */
  const show = useCallback((text: string, warn = false, action?: ToastAction) => {
    window.clearTimeout(timer.current);
    setState({ text, on: true, warn, action });
    timer.current = window.setTimeout(() => setState((s) => ({ ...s, on: false })), warn ? 5000 : action ? 4500 : 2400);
  }, []);
  const hide = useCallback(() => setState((s) => ({ ...s, on: false })), []);
  return [state, show, hide] as const;
}

export function Toast({ state: s, high, onAction }: { state: ToastState; high: boolean; onAction: () => void }) {
  return (
    <div className={high ? 'toast toast--high' : 'toast'} data-on={s.on} role="status" aria-live="polite">
      <Icon name={s.warn ? 'warning' : 'check_circle'} />
      <span className="toast-text">{s.text}</span>
      {s.action && (
        <button className="toast-action" tabIndex={s.on ? 0 : -1} onClick={() => { onAction(); s.action!.onClick(); }}>{s.action.label}</button>
      )}
    </div>
  );
}

// ---- Bottom nav ----

const NAV: [Tab, string, string][] = [
  ['movie', 'Movies', 'movie'],
  ['tv', 'TV', 'tv'],
  ['anime', 'Anime', 'animation'],
  ['settings', 'Settings', 'settings'],
];

export function NavBar({ current, onGo }: { current: Tab; onGo: (t: Tab) => void }) {
  return (
    <nav className="nav">
      {NAV.map(([key, label, icon]) => (
        <button key={key} className="nav-btn" aria-current={current === key ? 'page' : undefined} onClick={() => onGo(key)}>
          <span className="nav-pill"><Icon name={icon} /></span>
          <span className="nav-label">{label}</span>
        </button>
      ))}
    </nav>
  );
}
