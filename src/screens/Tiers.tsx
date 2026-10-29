import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BackBar, Chip, Icon, Menu, Overlay, Poster, Sheet, useBackLayer, type ToastAction } from '../components/ui';
import { fmtScore, plural } from '../lib/format';
import { mkey, type TitleInfo } from '../lib/library';
import { buzz, isNative, saveImage } from '../lib/native';
import { tierImage, tierImageSize } from '../lib/tierImage';
import {
  clearTiers, deleteTier, itemMeta, kindsLabel, listKeys, moveItem, newTierList, nextTier, placeOf, POOL, rankedCount,
  removeItem, shiftTier, TIER_COLORS, tierText, type Place,
} from '../lib/tiers';
import type { Data, Kind, TierList } from '../lib/types';

/** Library titles a list can rank, with the tab each is listed under (anime films can be under Movies). */
export type Candidate = { tab: Kind; x: TitleInfo };

const KIND_LABELS: [Kind, string][] = [['movie', 'Movies'], ['tv', 'TV'], ['anime', 'Anime']];

// ---- All tier lists ----

export function TierLists({ data, candidates, onBack, onOpen, onCreate }: {
  data: Data;
  candidates: (kinds: Kind[]) => Candidate[];
  onBack: () => void;
  onOpen: (id: string) => void;
  onCreate: (l: TierList) => void;
}) {
  const lists = data.tierLists ?? [];
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [kinds, setKinds] = useState<Kind[]>(['movie']);
  const [fill, setFill] = useState(true);
  const rated = open ? candidates(kinds).filter((c) => c.x.score != null).map((c) => c.x) : [];
  const ratedCount = new Set(rated.map((x) => mkey(x.kind, x.id))).size;
  const fromRatings = fill && ratedCount > 0;

  const start = () => {
    setName('');
    setFill(true);
    setOpen(true);
  };
  const create = () => {
    if (!kinds.length) return;
    setOpen(false);
    onCreate(newTierList(name.trim() || `${kindsLabel(kinds)} tier list`, kinds, fromRatings ? rated : undefined));
  };
  const toggleKind = (k: Kind) => setKinds((ks) => (ks.includes(k) ? ks.filter((x) => x !== k) : [...ks, k]));

  return (
    <div className="screen">
      <BackBar onBack={onBack} />
      <div className="page-head" style={{ paddingTop: 4 }}>
        <h1 className="h1">Tier lists</h1>
        <div className="stats" style={{ marginTop: 8 }}><span>Rank what you've watched, S to F</span></div>
      </div>
      <div className="pad-row">
        <button className="btn btn--primary btn--block" onClick={start}><Icon name="add" />New tier list</button>
      </div>

      {!lists.length && (
        <div className="empty">
          <Icon name="leaderboard" />
          <div className="empty-title">No tier lists yet</div>
          <div className="empty-body">Start one from your ratings, or from scratch, then drag titles between tiers.</div>
        </div>
      )}

      <div className="cards" style={{ paddingTop: 16 }}>
        {lists.map((l) => {
          const rows = l.tiers.filter((t) => t.items.length).slice(0, 3);
          return (
            <button key={l.id} className="tl-card" onClick={() => onOpen(l.id)}>
              <div className="tl-top">
                <span className="tl-name">{l.name}</span>
                <span className="tl-sub">{kindsLabel(l.kinds)} · {rankedCount(l)}/{plural(listKeys(l).length, 'title')} ranked</span>
              </div>
              {rows.length ? (
                <div className="tl-rows">
                  {rows.map((t) => (
                    <div key={t.id} className="tl-row">
                      <span className="tl-label" style={{ background: t.color }}>{t.label.length > 3 ? t.label.charAt(0).toUpperCase() : t.label}</span>
                      {t.items.slice(0, 7).map((k) => <Poster key={k} src={itemMeta(data, k).m.img} size="xs" />)}
                      {t.items.length > 7 && <span className="tl-more">+{t.items.length - 7}</span>}
                    </div>
                  ))}
                </div>
              ) : (
                <span className="tl-sub">Nothing ranked yet</span>
              )}
            </button>
          );
        })}
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} label="New tier list">
        <div className="sheet-head">
          <div className="row-body">
            <span className="kicker">NEW TIER LIST</span>
            <span className="sheet-title">{name.trim() || `${kindsLabel(kinds) || 'Your'} tier list`}</span>
          </div>
          <button className="icon-btn" aria-label="Close" onClick={() => setOpen(false)}><Icon name="close" /></button>
        </div>
        <div className="label">Name</div>
        <input
          className="input" value={name} maxLength={60} placeholder={`${kindsLabel(kinds) || 'Your'} tier list`} aria-label="Name"
          onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        <div className="label">What it ranks</div>
        <div className="seg seg--fill" style={{ marginTop: 8 }}>
          {KIND_LABELS.map(([k, label]) => <Chip key={k} className="chip--wide" on={kinds.includes(k)} onClick={() => toggleKind(k)}>{label}</Chip>)}
        </div>
        <div className="label">Start with</div>
        <div className="choices">
          <button className="choice" aria-pressed={fromRatings} disabled={!ratedCount} onClick={() => setFill(true)}>
            <Icon name={fromRatings ? 'radio_button_checked' : 'radio_button_unchecked'} />
            <span className="choice-text">
              <b>Your ratings</b>
              <span>{ratedCount ? `${plural(ratedCount, 'rated title')}, placed by score: 9 and up in S, 8 in A, and so on.` : 'Nothing of this kind is rated yet.'}</span>
            </span>
          </button>
          <button className="choice" aria-pressed={!fromRatings} onClick={() => setFill(false)}>
            <Icon name={!fromRatings ? 'radio_button_checked' : 'radio_button_unchecked'} />
            <span className="choice-text"><b>An empty list</b><span>Add titles, then place them yourself.</span></span>
          </button>
        </div>
        <div className="sheet-actions">
          <button className="btn btn--primary" disabled={!kinds.length} onClick={create}>Create</button>
        </div>
      </Sheet>
    </div>
  );
}

