import { ReactNode, useState } from "react";

export type Tab = { id: string; label: string; content: ReactNode };

export default function Tabs({
  tabs,
  defaultId,
}: {
  tabs: Tab[];
  defaultId?: string;
}) {
  const [active, setActive] = useState<string>(
    defaultId || (tabs[0]?.id ?? ""),
  );
  return (
    <div>
      <div className="flex items-center gap-2 border-b">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`px-3 py-2 text-sm -mb-px border-b-2 ${
              active === t.id
                ? "border-accent-600 text-gray-900"
                : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
            onClick={() => setActive(t.id)}
            aria-current={active === t.id ? "page" : undefined}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="pt-3">
        {tabs.map((t) => (
          <div key={t.id} hidden={active !== t.id}>
            {t.content}
          </div>
        ))}
      </div>
    </div>
  );
}
