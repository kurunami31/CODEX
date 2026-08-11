import { createContext, useContext, useCallback, useState } from 'react';
import { CheckIcon, AlertIcon } from '../components/icons/Icons';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const push = useCallback((kind, title, msg) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((t) => [...t, { id, kind, title, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const toast = {
    ok: (title, msg) => push('ok', title, msg),
    error: (title, msg) => push('error', title, msg),
    info: (title, msg) => push('info', title, msg),
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast-wrap">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.kind}`}>
            <span style={{ color: t.kind === 'error' ? 'var(--danger)' : 'var(--accent)', flexShrink: 0, marginTop: 2 }}>
              {t.kind === 'error' ? <AlertIcon width={16} height={16} /> : <CheckIcon width={16} height={16} />}
            </span>
            <div>
              <b>{t.title}</b>
              {t.msg ? <div style={{ opacity: 0.8 }}>{t.msg}</div> : null}
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
