import Link from "next/link";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { Badge } from "./ui";
import Tooltip from "./ui/Tooltip";

const NAV_ITEMS: Array<{ href: string; label: string; icon: string }> = [
  { href: "/", label: "Dashboard", icon: "🏠" },
  { href: "/brand", label: "Brand", icon: "🏷️" },
  { href: "/hooks", label: "Hooks", icon: "🧲" },
  { href: "/character", label: "Character", icon: "👤" },
  { href: "/scenes-plan", label: "Scenes", icon: "📝" },
  { href: "/scenes-render", label: "Renders Queue", icon: "⏱️" },
  { href: "/renders", label: "Renders", icon: "🖼️" },
  { href: "/video-assemble", label: "Video", icon: "🎬" },
  { href: "/review-export", label: "Review & Export", icon: "📤" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
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
  const [presentation, setPresentation] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.sessionStorage.getItem("gpt5video_presentation") === "1";
    } catch {
      return false;
    }
  });

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

  const crumbs = useMemo(() => {
    const path = router.pathname;
    const parts = path.split("/").filter(Boolean);
    const map: Record<string, string> = {
      hooks: "Hooks",
      "scenes-plan": "Scenes Plan",
      "scenes-render": "Scenes Render",
      renders: "Renders",
      "video-assemble": "Video Assemble",
      "review-export": "Review & Export",
      settings: "Settings",
      brand: "Brand",
      character: "Character",
    };
    const label = parts.length ? map[parts[0]!] || parts[0]! : "Dashboard";
    return ["Operator Console", label].filter(Boolean);
  }, [router.pathname]);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(
        "gpt5video_presentation",
        presentation ? "1" : "0",
      );
    } catch {}
  }, [presentation]);

  // ESC exits presentation
  useEffect(() => {
    if (!presentation) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPresentation(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [presentation]);

  return (
    <div className="min-h-dvh bg-gray-50">
      <div
        className={`grid grid-cols-1 ${presentation ? "md:grid-cols-1" : "md:grid-cols-[240px_1fr]"}`}
      >
        {!presentation && (
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
                    className={`flex items-center gap-2 rounded-md px-3 py-2 outline-none hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-accent-600 ${active ? "bg-accent-50 text-accent-700" : "text-gray-700"}`}
                  >
                    <span aria-hidden>{it.icon}</span>
                    <span>{it.label}</span>
                  </Link>
                );
              })}
            </nav>
          </aside>
        )}
        <div>
          <header className="sticky top-0 z-40 border-b bg-gradient-to-b from-white/90 to-white/70 backdrop-blur supports-[backdrop-filter]:bg-white/60">
            <div className="mx-auto max-w-content-5xl px-4 py-3 flex items-center justify-between gap-3">
              <div className="text-sm text-gray-900 font-medium flex items-center gap-2">
                <span>{crumbs[0]}</span>
                <span className="text-gray-400">›</span>
                <span>{crumbs[1]}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <div className="flex items-center gap-1">
                  <span className="text-gray-600">SSE</span>
                  {sseStatus === "connected" ? (
                    <Badge variant="info">Connected</Badge>
                  ) : sseStatus === "disconnected" ? (
                    <Badge variant="error">Disconnected</Badge>
                  ) : (
                    <Badge variant="default">Connecting…</Badge>
                  )}
                </div>
                {guardrails ? (
                  <Badge variant="warning">
                    conc {guardrails.max_concurrency} · max $
                    {guardrails.max_cost_per_batch_usd.toFixed(2)}
                  </Badge>
                ) : (
                  <Badge variant="default">guardrails --</Badge>
                )}
                <Tooltip
                  label={
                    presentation
                      ? "Presentation mode on · Press Esc to exit"
                      : "Toggle presentation mode"
                  }
                >
                  <button
                    className={`inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-xs transition-colors duration-150 ease-standard focus-visible:ring-2 focus-visible:ring-accent-600 ${presentation ? "bg-accent-50 text-gray-900" : "hover:bg-gray-50"}`}
                    onClick={() => setPresentation((v) => !v)}
                    aria-label="Toggle presentation mode"
                  >
                    <span aria-hidden>▣</span>
                    {presentation ? "Presentation on" : "Presentation"}
                  </button>
                </Tooltip>
              </div>
            </div>
          </header>
          <main
            className={`mx-auto max-w-content-5xl p-4 md:p-6 ${presentation ? "md:max-w-content-5xl" : ""}`}
          >
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

export default Layout;
