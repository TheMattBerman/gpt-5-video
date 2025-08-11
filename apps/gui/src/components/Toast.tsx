import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type ToastItem = {
  id: string;
  title: string;
  description?: string;
  variant?: "info" | "error" | "success";
  timeoutMs?: number;
};

type ToastContextType = {
  show: (t: Omit<ToastItem, "id">) => void;
};

const ToastContext = createContext<ToastContextType | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const show = useCallback((t: Omit<ToastItem, "id">) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const item: ToastItem = { id, timeoutMs: 4000, variant: "info", ...t };
    setItems((prev) => [...prev, item]);
  }, []);

  // Auto-dismiss
  useEffect(() => {
    const timers = items.map((it) =>
      setTimeout(() => {
        setItems((prev) => prev.filter((p) => p.id !== it.id));
      }, it.timeoutMs),
    );
    return () => timers.forEach(clearTimeout);
  }, [items]);

  const value = useMemo(() => ({ show }), [show]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport
        items={items}
        onClose={(id) => setItems((prev) => prev.filter((p) => p.id !== id))}
      />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

function ToastViewport({
  items,
  onClose,
}: {
  items: ToastItem[];
  onClose: (id: string) => void;
}) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
      {items.map((it) => (
        <ToastCard key={it.id} item={it} onClose={() => onClose(it.id)} />
      ))}
    </div>
  );
}

function ToastCard({
  item,
  onClose,
}: {
  item: ToastItem;
  onClose: () => void;
}) {
  const variantStyles =
    item.variant === "error"
      ? "border-red-300 bg-red-50 text-red-800"
      : item.variant === "success"
        ? "border-green-300 bg-green-50 text-green-800"
        : "border-gray-200 bg-white text-gray-900";
  return (
    <div
      className={`rounded border p-3 shadow-sm ${variantStyles}`}
      role="status"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium">{item.title}</div>
          {item.description && (
            <div className="mt-0.5 text-xs opacity-80">{item.description}</div>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-xs opacity-60 hover:opacity-100"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
