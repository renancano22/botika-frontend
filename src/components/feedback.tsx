import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { describeError, onSlowConnection, type ErrorInfo } from '../api';

/*
 * Feedback used across BulanBotikaCare:
 *  - toast.success / error / warning / info: short messages in the corner (simple feedback)
 *  - confirmAction / alertDialog: modal dialogs for important decisions and errors that need action
 *  - ConnectionStatus: offline / slow connection notice
 *  - LoadError: a page or section that could not be loaded, with "Try again"
 *  - FieldError + useFormErrors: validation messages next to the form fields
 */

export type FeedbackType = 'success' | 'error' | 'warning' | 'info';

const ICON: Record<FeedbackType | 'danger' | 'primary' | 'offline' | 'slow', string> = {
  success: 'M20 6 9 17l-5-5',
  error: 'M12 8v5M12 16.5v.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  danger: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6',
  warning: 'M12 9v4M12 17v.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  info: 'M12 16v-5M12 8v.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  primary: 'M12 16v-5M12 8v.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  offline: 'M2 2l20 20M8.5 16.4a5 5 0 0 1 7 0M2 8.8a15 15 0 0 1 4.2-2.7M10.7 5.1A15 15 0 0 1 22 8.8M5 12.9a10 10 0 0 1 5.2-2.8M19 12.9a10 10 0 0 0-1.9-1.4M12 20h.01',
  slow: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
};

