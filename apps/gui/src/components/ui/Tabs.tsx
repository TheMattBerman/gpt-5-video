import { ReactNode, useEffect, useRef, useState } from "react";

export type Tab = { id: string; label: string; content: ReactNode };

export default function Tabs({
  tabs,
  defaultId,
  sticky = false,
}: {
  tabs: Tab[];
  defaultId?: string;
  sticky?: boolean;
}) {
  const [active, setActive] = useState<string>(
    defaultId || (tabs[0]?.id ?? ""),
  );
  const listRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const btn = listRef.current?.querySelector(
      `[data-tab-id="${active}"]`,
    ) as HTMLButtonElement | null;
    if (btn) btn.focus();
  }, [active]);
  return (
    <div>
      <div
        className={`${sticky ? "sticky top-0 z-10 bg-white/70 backdrop-blur supports-[backdrop-filter]:bg-white/60" : ""} flex items-center gap-2 border-b`}
        ref={listRef}
        role="tablist"
        aria-orientation="horizontal"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            data-tab-id={t.id}
            role="tab"
            tabIndex={active === t.id ? 0 : -1}
            aria-selected={active === t.id}
            className={`px-3 py-2 text-sm -mb-px border-b-2 rounded-t-md ${
              active === t.id
                ? "border-accent-600 bg-accent-50 text-gray-900"
                : "border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50"
            }`}
            onClick={() => setActive(t.id)}
            aria-current={active === t.id ? "page" : undefined}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                e.preventDefault();
                const idx = tabs.findIndex((x) => x.id === active);
                const nextIdx =
                  e.key === "ArrowRight"
                    ? (idx + 1) % tabs.length
                    : (idx - 1 + tabs.length) % tabs.length;
                setActive(tabs[nextIdx]!.id);
              }
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="pt-3">
        {tabs.map((t) => (
          <div key={t.id} hidden={active !== t.id} role="tabpanel">
            {t.content}
          </div>
        ))}
      </div>
    </div>
  );
}
