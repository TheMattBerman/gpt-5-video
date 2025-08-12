import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PageHeader from "../components/PageHeader";
import QuickTour from "../components/QuickTour";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import { computeKpis } from "../lib/jobs";
import { useToast } from "../components/Toast";

type RecentAsset = {
  key: string;
  contentType: string;
  uploadedAt: number;
  previewUrl?: string;
};

export default function Home() {
  const [ping, setPing] = useState<string>("connecting...");
  const [file, setFile] = useState<File | null>(null);
  const [keyPrefix, setKeyPrefix] = useState<string>("dev/");
  const [contentType, setContentType] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(undefined);
  const [recent, setRecent] = useState<RecentAsset[]>([]);
  const [kpis, setKpis] = useState(() => computeKpis());
  const [serverKpis, setServerKpis] = useState<{
    in_progress: number;
    failures: number;
    avg_render_time_ms: number;
    spend_today_usd: number;
    failures_by_category?: Record<string, number>;
    avg_queue_wait_ms?: number;
    processing_count?: number;
    queued_count?: number;
    avg_cost_per_render_today_usd?: number;
  } | null>(null);
  const { show } = useToast();

  const apiBase = useMemo(
    () => process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000",
    [],
  );
  const publicAssetBase = useMemo(
    () => (process.env.NEXT_PUBLIC_ASSET_BASE || "").replace(/\/$/, ""),
    [],
  );

  const fetchKpis = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/kpis/today`);
      if (!res.ok) return;
      const data = await res.json();
      setServerKpis(data);
    } catch {}
  }, [apiBase]);

  useEffect(() => {
    const es = new EventSource(`${apiBase}/jobs/stream`);
    es.addEventListener("ping", (ev) =>
      setPing((ev as MessageEvent).data as string),
    );
    es.addEventListener("job", () => {
      setKpis((prev) => ({ ...prev, lastUpdated: Date.now() }));
      void fetchKpis();
    });
    es.onerror = () => setPing("disconnected");
    return () => es.close();
  }, [apiBase, fetchKpis]);

  // Refresh guardrails tile when settings change without a hard reload
  useEffect(() => {
    const onGuardrails = () => void fetchKpis();
    window.addEventListener(
      "gpt5video_guardrails_updated",
      onGuardrails as any,
    );
    return () =>
      window.removeEventListener(
        "gpt5video_guardrails_updated",
        onGuardrails as any,
      );
  }, [fetchKpis]);

  useEffect(() => {
    const interval = setInterval(() => setKpis(computeKpis()), 1500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (!cancelled) await fetchKpis();
    };
    void tick();
    const timer = setInterval(tick, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [fetchKpis]);

  useEffect(() => {
    if (file && file.type && !contentType) setContentType(file.type);
  }, [file, contentType]);

  async function handleUpload() {
    if (!file) {
      setStatus("Choose a file first");
      return;
    }
    const key = `${keyPrefix}${file.name}`.replace(/\/+/, "/");
    const ctype = contentType || file.type || "application/octet-stream";
    setStatus("Requesting signed URL...");
    try {
      const signRes = await fetch(`${apiBase}/uploads/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, content_type: ctype }),
      });
      if (!signRes.ok) throw new Error(`sign failed: ${signRes.status}`);
      const { url } = (await signRes.json()) as { url: string; key: string };

      setStatus("Uploading...");
      const putRes = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": ctype },
        body: file,
      });
      if (!putRes.ok) throw new Error(`put failed: ${putRes.status}`);

      // Prefer public asset base for reads in dev (R2 public bucket)
      let preview: string | undefined = undefined;
      if (publicAssetBase) {
        preview = `${publicAssetBase}/${key}`;
      } else {
        // Fallback to API debug endpoint to compute a public or signed GET URL
        const dbg = await fetch(
          `${apiBase}/uploads/debug-get?key=${encodeURIComponent(key)}`,
        ).then((r) => r.json());
        preview =
          (dbg.public_url as string) || (dbg.url as string) || undefined;
      }
      setPreviewUrl(preview);
      setRecent((prev) =>
        [
          {
            key,
            contentType: ctype,
            uploadedAt: Date.now(),
            previewUrl: preview,
          },
          ...prev,
        ].slice(0, 10),
      );
      setStatus("Uploaded ✅");
    } catch (err: any) {
      setStatus(`Error: ${err?.message || String(err)}`);
      setPreviewUrl(undefined);
    }
  }

  return (
    <div className="space-y-6">
      <QuickTour
        steps={[
          {
            id: "settings",
            title: "Settings token",
            description:
              "Add your API token in Settings to enable secure requests.",
          },
          {
            id: "hooks",
            title: "Hooks",
            description: "Mine and synthesize candidate hooks.",
          },
          {
            id: "scenes-plan",
            title: "Scenes Plan",
            description: "Compose scenes with valid JSON or a friendly form.",
          },
          {
            id: "scenes-render",
            title: "Scenes Render",
            description: "Queue renders and watch live chips.",
          },
          {
            id: "video",
            title: "Video",
            description: "Assemble a manifest, choose audio mode.",
          },
          {
            id: "review",
            title: "Review & Export",
            description: "Checklist and export presets.",
          },
        ]}
      />
      <PageHeader
        title="All-Replicate Content Engine"
        description="Operate Hooks → Scenes → Video with status-aware metrics and helpful defaults."
        actions={
          <Link href="/scenes-render" className="btn-primary">
            Queue a render
          </Link>
        }
      />

      {/* Add SSE status line for smoke test */}
      <div className="text-xs text-gray-600">SSE status: {String(ping)}</div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2" variant="surface-1">
          <CardHeader>
            <CardTitle>Operational KPIs</CardTitle>
            {!serverKpis && (
              <Badge variant="warning">server KPIs unavailable</Badge>
            )}
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              <Tile label="Uploads (session)" value={String(recent.length)} />
              <Tile
                label="Last ping (ms ago)"
                value={String(
                  Math.max(
                    0,
                    Date.now() -
                      Number(ping?.match(/\"ts\":\s*(\d+)/)?.[1] || Date.now()),
                  ),
                )}
              />
              <ApiHealthTile apiBase={apiBase} />
              <Tile
                label="In-progress jobs"
                value={String(serverKpis?.in_progress ?? "--")}
                warn={!serverKpis}
              />
              <Tile
                label="Processing | Queued"
                value={
                  serverKpis
                    ? `${serverKpis.processing_count ?? 0} | ${serverKpis.queued_count ?? 0}`
                    : "--"
                }
                warn={!serverKpis}
              />
              <Tile
                label="Failures (today)"
                value={String(serverKpis?.failures ?? "--")}
                warn={!serverKpis}
              />
              <Tile
                label="Avg render time (ms)"
                value={String(serverKpis?.avg_render_time_ms ?? "--")}
                warn={!serverKpis}
              />
              <Tile
                label="Avg queue wait (ms)"
                value={String(serverKpis?.avg_queue_wait_ms ?? "--")}
                warn={!serverKpis}
              />
              <Tile
                label="Spend today ($)"
                value={
                  serverKpis ? serverKpis.spend_today_usd.toFixed(2) : "--"
                }
                warn={!serverKpis}
              />
              <Tile
                label="Avg cost/render ($)"
                value={
                  serverKpis
                    ? (serverKpis.avg_cost_per_render_today_usd || 0).toFixed(2)
                    : "--"
                }
                warn={!serverKpis}
              />
              <div className="rounded border p-3">
                <div className="text-xs text-gray-500">
                  Failures by category
                </div>
                <div className="mt-1 text-xs font-mono whitespace-pre-wrap">
                  {serverKpis?.failures_by_category
                    ? Object.entries(serverKpis.failures_by_category)
                        .map(([k, v]) => `${k || "unknown"}: ${v}`)
                        .join("\n")
                    : "--"}
                </div>
              </div>
              <GuardrailsTile apiBase={apiBase} />
            </div>
          </CardContent>
        </Card>
        <Card variant="surface-2">
          <CardHeader>
            <CardTitle>Getting Started</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="grid grid-cols-2 gap-3 text-sm">
              {[
                { href: "/settings", icon: "🔑", label: "Settings: API Token" },
                { href: "/hooks", icon: "🧲", label: "Hooks" },
                { href: "/scenes-plan", icon: "📝", label: "Scenes Plan" },
                { href: "/scenes-render", icon: "⏱️", label: "Scenes Render" },
                {
                  href: "/video-assemble",
                  icon: "🎬",
                  label: "Video Assemble",
                },
                {
                  href: "/review-export",
                  icon: "📤",
                  label: "Review & Export",
                },
              ].map((it) => (
                <li key={it.href}>
                  <Link
                    className="flex items-center gap-2 rounded-md border p-2 hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-accent-600 focus-visible:ring-offset-2 outline-none"
                    href={it.href}
                  >
                    <span aria-hidden>{it.icon}</span>
                    <span>{it.label}</span>
                  </Link>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>

      <Card variant="surface-1">
        <CardHeader>
          <CardTitle>Recent assets (session)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-gray-600">
                  <th className="px-2 py-1">Key</th>
                  <th className="px-2 py-1">Content-Type</th>
                  <th className="px-2 py-1">Uploaded</th>
                  <th className="px-2 py-1">Preview</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((a) => (
                  <tr key={`${a.key}-${a.uploadedAt}`} className="border-t">
                    <td className="px-2 py-1 font-mono">{a.key}</td>
                    <td className="px-2 py-1">{a.contentType}</td>
                    <td className="px-2 py-1 text-gray-600">
                      {new Date(a.uploadedAt).toLocaleTimeString()}
                    </td>
                    <td className="px-2 py-1">
                      {a.previewUrl ? (
                        <a
                          href={a.previewUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-accent-700 underline"
                        >
                          open
                        </a>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {recent.length === 0 && (
                  <tr>
                    <td className="px-2 py-4 text-gray-500" colSpan={4}>
                      No uploads yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Tile({
  label,
  value,
  warn,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div
      className={`rounded border p-3 ${warn ? "bg-yellow-50 border-yellow-200" : ""}`}
    >
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}

function ApiHealthTile({ apiBase }: { apiBase: string }) {
  const [status, setStatus] = useState<string>("...");
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${apiBase}/health`);
        const ok = res.ok && (await res.json())?.ok;
        if (!cancelled) setStatus(ok ? "ok" : "down");
      } catch {
        if (!cancelled) setStatus("down");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiBase]);
  return <Tile label="API" value={status} />;
}

function GuardrailsTile({ apiBase }: { apiBase: string }) {
  const [cfg, setCfg] = useState<{
    max_cost_per_batch_usd: number;
    max_concurrency: number;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const fetchCfg = async () => {
      try {
        const res = await fetch(`${apiBase}/settings/guardrails`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setCfg(data);
      } catch {}
    };
    void fetchCfg();
    const onGuardrails = () => void fetchCfg();
    window.addEventListener(
      "gpt5video_guardrails_updated",
      onGuardrails as any,
    );
    return () => {
      cancelled = true;
      window.removeEventListener(
        "gpt5video_guardrails_updated",
        onGuardrails as any,
      );
    };
  }, [apiBase]);
  const value = cfg
    ? `${cfg.max_concurrency} | $${cfg.max_cost_per_batch_usd.toFixed(2)}`
    : "--";
  return <Tile label="Guardrails (conc | max$)" value={value} />;
}
