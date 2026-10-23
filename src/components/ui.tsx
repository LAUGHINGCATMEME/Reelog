import { useCallback, useEffect, useRef, useState } from 'react';
import type { Screen } from '../lib/types';

export const Icon = ({ name, size, className = '' }: { name: string; size?: number; className?: string }) => (
  <span className={`ms ${className}`} style={size ? { fontSize: size } : undefined} aria-hidden="true">
    {name}
  </span>
);

export function Poster({ src, size, label = true }: { src?: string; size: 'sm' | 'md' | 'lg' | 'grid'; label?: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return (
    <div className={`poster poster--${size}`}>
      {label && 'poster'}
      {src && !failed && <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />}
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

export type DialogSpec = {
  title: string;
  body: string;
  okLabel?: string;
  onOk?: () => void;
};

export function Dialog({ spec, onClose }: { spec: DialogSpec; onClose: () => void }) {
  const okRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    (okRef.current ?? cancelRef.current)?.focus();
  }, []);
  return (
    <div className="dlg-wrap" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="dlg-title" className="dlg">
        <div id="dlg-title" className="dlg-title">{spec.title}</div>
        <div className="dlg-body">{spec.body}</div>
        <div className="dlg-actions">
          <button ref={cancelRef} className="dlg-btn" onClick={onClose}>
            {spec.onOk ? 'Cancel' : 'OK'}
          </button>
          {spec.onOk && (
            <button ref={okRef} className="dlg-btn dlg-btn--ok" onClick={spec.onOk}>
              {spec.okLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

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

export function Toast({ text, on }: { text: string; on: boolean }) {
  return (
    <div className="toast" data-on={on} role="status" aria-live="polite">
      <Icon name="check_circle" />
      {text}
    </div>
  );
}

const NAV: [Screen, string, string][] = [
  ['library', 'Library', 'video_library'],
  ['search', 'Search', 'search'],
  ['data', 'Data', 'swap_vert'],
];

export function NavBar({ current, onGo }: { current: Screen; onGo: (s: Screen) => void }) {
  const active = current === 'detail' ? 'library' : current;
  return (
    <nav className="nav">
      {NAV.map(([key, label, icon]) => (
        <button key={key} className="nav-btn" aria-current={active === key ? 'page' : undefined} onClick={() => onGo(key)}>
          <span className="nav-pill"><Icon name={icon} /></span>
          <span className="nav-label">{label}</span>
        </button>
      ))}
    </nav>
  );
}
