import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cx, friendlyError } from '../lib/utils';
import { Button, Modal } from './ui';

// ---------------------------------------------------------------------
// Toast (có nút Undo)
// ---------------------------------------------------------------------

interface ToastItem {
  id: number;
  tone: 'info' | 'success' | 'error';
  message: string;
  action?: { label: string; onClick: () => void };
}

interface ToastApi {
  show: (message: string, opts?: { tone?: ToastItem['tone']; action?: ToastItem['action']; duration?: number }) => void;
  error: (err: unknown) => void;
  /** Chạy thao tác và hiện thông báo lỗi dễ hiểu nếu thất bại */
  run: <T>(fn: () => Promise<T>, success?: string) => Promise<T | undefined>;
}

const ToastCtx = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);

  const show = useCallback<ToastApi['show']>((message, opts = {}) => {
    const id = nextId.current++;
    setItems((xs) => [...xs.slice(-3), { id, message, tone: opts.tone ?? 'info', action: opts.action }]);
    setTimeout(() => dismiss(id), opts.duration ?? (opts.action ? 6000 : 3500));
  }, [dismiss]);

  const error = useCallback((err: unknown) => show(friendlyError(err), { tone: 'error', duration: 6000 }), [show]);

  const run = useCallback(async <T,>(fn: () => Promise<T>, success?: string) => {
    try {
      const r = await fn();
      if (success) show(success, { tone: 'success' });
      return r;
    } catch (e) {
      console.error(e);
      error(e);
      return undefined;
    }
  }, [show, error]);

  return (
    <ToastCtx.Provider value={{ show, error, run }}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6 md:right-6 md:left-auto md:items-end" aria-live="polite">
          {items.map((t) => (
            <div key={t.id} className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-sm shadow-lg">
              {t.tone === 'error' ? <AlertTriangle className="size-4 shrink-0 text-danger" /> : t.tone === 'success' ? <CheckCircle2 className="size-4 shrink-0 text-ok" /> : <Info className="size-4 shrink-0 text-accent" />}
              <span className="flex-1">{t.message}</span>
              {t.action && (
                <button type="button" className="font-semibold text-accent" onClick={() => { t.action!.onClick(); dismiss(t.id); }}>
                  {t.action.label}
                </button>
              )}
              <button type="button" aria-label="Đóng" className="text-muted" onClick={() => dismiss(t.id)}><X className="size-4" /></button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastCtx.Provider>
  );
}

export function useToast(): ToastApi {
  const v = useContext(ToastCtx);
  if (!v) throw new Error('useToast outside provider');
  return v;
}

// ---------------------------------------------------------------------
// Confirm dialog
// ---------------------------------------------------------------------

interface ConfirmOpts {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}

const ConfirmCtx = createContext<((o: ConfirmOpts) => Promise<boolean>) | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), []);
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Modal
        open={!!state}
        onClose={() => close(false)}
        title={state?.title}
        size="sm"
        footer={
          <>
            <Button onClick={() => close(false)}>Hủy</Button>
            <Button data-autofocus variant={state?.danger ? 'danger' : 'primary'} onClick={() => close(true)}>
              {state?.confirmLabel ?? 'Đồng ý'}
            </Button>
          </>
        }
      >
        {state?.message && <div className={cx('px-4 py-4 text-sm text-muted')}>{state.message}</div>}
      </Modal>
    </ConfirmCtx.Provider>
  );
}

export function useConfirm() {
  const v = useContext(ConfirmCtx);
  if (!v) throw new Error('useConfirm outside provider');
  return v;
}