function FbIcon({ d, size = 20 }: { d: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

/* ================================================================ toasts */

interface ToastAction { label: string; onClick: () => void }
export interface ToastOptions {
  description?: string;
  action?: ToastAction;
  /** Milliseconds before it disappears (0 = stays until closed). */
  duration?: number;
}
interface ToastItem extends ToastOptions { id: number; key: string; type: FeedbackType; title: string; stamp: number }

const DURATION: Record<FeedbackType, number> = { success: 4000, info: 5000, warning: 6500, error: 7000 };
let toasts: ToastItem[] = [];
let nextId = 1;
const toastListeners = new Set<() => void>();
const emitToasts = () => toastListeners.forEach((l) => l());

function pushToast(type: FeedbackType, title: string, opts: ToastOptions = {}): number {
  const key = `${type}|${title}|${opts.description ?? ''}`;
  const same = toasts.find((t) => t.key === key);
  if (same) {
    // The same message is already on screen: show it longer instead of stacking a duplicate.
    toasts = toasts.map((t) => (t === same ? { ...t, ...opts, stamp: Date.now() } : t));
    emitToasts();
    return same.id;
  }
  const item: ToastItem = { ...opts, id: nextId++, key, type, title, stamp: Date.now() };
  toasts = [...toasts, item].slice(-4);
  emitToasts();
  return item.id;
}

function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emitToasts();
}

export const toast = {
  success: (title: string, opts?: ToastOptions) => pushToast('success', title, opts),
  error: (title: string, opts?: ToastOptions) => pushToast('error', title, opts),
  warning: (title: string, opts?: ToastOptions) => pushToast('warning', title, opts),
  info: (title: string, opts?: ToastOptions) => pushToast('info', title, opts),
  dismiss: dismissToast,
  /** Removes every toast (used when logging out, so in-app messages don't follow to the login page). */
  clear: () => { toasts = []; emitToasts(); },
  /** Error toast built from a failed request; adds "Try again" when retrying can help. */
  fromError: (err: unknown, opts: { title?: string; retry?: () => void } = {}) => {
    const info = describeError(err);
    return pushToast('error', opts.title ?? info.title, {
      description: info.message,
      action: opts.retry && info.retryable ? { label: 'Try again', onClick: opts.retry } : undefined,
    });
  },
};

function ToastView({ t }: { t: ToastItem }) {
  const [paused, setPaused] = useState(false);
  const duration = t.duration ?? (t.action ? 10000 : DURATION[t.type]);
  useEffect(() => {
    if (paused || !duration) return;
    const id = window.setTimeout(() => dismissToast(t.id), duration);
    return () => window.clearTimeout(id);
  }, [t.id, t.stamp, paused, duration]);

  return (
    <div className={`toast toast-${t.type} ${paused ? 'is-paused' : ''}`} role={t.type === 'error' ? 'alert' : 'status'}
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <span className="toast-icon"><FbIcon d={ICON[t.type]} /></span>
      <div className="toast-body">
        <strong>{t.title}</strong>
        {t.description && <p>{t.description}</p>}
        {t.action && (
          <button type="button" className="toast-action" onClick={() => { dismissToast(t.id); t.action?.onClick(); }}>
            {t.action.label}
          </button>
        )}
      </div>
      <button type="button" className="toast-close" onClick={() => dismissToast(t.id)} aria-label="Dismiss notification">
        <FbIcon d="M6 6l12 12M18 6 6 18" size={16} />
      </button>
      {duration > 0 && <span key={`${t.stamp}-${paused}`} className="toast-progress" style={{ '--dur': `${duration}ms` } as CSSProperties} aria-hidden="true" />}
    </div>
  );
}

/* ================================================================ connection status */

/** Event fired when the internet connection comes back (pages reload their data). */
export const RECONNECTED = 'botika:reconnected';

function ConnectionStatus() {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [slow, setSlow] = useState(false);
  useEffect(() => onSlowConnection(setSlow), []);
  useEffect(() => {
    const goOffline = () => setOnline(false);
    const goOnline = () => {
      setOnline(true);
      toast.success('Back online', { description: 'Your internet connection has been restored.' });
      window.dispatchEvent(new Event(RECONNECTED));
    };
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  if (!online) {
    return (
      <div className="conn-banner conn-offline" role="alert">
        <span className="toast-icon"><FbIcon d={ICON.offline} /></span>
        <div className="toast-body">
          <strong>You are offline</strong>
          <p>Check your Wi-Fi or mobile data. Changes cannot be saved until you are back online.</p>
        </div>
      </div>
    );
  }
  if (slow) {
    return (
      <div className="conn-banner conn-slow" role="status">
        <span className="toast-icon"><FbIcon d={ICON.slow} /></span>
        <div className="toast-body">
          <strong>Slow connection</strong>
          <p>This is taking longer than usual. Please wait and do not close the page.</p>
        </div>
      </div>
    );
  }
  return null;
}

/** Corner area for toasts and the connection notice. Rendered once for the whole app. */
export function Toaster() {
  const items = useSyncExternalStore(
    (cb) => { toastListeners.add(cb); return () => { toastListeners.delete(cb); }; },
    () => toasts,
  );
  return (
    <div className="toaster" aria-live="polite">
      <ConnectionStatus />
      {items.map((t) => <ToastView key={t.id} t={t} />)}
    </div>
  );
}

/* ================================================================ dialogs */

export type DialogTone = 'danger' | 'warning' | 'primary' | 'success' | 'error' | 'info';

export interface DialogOptions {
  title: string;
  message: ReactNode;
  /** Extra detail under the message (e.g. what will happen). */
  details?: ReactNode;
  tone?: DialogTone;
  confirmLabel?: string;
  /** null = no Cancel button (an alert with one button). */
  cancelLabel?: string | null;
  busyLabel?: string;
  /**
   * Runs when the user confirms. While it runs the buttons are disabled (no double submit).
   * If it fails, the dialog stays open and shows why, with "Try again".
   */
  onConfirm?: () => unknown | Promise<unknown>;
}
interface OpenDialog extends DialogOptions { id: number; resolve: (ok: boolean) => void }

let dialog: OpenDialog | null = null;
const dialogListeners = new Set<() => void>();
const emitDialog = () => dialogListeners.forEach((l) => l());

/** Shows a confirmation dialog. Resolves true when confirmed (and onConfirm succeeded), false when cancelled. */
export function confirmAction(opts: DialogOptions): Promise<boolean> {
  return new Promise((resolve) => {
    dialog?.resolve(false);
    dialog = { ...opts, id: nextId++, resolve };
    emitDialog();
  });
}

/** A dialog with a single button, for important errors or information the user must read. */
export function alertDialog(opts: Omit<DialogOptions, 'cancelLabel'> & { buttonLabel?: string }): Promise<boolean> {
  return confirmAction({ ...opts, confirmLabel: opts.buttonLabel ?? opts.confirmLabel ?? 'OK', cancelLabel: null });
}

function closeDialog(ok: boolean) {
  dialog?.resolve(ok);
  dialog = null;
  emitDialog();
}

function DialogView({ d }: { d: OpenDialog }) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ErrorInfo | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const tone = d.tone ?? 'primary';
  const iconKey = tone === 'danger' ? 'danger' : tone === 'warning' ? 'warning' : tone === 'success' ? 'success' : tone === 'error' ? 'error' : 'info';

  const confirm = useCallback(async () => {
    if (busy) return;
    if (!d.onConfirm) { closeDialog(true); return; }
    setBusy(true);
    setFailure(null);
    try {
      await d.onConfirm();
      closeDialog(true);
    } catch (err) {
      setFailure(describeError(err));
      setBusy(false);
    }
  }, [busy, d]);

  // Focus the dialog, keep Tab inside it, Escape cancels, and give focus back afterwards.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const box = boxRef.current;
    const first = box?.querySelector<HTMLElement>(tone === 'danger' && d.cancelLabel !== null ? '.dlg-cancel' : '.dlg-confirm');
    first?.focus();
    return () => { before?.focus?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) { e.preventDefault(); closeDialog(false); }
      if (e.key === 'Tab' && boxRef.current) {
        const els = [...boxRef.current.querySelectorAll<HTMLElement>('button:not(:disabled)')];
        if (!els.length) return;
        const i = els.indexOf(document.activeElement as HTMLElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); els[els.length - 1].focus(); }
        else if (!e.shiftKey && i === els.length - 1) { e.preventDefault(); els[0].focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy]);

  const confirmClass = tone === 'danger' || tone === 'error' ? 'btn btn-danger' : tone === 'warning' ? 'btn btn-warning' : 'btn';
  return (
    <div className="modal-backdrop dlg-backdrop" onMouseDown={() => !busy && d.cancelLabel !== null && closeDialog(false)}>
      <div ref={boxRef} className={`modal dlg dlg-${tone}`} role="alertdialog" aria-modal="true"
        aria-labelledby={`dlg-title-${d.id}`} aria-describedby={`dlg-msg-${d.id}`} onMouseDown={(e) => e.stopPropagation()}>
        <span className="dlg-icon"><FbIcon d={ICON[iconKey]} size={28} /></span>
        <h2 id={`dlg-title-${d.id}`}>{d.title}</h2>
        <div id={`dlg-msg-${d.id}`} className="dlg-message">{d.message}</div>
        {d.details && <div className="dlg-details">{d.details}</div>}
        {failure && (
          <div className="dlg-error" role="alert">
            <strong>{failure.title}</strong>
            <span>{failure.message}</span>
          </div>
        )}
        <div className="dlg-actions">
          {d.cancelLabel !== null && (
            <button type="button" className="btn btn-outline dlg-cancel" onClick={() => closeDialog(false)} disabled={busy}>
              {d.cancelLabel ?? 'Cancel'}
            </button>
          )}
          <button type="button" className={`${confirmClass} dlg-confirm`} onClick={confirm} disabled={busy} aria-busy={busy}>
            {busy && <span className="spinner" aria-hidden="true" />}
            {busy ? (d.busyLabel ?? 'Please wait…') : failure?.retryable ? 'Try again' : (d.confirmLabel ?? 'Confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Renders the open dialog. Rendered once for the whole app. */
export function DialogHost() {
  const d = useSyncExternalStore(
    (cb) => { dialogListeners.add(cb); return () => { dialogListeners.delete(cb); }; },
    () => dialog,
  );
  return d ? <DialogView key={d.id} d={d} /> : null;
}

/* ================================================================ page / section load errors */

/**
 * Shown instead of a page or section that could not be loaded: what happened and "Try again".
 * Records that do not exist (or belong to someone else) get a way back instead.
 */
export function LoadError({ error, onRetry, back, compact = false }: {
  error: ErrorInfo | string | null | undefined;
  onRetry?: () => void;
  back?: { to: string; label: string };
  compact?: boolean;
}) {
  if (!error) return null;
  const info: ErrorInfo = typeof error === 'string'
    ? { kind: 'unknown', title: 'Unable to load', message: error, fields: {}, retryable: true }
    : error;
  const missing = info.kind === 'notfound' || info.kind === 'forbidden';
  const title = missing ? info.title : info.kind === 'offline' || info.kind === 'network' || info.kind === 'timeout' ? info.title : 'Unable to load this information';
  return (
    <div className={`load-error ${compact ? 'load-error-compact' : 'card'}`} role="alert">
      <span className="load-error-icon"><FbIcon d={missing ? ICON.info : info.kind === 'offline' ? ICON.offline : ICON.error} size={compact ? 22 : 30} /></span>
      <div>
        <strong>{title}</strong>
        <p>{info.message}</p>
        <div className="load-error-actions">
          {onRetry && !missing && <button type="button" className="btn btn-sm" onClick={onRetry}>Try again</button>}
          {back && <Link className="btn btn-outline btn-sm" to={back.to}>{back.label}</Link>}
        </div>
      </div>
    </div>
  );
}

/* ================================================================ form field errors */

/** Validation message under a form field. */
export function FieldError({ message, id }: { message?: string; id?: string }) {
  if (!message) return null;
  return <span className="field-error" id={id} role="alert">{message}</span>;
}

/** Brings the first field with a problem into view. */
function focusFirstInvalid() {
  window.setTimeout(() => {
    const el = document.querySelector<HTMLElement>('[aria-invalid="true"]');
    el?.focus({ preventScroll: true });
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, 30);
}

/**
 * Server-side validation for one form: messages for the listed fields are shown next to those fields,
 * everything else (and connection/server problems) in the form's general message.
 */
export function useFormErrors(fieldNames: string[] = [], { summary = true }: { summary?: boolean } = {}) {
  const [fields, setFields] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState('');
  const known = fieldNames.join('|');

  const fromError = useCallback((err: unknown) => {
    const info = describeError(err);
    const names = known ? known.split('|') : [];
    const mine: Record<string, string> = {};
    const others: string[] = [];
    Object.entries(info.fields).forEach(([k, v]) => {
      const name = names.find((n) => k === n || k.startsWith(`${n}.`));
      if (name && !mine[name]) mine[name] = v; else if (!name) others.push(v);
    });
    setFields(mine);
    if (info.kind === 'validation' && Object.keys(info.fields).length) {
      setGeneral(others.length ? others.join(' ') : summary ? 'Please correct the highlighted fields.' : '');
    } else {
      setGeneral(info.retryable ? `${info.message} Your entries were kept.` : info.message);
    }
    focusFirstInvalid();
    return info;
  }, [known, summary]);

  /** Problems found before sending (e.g. passwords that do not match). */
  const setFieldErrors = useCallback((f: Record<string, string>) => {
    setFields(f);
    setGeneral('Please correct the highlighted fields.');
    focusFirstInvalid();
  }, []);

  const clear = useCallback((name?: string) => {
    if (name) setFields((f) => { if (!f[name]) return f; const n = { ...f }; delete n[name]; return n; });
    else { setFields({}); setGeneral(''); }
  }, []);

  /** Props for an input: marks it invalid and links it to its message. */
  const invalid = (name: string) => (fields[name] ? { 'aria-invalid': true as const, 'aria-describedby': `err-${name}` } : {});
  const error = (name: string) => <FieldError message={fields[name]} id={`err-${name}`} />;

  return { fields, general, setGeneral, fromError, setFieldErrors, clear, invalid, error };
}
