'use client';

import { createContext, useCallback, useContext, useState } from 'react';
import { Modal } from './Modal';

type Variant = 'info' | 'warning' | 'danger' | 'success';

interface DialogOptions {
  title: string;
  description?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: Variant;
  icon?: React.ReactNode;
}

interface ToastOptions {
  message: string;
  variant?: 'info' | 'success' | 'warning' | 'danger';
  duration?: number;
}

interface DialogContextValue {
  confirm: (opts: string | DialogOptions) => Promise<boolean>;
  alert: (opts: string | Omit<DialogOptions, 'cancelText' | 'icon'> & { icon?: React.ReactNode }) => Promise<void>;
  toast: (opts: string | ToastOptions) => void;
}

const DialogContext = createContext<DialogContextValue | null>(null);

const VARIANT_STYLES: Record<Variant, { dot: string; iconBg: string; btnCls: string }> = {
  info: {
    dot: 'var(--accent)',
    iconBg: 'rgba(94, 106, 210, 0.12)',
    btnCls: 'btn btn-primary',
  },
  warning: {
    dot: 'var(--warning)',
    iconBg: 'rgba(242, 201, 76, 0.12)',
    btnCls: 'btn btn-primary',
  },
  danger: {
    dot: 'var(--destructive)',
    iconBg: 'rgba(235, 87, 87, 0.12)',
    btnCls: 'btn-danger',
  },
  success: {
    dot: 'var(--success)',
    iconBg: 'rgba(76, 183, 130, 0.12)',
    btnCls: 'btn btn-primary',
  },
};

function VariantIcon({ variant }: { variant: Variant }) {
  const colorMap: Record<Variant, string> = {
    info: 'var(--accent)',
    warning: 'var(--warning)',
    danger: 'var(--destructive)',
    success: 'var(--success)',
  };
  const stroke = colorMap[variant];
  if (variant === 'info') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
    );
  }
  if (variant === 'warning') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    );
  }
  if (variant === 'danger') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    );
  }
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

interface PendingConfirm {
  opts: DialogOptions;
  resolve: (v: boolean) => void;
}

interface PendingAlert {
  opts: DialogOptions;
  resolve: () => void;
}

