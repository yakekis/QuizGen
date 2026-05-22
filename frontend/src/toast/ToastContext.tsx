import { createContext, useCallback, useContext, useState, ReactNode } from 'react';

type ToastKind = 'success' | 'error' | 'info';
interface Toast { id: number; kind: ToastKind; message: string; }

const Ctx = createContext<((kind: ToastKind, message: string) => void) | null>(null);

let _id = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = ++_id;
    setItems((s) => [...s, { id, kind, message }]);
    setTimeout(() => {
      setItems((s) => s.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
        {items.map((t) => (
          <div
            key={t.id}
            className={`animate-slide-up rounded-xl px-4 py-3 shadow-hover text-sm font-medium border ${
              t.kind === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : t.kind === 'error'
                ? 'bg-rose-50 border-rose-200 text-rose-800'
                : 'bg-sky-50 border-sky-200 text-sky-800'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const fn = useContext(Ctx);
  if (!fn) throw new Error('useToast must be used within ToastProvider');
  return {
    success: (m: string) => fn('success', m),
    error: (m: string) => fn('error', m),
    info: (m: string) => fn('info', m),
  };
}
