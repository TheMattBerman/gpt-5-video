import Link from "next/link";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { Badge } from "./ui";

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
  const router = useRouter();
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
    const onPing = () => setSseStatus("connected");
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
            {NAV_ITEMS.map((it) => {
              const active = router.pathname === it.href;
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  aria-current={active ? "page" : undefined}
                  className={`block rounded-md px-3 py-2 outline-none hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-accent-600 ${active ? "bg-accent-50 text-accent-700" : "text-gray-700"}`}
                >
                  {it.label}
                </Link>
              );
            })}
          </nav>
        </aside>
        <div>
          <header className="sticky top-0 z-40 border-b bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60">
            <div className="mx-auto max-w-content-5xl px-4 py-3 flex items-center justify-between gap-3">
              <div className="text-sm text-gray-700 flex items-center gap-2">
                <span className="text-gray-600">SSE</span>
                {sseStatus === "connected" ? (
                  <Badge variant="info">connected</Badge>
                ) : sseStatus === "disconnected" ? (
                  <Badge variant="error">disconnected</Badge>
                ) : (
                  <Badge variant="default">connecting…</Badge>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs">
                {guardrails ? (
                  <Badge variant="warning">
                    conc {guardrails.max_concurrency} · max $
                    {guardrails.max_cost_per_batch_usd.toFixed(2)}
                  </Badge>
                ) : (
                  <Badge variant="default">guardrails --</Badge>
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
