import {
  useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, X } from 'lucide-react';
import clsx from 'clsx';
import { create } from 'zustand';
import { dismissToast, useStore } from '../store';

/* ---------- Hooks ---------- */

export function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}

export const useIsMobile = () => useMediaQuery('(max-width: 860px)');

export function isTyping(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

/** Global keyboard shortcut; ignored while typing unless `inInputs`. */
export function useHotkey(test: (e: KeyboardEvent) => boolean, run: (e: KeyboardEvent) => void, inInputs = false) {
  const ref = useRef({ test, run });
  ref.current = { test, run };
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (!inInputs && isTyping(e)) return;
      if (ref.current.test(e)) ref.current.run(e);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [inInputs]);
}

/* ---------- Checkbox ---------- */

export function Checkbox({
  checked, onChange, priority = 0, size = 20, label,
}: { checked: boolean; onChange: () => void; priority?: number; size?: number; label?: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label ?? (checked ? 'إلغاء الإنجاز' : 'إنجاز')}
      className={clsx('check', checked && 'on', `p${priority}`)}
      style={{ width: size, height: size }}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
    >
      <Check strokeWidth={3.2} />
    </button>
  );
}

/* ---------- Auto-growing textarea ---------- */

export function AutoTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fit = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);
  useLayoutEffect(fit, [props.value, fit]);
  return <textarea ref={ref} rows={1} {...props} onInput={fit} />;
}

/* ---------- Modal (centered on desktop, bottom sheet on phones) ---------- */

export function Modal({
  open, onClose, title, children, footer, width = 480, className,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const on = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={clsx('modal', className)} style={{ maxWidth: width }} role="dialog" aria-modal="true">
        {title !== undefined && (
          <div className="modal-head">
            <h2 className="h2">{title}</h2>
            <button className="icon-btn" onClick={onClose} aria-label="إغلاق"><X /></button>
          </div>
        )}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/* ---------- Popover anchored to an element ---------- */

export function Popover({
  anchor, onClose, children, width = 240, className,
}: { anchor: HTMLElement | null; onClose: () => void; children: ReactNode; width?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!anchor || !ref.current) return;
    const a = anchor.getBoundingClientRect();
    const h = ref.current.offsetHeight;
    const w = Math.min(width, window.innerWidth - 16);
    // RTL: align the popover's right edge with the anchor's right edge.
    let left = a.right - w;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    let top = a.bottom + 6;
    if (top + h > window.innerHeight - 8) top = Math.max(8, a.top - h - 6);
    setPos({ top, left });
  }, [anchor, width]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node) && !anchor?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const onScroll = (e: Event) => !ref.current?.contains(e.target as Node) && onClose();
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onClose);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onClose);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [anchor, onClose]);

  if (!anchor) return null;
  return createPortal(
    <div
      ref={ref}
      className={clsx('popover', className)}
      style={{ width: Math.min(width, window.innerWidth - 16), top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
    >
      {children}
    </div>,
    document.body,
  );
}

/** Small helper: a button that toggles a popover. */
export function usePopover() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const close = useCallback(() => setAnchor(null), []);
  const toggle = useCallback((e: { currentTarget: HTMLElement; stopPropagation?: () => void }) => {
    e.stopPropagation?.();
    const target = e.currentTarget;
    setAnchor((a) => (a ? null : target));
  }, []);
  return { anchor, open: !!anchor, toggle, close };
}

export function MenuItem({
  icon, label, onClick, danger, hint, active,
}: { icon?: ReactNode; label: ReactNode; onClick: () => void; danger?: boolean; hint?: ReactNode; active?: boolean }) {
  return (
    <button type="button" className={clsx('menu-item', danger && 'danger', active && 'active')} onClick={onClick}>
      {icon}
      <span>{label}</span>
      {hint && <span className="hint">{hint}</span>}
      {active && <Check className="tick" />}
    </button>
  );
}

/* ---------- Confirm dialog (imperative) ---------- */

interface ConfirmState {
  req: { title: string; message?: string; confirmLabel?: string; resolve: (ok: boolean) => void } | null;
}
const useConfirm = create<ConfirmState>(() => ({ req: null }));

export function confirmDialog(opts: { title: string; message?: string; confirmLabel?: string }): Promise<boolean> {
  return new Promise((resolve) => useConfirm.setState({ req: { ...opts, resolve } }));
}

export function ConfirmHost() {
  const req = useConfirm((s) => s.req);
  const done = (ok: boolean) => {
    req?.resolve(ok);
    useConfirm.setState({ req: null });
  };
  return (
    <Modal open={!!req} onClose={() => done(false)} width={400} title={req?.title}>
      {req?.message && <p className="muted" style={{ marginBottom: 20 }}>{req.message}</p>}
      <div className="row-end">
        <button className="btn btn-ghost" onClick={() => done(false)}>إلغاء</button>
        <button className="btn btn-danger" autoFocus onClick={() => done(true)}>{req?.confirmLabel ?? 'حذف'}</button>
      </div>
    </Modal>
  );
}

/* ---------- Toasts ---------- */

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return createPortal(
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          <span>{t.message}</span>
          {t.action && (
            <button
              onClick={() => {
                t.action!.run();
                dismissToast(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>,
    document.body,
  );
}

/* ---------- Empty state ---------- */

export function EmptyState({
  icon, title, body, action, color,
}: { icon: ReactNode; title: string; body?: string; action?: ReactNode; color?: string }) {
  return (
    <div className="empty">
      <div className="empty-icon" style={color ? ({ '--c': color } as React.CSSProperties) : undefined}>{icon}</div>
      <h3 className="h2">{title}</h3>
      {body && <p className="muted">{body}</p>}
      {action}
    </div>
  );
}