interface ToastItem {
  id: number;
  message: string;
  variant: 'info' | 'success' | 'warning' | 'danger';
}

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [confirmState, setConfirmState] = useState<PendingConfirm | null>(null);
  const [alertState, setAlertState] = useState<PendingAlert | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const closeConfirm = (v: boolean) => {
    setConfirmState((s) => {
      s?.resolve(v);
      return null;
    });
  };

  const closeAlert = () => {
    setAlertState((s) => {
      s?.resolve();
      return null;
    });
  };

  const confirm: DialogContextValue['confirm'] = useCallback((opts) => {
    return new Promise<boolean>((resolve) => {
      const o: DialogOptions = typeof opts === 'string' ? { title: opts } : opts;
      setConfirmState({ opts: o, resolve });
    });
  }, []);

  const alert: DialogContextValue['alert'] = useCallback((opts) => {
    return new Promise<void>((resolve) => {
      const o: DialogOptions = typeof opts === 'string' ? { title: opts } : opts;
      setAlertState({ opts: o, resolve });
    });
  }, []);

  const toast: DialogContextValue['toast'] = useCallback((opts) => {
    const id = Date.now() + Math.random();
    const message = typeof opts === 'string' ? opts : opts.message;
    const variant = (typeof opts === 'string' ? 'info' : opts.variant) || 'info';
    const duration = (typeof opts === 'string' ? 3200 : opts.duration) ?? 3200;
    const item: ToastItem = { id, message, variant };
    setToasts((prev) => [...prev, item]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  return (
    <DialogContext.Provider value={{ confirm, alert, toast }}>
      {children}

      {confirmState && (
        <Modal open onClose={() => closeConfirm(false)}>
          <div className="px-6 pt-6 pb-5">
            <div className="flex items-start gap-3 mb-4">
              {confirmState.opts.icon ?? (
                <div
                  className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ background: VARIANT_STYLES[confirmState.opts.variant || 'info'].iconBg }}
                >
                  <VariantIcon variant={confirmState.opts.variant || 'info'} />
                </div>
              )}
              <div className="flex-1 min-w-0 pt-0.5">
                <h3 className="font-display font-semibold text-[16px] leading-[1.4]" style={{ color: 'var(--text-primary)' }}>
                  {confirmState.opts.title}
                </h3>
                {confirmState.opts.description && (
                  <div className="mt-2 text-[13px] leading-[1.6] whitespace-pre-line" style={{ color: 'var(--text-secondary)' }}>
                    {confirmState.opts.description}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div
            className="flex items-center justify-end gap-2 px-6 py-4"
            style={{ borderTop: '1px solid var(--border-hairline)', background: 'var(--bg-surface-2)', borderBottomLeftRadius: 12, borderBottomRightRadius: 12 }}
          >
            <button onClick={() => closeConfirm(false)} className="btn btn-ghost !py-2 !px-4 text-[13px]">
              {confirmState.opts.cancelText || '取消'}
            </button>
            <button
              onClick={() => closeConfirm(true)}
              className={`${VARIANT_STYLES[confirmState.opts.variant || 'info'].btnCls} !py-2 !px-4 text-[13px]`}
              autoFocus
            >
              {confirmState.opts.confirmText || '确定'}
            </button>
          </div>
        </Modal>
      )}

      {alertState && (
        <Modal open onClose={closeAlert}>
          <div className="px-6 pt-6 pb-5">
            <div className="flex items-start gap-3">
              <div
                className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ background: VARIANT_STYLES[alertState.opts.variant || 'info'].iconBg }}
              >
                <VariantIcon variant={alertState.opts.variant || 'info'} />
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                <h3 className="font-display font-semibold text-[16px] leading-[1.4]" style={{ color: 'var(--text-primary)' }}>
                  {alertState.opts.title}
                </h3>
                {alertState.opts.description && (
                  <div className="mt-2 text-[13px] leading-[1.6] whitespace-pre-line" style={{ color: 'var(--text-secondary)' }}>
                    {alertState.opts.description}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div
            className="flex items-center justify-end gap-2 px-6 py-4"
            style={{ borderTop: '1px solid var(--border-hairline)', background: 'var(--bg-surface-2)', borderBottomLeftRadius: 12, borderBottomRightRadius: 12 }}
          >
            <button
              onClick={closeAlert}
              className={`${VARIANT_STYLES[alertState.opts.variant || 'info'].btnCls} !py-2 !px-4 text-[13px]`}
              autoFocus
            >
              {alertState.opts.confirmText || '知道了'}
            </button>
          </div>
        </Modal>
      )}

      {toasts.length > 0 && (
        <div className="toast-stack fixed z-50 flex flex-col gap-2" style={{ top: 72, right: 24 }}>
          {toasts.map((t) => (
            <div
              key={t.id}
              className="toast lux-card flex items-start gap-3 px-4 py-3"
              style={{ minWidth: 280, maxWidth: 420 }}
              role="status"
            >
              <span
                className="flex-shrink-0 w-2 h-2 rounded-full mt-1.5"
                style={{
                  background:
                    t.variant === 'danger'
                      ? 'var(--destructive)'
                      : t.variant === 'success'
                      ? 'var(--success)'
                      : t.variant === 'warning'
                      ? 'var(--warning)'
                      : 'var(--accent)',
                }}
              />
              <div className="text-[13px] leading-[1.5] flex-1" style={{ color: 'var(--text-primary)' }}>
                {t.message}
              </div>
            </div>
          ))}
        </div>
      )}
    </DialogContext.Provider>
  );
}

export function useDialog() {
  const ctx = useContext(DialogContext);
  if (!ctx) {
    throw new Error('useDialog must be used within DialogProvider');
  }
  return ctx;
}