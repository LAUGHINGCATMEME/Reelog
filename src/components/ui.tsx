import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { SMAP, STATUSES } from '../lib/library';
import type { Status, Tab } from '../lib/types';

export const Icon = ({ name, className = '' }: { name: string; className?: string }) => (
  <span className={`ms ${className}`} aria-hidden="true">{name}</span>
);

/** Striped placeholder; the image fades in once it has loaded. */
export function Poster({ src, size, className = '' }: { src?: string; size: 'sm' | 'md' | 'lg' | 'grid'; className?: string }) {
  const [state, setState] = useState<'loading' | 'loaded' | 'failed'>('loading');
  useEffect(() => setState('loading'), [src]);
  return (
    <div className={`poster poster--${size} ${className}`}>
      {src && state !== 'failed' && (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          className={state === 'loaded' ? 'loaded' : undefined}
          onLoad={() => setState('loaded')}
          onError={() => setState('failed')}
        />
      )}
    </div>
  );
}

export function Brand() {
  return (
    <div className="brand">
      <div className="brand-mark" />
      <span className="brand-name">REELOG</span>
    </div>
  );
}

export function BackBar({ onBack, children }: { onBack: () => void; children?: ReactNode }) {
  return (
    <div className={children ? 'backbar backbar--search' : 'backbar'}>
      <button className="icon-btn" aria-label="Back" onClick={onBack}><Icon name="arrow_back" /></button>
      {children}
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

export type DialogSpec = { title: string; body: string; okLabel?: string; onOk?: () => void };

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

export function useToast() {
  const [state, setState] = useState({ text: '', on: false });
  const timer = useRef<number>();
  const show = useCallback((text: string) => {
    window.clearTimeout(timer.current);
    setState({ text, on: true });
    timer.current = window.setTimeout(() => setState((s) => ({ ...s, on: false })), 2400);
  }, []);
  return [state, show] as const;
}

export function Toast({ text, on, high }: { text: string; on: boolean; high: boolean }) {
  return (
    <div className={high ? 'toast toast--high' : 'toast'} data-on={on} role="status" aria-live="polite">
      <Icon name="check_circle" />
      {text}
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