// ---- One tier list ----

type Press = { key: string; id: number; x: number; y: number; mouse: boolean; timer: number; el: HTMLElement };
type Drag = { key: string; ox: number; oy: number; w: number; h: number; x: number; y: number };

/** Copies text, falling back to the old way where the clipboard API isn't allowed. */
async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const t = document.createElement('textarea');
    t.value = text;
    t.style.position = 'fixed';
    t.style.opacity = '0';
    document.body.appendChild(t);
    t.select();
    const ok = document.execCommand('copy');
    t.remove();
    return ok;
  }
}

export function TierEdit({ data, list, quality, onQuality, onBack, onUpdate, onAdd, onOpen, onDelete, toast, notify, onSelecting }: {
  data: Data;
  list: TierList;
  /** Settings.shareQuality, set from the share sheet. */
  quality: number;
  onQuality: (q: number) => void;
  onBack: () => void;
  onUpdate: (f: (l: TierList) => TierList) => void;
  /** Opens the picker. */
  onAdd: () => void;
  onOpen: (kind: Kind, id: number) => void;
  onDelete: () => void;
  toast: (text: string, warn?: boolean, action?: ToastAction) => void;
  notify: (title: string, body: string) => void;
  /** Told while a poster is selected, so toasts can sit above the selection bar. */
  onSelecting: (on: boolean) => void;
}) {
  const [sel, setSel] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [rename, setRename] = useState({ open: false, name: '' });
  const [tierSheet, setTierSheet] = useState({ open: false, id: '' });
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [drop, setDrop] = useState<Place | null>(null);

  const boardRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const press = useRef<Press | null>(null);
  const drag = useRef<Drag | null>(null);
  const dropRef = useRef<Place | null>(null);
  const suppress = useRef(false);
  const raf = useRef(0);
  const live = useRef({ list, onUpdate });
  live.current = { list, onUpdate };

  useBackLayer(!!sel, () => setSel(null));
  const selecting = !!sel;
  useEffect(() => {
    onSelecting(selecting);
    return () => onSelecting(false);
  }, [selecting, onSelecting]);

  const total = listKeys(list).length;
  const rows = [...list.tiers.map((t) => ({ id: t.id, label: t.label, color: t.color as string | undefined, items: t.items })), { id: POOL, label: 'Unranked', color: undefined, items: list.pool }];
  const editing = list.tiers.find((t) => t.id === tierSheet.id);
  // Kept while the tier sheet slides away after its tier is deleted.
  const lastEditing = useRef(editing);
  if (editing) lastEditing.current = editing;
  const shownTier = editing ?? lastEditing.current;

  /** Moves `key` to `to`, unless that's where it already is. */
  const place = (key: string, to: Place) => {
    const now = placeOf(live.current.list, key);
    if (!(now && now.tier === to.tier && now.index === to.index)) live.current.onUpdate((l) => moveItem(l, key, to));
    setSel(null);
  };
  const end = (id: string) => ({ tier: id, index: Number.MAX_SAFE_INTEGER });

  // ---- Drag and drop: hold a poster (or press and move, with a mouse), then drop it anywhere ----

  const scroller = () => boardRef.current?.closest<HTMLElement>('.scroll') ?? null;

  const positionGhost = () => {
    const d = drag.current;
    const g = ghostRef.current;
    if (d && g) g.style.transform = `translate(${d.x - d.ox}px, ${d.y - d.oy}px) scale(1.08) rotate(-3deg)`;
  };

  /** The row under a point, or the nearest one when it's just outside them (a gap, or past the last). */
  const rowAt = (x: number, y: number) => {
    const board = boardRef.current;
    const hit = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-row]');
    if (!board || (hit && board.contains(hit))) return hit ?? null;
    let best: HTMLElement | null = null;
    let dist = 120;
    for (const r of board.querySelectorAll<HTMLElement>('[data-row]')) {
      const b = r.getBoundingClientRect();
      const dd = y < b.top ? b.top - y : y > b.bottom ? y - b.bottom : 0;
      if (dd < dist) {
        dist = dd;
        best = r;
      }
    }
    return best;
  };

  const updateDrop = () => {
    const d = drag.current;
    if (!d) return;
    const row = rowAt(d.x, d.y);
    let next: Place | null = null;
    if (row) {
      const items = [...row.querySelectorAll<HTMLElement>('[data-item]')].filter((n) => n.dataset.item !== d.key);
      let index = items.length;
      for (let i = 0; i < items.length; i++) {
        const r = items[i].getBoundingClientRect();
        // Before the first item on a later line, or left of the middle of one on this line.
        if (d.y < r.top || (d.y <= r.bottom && d.x < r.left + r.width / 2)) {
          index = i;
          break;
        }
      }
      next = { tier: row.dataset.row!, index };
    }
    const prev = dropRef.current;
    if (prev?.tier !== next?.tier || prev?.index !== next?.index) {
      dropRef.current = next;
      setDrop(next);
    }
  };

  // Scrolls the page while a drag is held near its top or bottom edge.
  const autoScroll = () => {
    const d = drag.current;
    const s = scroller();
    if (!d || !s) return;
    const r = s.getBoundingClientRect();
    const edge = 80;
    const v = d.y < r.top + edge ? -(r.top + edge - d.y) / edge : d.y > r.bottom - edge ? (d.y - (r.bottom - edge)) / edge : 0;
    if (v) {
      s.scrollTop += Math.round(Math.max(-1, Math.min(1, v)) * 16);
      updateDrop();
    }
    raf.current = requestAnimationFrame(autoScroll);
  };

  const startDrag = (x: number, y: number) => {
    const p = press.current;
    if (!p || drag.current) return;
    const r = p.el.getBoundingClientRect();
    drag.current = { key: p.key, ox: p.x - r.left, oy: p.y - r.top, w: r.width, h: r.height, x, y };
    suppress.current = true;
    setSel(null);
    setDragKey(p.key);
    buzz();
    updateDrop();
    raf.current = requestAnimationFrame(autoScroll);
  };

  useLayoutEffect(positionGhost, [dragKey]);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const p = press.current;
      if (!p || e.pointerId !== p.id) return;
      const d = drag.current;
      if (!d) {
        const dist = Math.hypot(e.clientX - p.x, e.clientY - p.y);
        if (p.mouse) {
          if (dist > 5) startDrag(e.clientX, e.clientY);
        } else if (dist > 10) {
          // Moved before the hold finished: it's a scroll.
          window.clearTimeout(p.timer);
          press.current = null;
        }
        return;
      }
      d.x = e.clientX;
      d.y = e.clientY;
      positionGhost();
      updateDrop();
    };
    const finish = (e: PointerEvent, commit: boolean) => {
      const p = press.current;
      if (!p || e.pointerId !== p.id) return;
      window.clearTimeout(p.timer);
      press.current = null;
      const d = drag.current;
      if (!d) return;
      drag.current = null;
      cancelAnimationFrame(raf.current);
      const to = dropRef.current;
      dropRef.current = null;
      setDragKey(null);
      setDrop(null);
      if (commit && to) place(d.key, to);
      // Swallow the click that can follow the drop.
      window.setTimeout(() => (suppress.current = false), 350);
    };
    const up = (e: PointerEvent) => finish(e, true);
    const cancel = (e: PointerEvent) => finish(e, false);
    // Once a drag has started, the finger moves the poster, not the page.
    const touchMove = (e: TouchEvent) => drag.current && e.cancelable && e.preventDefault();
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', cancel);
    addEventListener('touchmove', touchMove, { passive: false });
    return () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', cancel);
      removeEventListener('touchmove', touchMove);
      cancelAnimationFrame(raf.current);
      if (press.current) window.clearTimeout(press.current.timer);
    };
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLElement>, key: string) => {
    if (e.button !== 0 || drag.current) return;
    const p: Press = { key, id: e.pointerId, x: e.clientX, y: e.clientY, mouse: e.pointerType === 'mouse', timer: 0, el: e.currentTarget };
    if (!p.mouse) p.timer = window.setTimeout(() => startDrag(p.x, p.y), 320);
    press.current = p;
  };

  // ---- Tap to place: tap a poster, then a tier or another poster ----

  const tapItem = (k: string) => {
    if (suppress.current) return;
    if (!sel) return setSel(k);
    if (sel === k) return setSel(null);
    place(sel, placeOf(removeItem(list, sel), k)!);
  };
  const tapRow = (id: string) => sel && place(sel, end(id));

  // ---- List actions ----

  const withUndo = (text: string, f: (l: TierList) => TierList) => {
    const before = list;
    onUpdate(f);
    toast(text, false, { label: 'Undo', onClick: () => onUpdate(() => before) });
  };

  const openShare = () => (rankedCount(list) ? setSharing(true) : notify('Nothing ranked yet', 'Place some titles in tiers first.'));
  const size = tierImageSize(list, quality);
  const shareImage = async () => {
    setBusy(true);
    try {
      const url = await tierImage(data, list, quality);
      const ext = url.startsWith('data:image/png') ? 'png' : 'jpg';
      const file = `reelog-${list.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tier-list'}.${ext}`;
      setSharing(false);
      if ((await saveImage(file, url)) && !isNative) toast(`Saved ${file}`);
    } catch {
      notify("Couldn't make the image", quality > 6 ? 'It may be too big for this phone: try a lower quality.' : 'Try again in a moment.');
    }
    setBusy(false);
  };

  const copyText = async () => {
    setMenu(false);
    toast((await copy(tierText(data, list))) ? 'Copied as text' : "Couldn't copy", false);
  };

  const sel0 = sel ? itemMeta(data, sel) : null;

  return (
    <div className="screen screen--tiers">
      <BackBar
        onBack={onBack}
        actions={
          <>
            <button className="icon-btn" aria-label="Share as image" disabled={busy} onClick={openShare}>
              <Icon name={busy ? 'hourglass_empty' : 'share'} />
            </button>
            <div className="menu-anchor">
              <button className="icon-btn" aria-label="More" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>
                <Icon name="more_vert" />
              </button>
              <Menu open={menu} onClose={() => setMenu(false)}>
                <button className="menu-item" role="menuitem" onClick={() => { setMenu(false); setRename({ open: true, name: list.name }); }}>Rename<Icon name="edit" /></button>
                <button className="menu-item" role="menuitem" onClick={() => { setMenu(false); onAdd(); }}>Add titles<Icon name="playlist_add" /></button>
                <button className="menu-item" role="menuitem" onClick={copyText}>Copy as text<Icon name="content_copy" /></button>
                <button
                  className="menu-item" role="menuitem" disabled={!rankedCount(list)}
                  onClick={() => { setMenu(false); withUndo('Moved everything to Unranked', clearTiers); }}
                >
                  Unrank all<Icon name="restart_alt" />
                </button>
                <button className="menu-item menu-item--danger" role="menuitem" onClick={() => { setMenu(false); onDelete(); }}>Delete list<Icon name="delete" /></button>
              </Menu>
            </div>
          </>
        }
      />
      <div className="page-head" style={{ paddingTop: 4 }}>
        <h1 className="h1 h1--list">{list.name}</h1>
        <div className="stats" style={{ marginTop: 8 }}>
          <span>{kindsLabel(list.kinds)} · <b>{rankedCount(list)}</b>/{plural(total, 'title')} ranked</span>
        </div>
      </div>

      <div className="tier-board" ref={boardRef}>
        {rows.map((r) => {
          const others = dragKey ? r.items.filter((k) => k !== dragKey) : r.items;
          const over = drop?.tier === r.id;
          const markOf = (k: string) => {
            if (!over || !drop || k === dragKey) return undefined;
            const i = others.indexOf(k);
            return i === drop.index ? 'before' : drop.index >= others.length && i === others.length - 1 ? 'after' : undefined;
          };
          return (
            <div key={r.id} className={r.id === POOL ? 'tier tier--pool' : 'tier'} data-row={r.id} data-over={over} onClick={() => tapRow(r.id)}>
              <button
                className={'tier-label' + (r.label.length > 3 ? ' tier-label--long' : '')}
                style={r.color ? { background: r.color } : undefined}
                aria-label={r.id === POOL ? 'Unranked' : `Tier ${r.label || 'without a name'}${sel ? '' : ', edit'}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (sel) tapRow(r.id);
                  else if (r.id !== POOL) setTierSheet({ open: true, id: r.id });
                }}
              >
                {r.label}
              </button>
              <div className="tier-items">
                {r.items.map((k) => {
                  const { m } = itemMeta(data, k);
                  return (
                    <button
                      key={k}
                      className="tier-item"
                      data-item={k}
                      data-sel={sel === k}
                      data-dragging={dragKey === k}
                      data-mark={markOf(k)}
                      aria-label={m.title}
                      aria-pressed={sel === k}
                      onPointerDown={(e) => onPointerDown(e, k)}
                      onClick={(e) => { e.stopPropagation(); tapItem(k); }}
                      onContextMenu={(e) => e.preventDefault()}
                    >
                      <Poster src={m.img} size="tier" />
                      {!m.img && <span className="tier-noimg">{m.title}</span>}
                    </button>
                  );
                })}
                {!r.items.length && r.id === POOL && <span className="tier-empty">{total ? 'All ranked' : 'Add titles to rank them'}</span>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="pad-row tier-actions">
        <button className="btn btn--secondary btn--sm" onClick={onAdd}><Icon name="playlist_add" />Add titles</button>
        <button className="btn btn--secondary btn--sm" onClick={() => onUpdate((l) => ({ ...l, tiers: [...l.tiers, nextTier(l)] }))}><Icon name="add" />Add tier</button>
      </div>
      <div className="time-note tier-hint">Tap a poster, then tap where it goes. Or hold it and drag. Tap a tier's letter to rename or recolour it.</div>

      {dragKey && (
        <Overlay>
          <div ref={ghostRef} className="tier-ghost" style={{ width: drag.current?.w, height: drag.current?.h }}>
            <Poster src={itemMeta(data, dragKey).m.img} size="tier" />
          </div>
        </Overlay>
      )}

      {sel && sel0 && (
        <Overlay>
          <div className="selbar" role="status">
            <div className="selbar-text">
              <b>{sel0.m.title}</b>
              <span>Tap a tier or a poster to move it there</span>
            </div>
            <button className="icon-btn" aria-label={`Open ${sel0.m.title}`} onClick={() => { setSel(null); onOpen(sel0.kind, sel0.id); }}><Icon name="open_in_new" /></button>
            <button className="icon-btn" aria-label="Remove from this list" onClick={() => { setSel(null); withUndo(`Removed ${sel0.m.title}`, (l) => removeItem(l, sel)); }}><Icon name="delete" /></button>
            <button className="icon-btn" aria-label="Cancel" onClick={() => setSel(null)}><Icon name="close" /></button>
          </div>
        </Overlay>
      )}

      <Sheet open={sharing} onClose={() => !busy && setSharing(false)} label="Share as image">
        <div className="sheet-head">
          <div className="row-body">
            <span className="kicker">SHARE AS IMAGE</span>
            <span className="sheet-title">{list.name}</span>
            <span className="row-sub">{rankedCount(list)} ranked</span>
          </div>
          <button className="icon-btn" aria-label="Close" disabled={busy} onClick={() => setSharing(false)}><Icon name="close" /></button>
        </div>
        <div className="label-row">
          <span className="label">Quality</span>
          <span className="quality-n">{quality === 10 ? 'Best' : `${quality}/10`}</span>
        </div>
        <div className="slider">
          <input
            type="range" min={1} max={10} step={1} value={quality} aria-label="Image quality" disabled={busy}
            onChange={(e) => onQuality(parseInt(e.target.value, 10))}
          />
          <div className="ticks"><span>Smaller file</span><span>Sharpest</span></div>
        </div>
        <div className="small-hint">
          {size.width} × {size.height} px · {size.png ? 'PNG, lossless, at the posters’ full resolution' : `JPEG at ${Math.round(size.jpeg * 100)}%`}
        </div>
        <div className="sheet-actions">
          <button className="btn btn--primary" disabled={busy} onClick={shareImage}>
            <Icon name={busy ? 'hourglass_empty' : 'share'} />{busy ? 'Making the image…' : isNative ? 'Share' : 'Save image'}
          </button>
        </div>
      </Sheet>

      <Sheet open={rename.open} onClose={() => setRename((r) => ({ ...r, open: false }))} label="Rename tier list">
        <div className="sheet-head">
          <div className="row-body"><span className="kicker">RENAME</span><span className="sheet-title">{rename.name.trim() || list.name}</span></div>
          <button className="icon-btn" aria-label="Close" onClick={() => setRename((r) => ({ ...r, open: false }))}><Icon name="close" /></button>
        </div>
        <div className="label">Name</div>
        <input
          className="input" value={rename.name} maxLength={60} aria-label="Name"
          onChange={(e) => setRename({ open: true, name: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        <div className="sheet-actions">
          <button
            className="btn btn--primary" disabled={!rename.name.trim()}
            onClick={() => { onUpdate((l) => ({ ...l, name: rename.name.trim() })); setRename((r) => ({ ...r, open: false })); }}
          >
            Save
          </button>
        </div>
      </Sheet>

      <Sheet open={tierSheet.open} onClose={() => setTierSheet((t) => ({ ...t, open: false }))} label="Edit tier">
        {shownTier && (() => {
          const i = list.tiers.findIndex((t) => t.id === shownTier.id);
          const set = (p: { label?: string; color?: string }) => onUpdate((l) => ({ ...l, tiers: l.tiers.map((t) => (t.id === shownTier.id ? { ...t, ...p } : t)) }));
          const close = () => setTierSheet((t) => ({ ...t, open: false }));
          return (
            <>
              <div className="sheet-head">
                <span className={'tier-chip' + (shownTier.label.length > 2 ? ' tier-chip--long' : '')} style={{ background: shownTier.color }}>{shownTier.label}</span>
                <div className="row-body">
                  <span className="kicker">EDIT TIER</span>
                  <span className="row-sub">{plural(shownTier.items.length, 'title')}</span>
                </div>
                <button className="icon-btn" aria-label="Close" onClick={close}><Icon name="close" /></button>
              </div>
              <div className="label">Name</div>
              <input
                className="input" value={shownTier.label} maxLength={16} aria-label="Tier name"
                onChange={(e) => set({ label: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              />
              <div className="label">Colour</div>
              <div className="swatches">
                {TIER_COLORS.map((c) => (
                  <button key={c} className="swatch" style={{ background: c }} aria-label={`Colour ${c}`} aria-pressed={shownTier.color === c} onClick={() => set({ color: c })} />
                ))}
              </div>
              <div className="label">Order</div>
              <div className="seg" style={{ marginTop: 8 }}>
                <button className="pill-btn" disabled={i <= 0} onClick={() => onUpdate((l) => shiftTier(l, shownTier.id, -1))}><Icon name="arrow_upward" />Up</button>
                <button className="pill-btn" disabled={i < 0 || i >= list.tiers.length - 1} onClick={() => onUpdate((l) => shiftTier(l, shownTier.id, 1))}><Icon name="arrow_downward" />Down</button>
              </div>
              <div className="sheet-actions">
                <button
                  className="btn btn--secondary" disabled={i < 0}
                  onClick={() => { close(); withUndo(`Deleted tier ${shownTier.label}`.trim(), (l) => deleteTier(l, shownTier.id)); }}
                >
                  <Icon name="delete" />Delete
                </button>
                <button className="btn btn--primary" onClick={close}>Done</button>
              </div>
            </>
          );
        })()}
      </Sheet>
    </div>
  );
}

// ---- Adding titles ----

export function TierPicker({ list, titles, onBack, onAdd }: {
  list: TierList;
  titles: Candidate[];
  onBack: () => void;
  onAdd: (keys: string[]) => void;
}) {
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<Kind | 'all'>('all');
  const [picked, setPicked] = useState<string[]>([]);
  const have = new Set(listKeys(list));
  const seen = new Set<string>();
  const all = titles
    .map((c) => ({ ...c, key: mkey(c.x.kind, c.x.id) }))
    .filter((c) => !have.has(c.key) && !seen.has(c.key) && !!seen.add(c.key))
    // Rated first, best first: what a tier list is usually about.
    .sort((a, b) => (b.x.score ?? -1) - (a.x.score ?? -1) || a.x.m.title.localeCompare(b.x.m.title));
  const ql = q.trim().toLowerCase();
  const shown = all.filter((c) => (tab === 'all' || c.tab === tab) && (!ql || c.x.m.title.toLowerCase().includes(ql)));
  const pickedSet = new Set(picked);
  const allShownPicked = shown.length > 0 && shown.every((c) => pickedSet.has(c.key));
  const toggle = (k: string) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  const toggleAll = () =>
    setPicked((p) => (allShownPicked ? p.filter((k) => !shown.some((c) => c.key === k)) : [...p, ...shown.map((c) => c.key).filter((k) => !p.includes(k))]));

  return (
    <div className="screen screen--pick">
      <BackBar onBack={onBack}>
        <div className="search-field">
          <input type="search" enterKeyHint="search" autoComplete="off" value={q} placeholder="Search your library" aria-label="Search your library" onChange={(e) => setQ(e.target.value)} />
          {q && <button className="icon-btn" aria-label="Clear" onClick={() => setQ('')}><Icon name="close" /></button>}
        </div>
      </BackBar>
      {list.kinds.length > 1 && (
        <div className="chips" role="toolbar" aria-label="Kind">
          <Chip on={tab === 'all'} onClick={() => setTab('all')}>All</Chip>
          {KIND_LABELS.filter(([k]) => list.kinds.includes(k)).map(([k, label]) => <Chip key={k} on={tab === k} onClick={() => setTab(k)}>{label}</Chip>)}
        </div>
      )}
      <div className="source-row">
        <span>ADD TO {list.name.toUpperCase()}</span>
        {!!shown.length && <button className="text-btn text-btn--inline" onClick={toggleAll}>{allShownPicked ? 'Select none' : 'Select all'}</button>}
      </div>
      {!shown.length && (
        <div className="hint" style={{ padding: 32 }}>
          {all.length
            ? ql ? `No matches for “${q.trim()}”.` : 'Nothing of this kind left to add.'
            : titles.length
              ? `Everything in your ${kindsLabel(list.kinds).toLowerCase()} library is already in this list.`
              : `Nothing in your ${kindsLabel(list.kinds).toLowerCase()} library yet. Log something first.`}
        </div>
      )}
      <div className="list list--flush">
        {shown.map((c) => {
          const on = pickedSet.has(c.key);
          return (
            <button key={c.key} className="row-btn row-btn--compact" aria-pressed={on} onClick={() => toggle(c.key)}>
              <Icon name={on ? 'check_box' : 'check_box_outline_blank'} className={on ? 'pick-on' : 'muted'} />
              <Poster src={c.x.m.img} size="sm" />
              <div className="row-body">
                <div className="row-title row-title--sm ellipsis">{c.x.m.title}</div>
                <div className="row-sub ellipsis">{c.x.sub}</div>
              </div>
              <div className={'row-score row-score--sm' + (c.x.score == null ? ' disabled' : '')}>{fmtScore(c.x.score)}</div>
            </button>
          );
        })}
      </div>
      <div className="pick-bar">
        <button className="btn btn--primary btn--block" disabled={!picked.length} onClick={() => onAdd(picked)}>
          <Icon name="playlist_add" />{picked.length ? `Add ${plural(picked.length, 'title')}` : 'Pick titles to add'}
        </button>
      </div>
    </div>
  );
}
