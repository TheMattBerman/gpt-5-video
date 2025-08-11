import Link from "next/link";
import { ReactNode, useEffect, useMemo, useState } from "react";

const NAV_ITEMS: Array<{ href: string; label: string }> = [
  { href: "/", label: "Dashboard" },
  { href: "/brand", label: "Brand" },
  { href: "/hooks", label: "Hooks" },
  { href: "/character", label: "Character" },
  { href: "/scenes-plan", label: "Scenes" },
  { href: "/scenes-render", label: "Renders Queue" },
  { href: "/renders", label: "Renders" },
  { href: "/video-assemble", label: "Video" },
  { href: "/review-export", label: "Review & Export" },
  { href: "/settings", label: "Settings" },
];

export function Layout({ children }: { children: ReactNode }) {
  const apiBase = useMemo(
    () => process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000",
    [],
  );
  const [sseStatus, setSseStatus] = useState<string>("connecting…");
  const [guardrails, setGuardrails] = useState<{
    max_concurrency: number;
    max_cost_per_batch_usd: number;
  } | null>(null);

  // Lightweight SSE status
  useEffect(() => {
    const es = new EventSource(`${apiBase}/jobs/stream`);
    const onPing = (ev: MessageEvent) =>
      setSseStatus((ev as MessageEvent).data as string);
    es.addEventListener("ping", onPing as any);
    es.onerror = () => setSseStatus("disconnected");
    return () => {
      es.removeEventListener("ping", onPing as any);
      es.close();
    };
  }, [apiBase]);

  // Guardrails pill
  useEffect(() => {
    let cancelled = false;
    const fetchCfg = async () => {
      try {
        const res = await fetch(`${apiBase}/settings/guardrails`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setGuardrails(data);
      } catch {}
    };
    void fetchCfg();
    const onUpdate = () => void fetchCfg();
    window.addEventListener("gpt5video_guardrails_updated", onUpdate as any);
    return () => {
      cancelled = true;
      window.removeEventListener(
        "gpt5video_guardrails_updated",
        onUpdate as any,
      );
    };
  }, [apiBase]);

  return (
    <div className="min-h-dvh bg-gray-50">
      <div className="grid grid-cols-1 md:grid-cols-[240px_1fr]">
        <aside className="hidden md:block border-r bg-white">
          <div className="p-4">
            <div className="text-sm font-semibold">GPT-5 Video</div>
          </div>
          <nav className="px-2 pb-4 space-y-1 text-sm">
            {NAV_ITEMS.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                className="block rounded-md px-3 py-2 hover:bg-gray-50"
              >
                {it.label}
              </Link>
            ))}
          </nav>
        </aside>
        <div>
          <header className="sticky top-0 z-40 border-b bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60">
            <div className="mx-auto max-w-content-5xl px-4 py-3 flex items-center justify-between gap-3">
              <div className="text-sm text-gray-700">
                SSE status: <span className="font-mono">{sseStatus}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                {guardrails ? (
                  <span className="badge bg-yellow-50 text-yellow-800 border border-yellow-200">
                    conc {guardrails.max_concurrency} · max $
                    {guardrails.max_cost_per_batch_usd.toFixed(2)}
                  </span>
                ) : (
                  <span className="badge bg-gray-100 text-gray-700 border border-gray-200">
                    guardrails --
                  </span>
                )}
              </div>
            </div>
          </header>
          <main className="mx-auto max-w-content-5xl p-4 md:p-6">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

export default Layout;
