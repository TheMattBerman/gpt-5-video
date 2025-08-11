import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useToast } from "../components/Toast";

type Job = {
  id: string;
  type: string;
  status: string;
  prediction_id?: string;
  model_version?: string;
  seed?: number | null;
  duration_ms?: number | null;
  cost_usd?: number | null;
  cost_estimate_usd?: number | null;
  cost_actual_usd?: number | null;
  created_at?: string;
  artifacts?: Array<{ id: number; type?: string; url?: string; key?: string }>;
};

export default function RendersPage() {
  const apiBase = useMemo(
    () => process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000",
    [],
  );
  const { show } = useToast();
  const [items, setItems] = useState<Job[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [tick, setTick] = useState<number>(0);
  const [compareAUrl, setCompareAUrl] = useState<string | null>(null);
  const [compareBUrl, setCompareBUrl] = useState<string | null>(null);
  const [drawerJobId, setDrawerJobId] = useState<string | null>(null);
  const [drawerJob, setDrawerJob] = useState<any | null>(null);

  const fetchData = async () => {
    try {
      const res = await fetch(`${apiBase}/jobs/recent?limit=50`);
      const data = await res.json();
      setItems(
        Array.isArray(data.items)
          ? data.items.filter(
              (j: Job) =>
                j.type === "scene_render" || j.type === "video_assemble",
            )
          : [],
      );
    } catch {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const timer = setInterval(fetchData, 4000);
    return () => {
      clearInterval(timer);
    };
  }, [apiBase, tick]);

  useEffect(() => {
    const es = new EventSource(`${apiBase}/jobs/stream`);
    const onJob = () => setTick((t) => t + 1);
    es.addEventListener("job", onJob as any);
    return () => {
      es.removeEventListener("job", onJob as any);
      es.close();
    };
  }, [apiBase]);

  // Persist compare selections in URL
  useEffect(() => {
    const url = new URL(window.location.href);
    if (compareAUrl) url.searchParams.set("a", compareAUrl);
    else url.searchParams.delete("a");
    if (compareBUrl) url.searchParams.set("b", compareBUrl);
    else url.searchParams.delete("b");
    window.history.replaceState({}, "", url.toString());
  }, [compareAUrl, compareBUrl]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const a = url.searchParams.get("a");
    const b = url.searchParams.get("b");
    if (a) setCompareAUrl(a);
    if (b) setCompareBUrl(b);
  }, []);

  // Load job detail when drawer opens
  useEffect(() => {
    if (!drawerJobId) {
      setDrawerJob(null);
      return;
    }
    (async () => {
      try {
        const res = await fetch(`${apiBase}/jobs/${drawerJobId}`);
        if (!res.ok) return;
        const data = await res.json();
        setDrawerJob(data);
      } catch {}
    })();
  }, [apiBase, drawerJobId]);

  return (
    <main className="min-h-dvh bg-gray-50">
      <div className="mx-auto max-w-5xl p-6 space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Renders</h1>
          <nav className="flex gap-4 text-sm">
            <Link className="text-blue-600 underline" href="/">
              Dashboard
            </Link>
          </nav>
        </header>
        <section className="rounded border bg-white p-4">
          <div className="text-sm font-medium mb-2">Recent renders</div>
          {compareAUrl && compareBUrl && (
            <div className="mb-3 rounded border p-2">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs text-gray-600">Compare</div>
                <button
                  className="text-xs underline"
                  onClick={() => {
                    setCompareAUrl(null);
                    setCompareBUrl(null);
                  }}
                >
                  Clear
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded border p-1">
                  {/\.mp4|\.webm/i.test(compareAUrl) ? (
                    <video
                      src={compareAUrl}
                      controls
                      className="w-full max-h-80 object-contain"
                    />
                  ) : (
                    <img
                      src={compareAUrl}
                      alt="A"
                      className="w-full max-h-80 object-contain"
                    />
                  )}
                </div>
                <div className="rounded border p-1">
                  {/\.mp4|\.webm/i.test(compareBUrl) ? (
                    <video
                      src={compareBUrl}
                      controls
                      className="w-full max-h-80 object-contain"
                    />
                  ) : (
                    <img
                      src={compareBUrl}
                      alt="B"
                      className="w-full max-h-80 object-contain"
                    />
                  )}
                </div>
              </div>
            </div>
          )}
          {loading ? (
            <div className="text-sm text-gray-600">Loading…</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {items.map((j) => (
                <div key={j.id} className="rounded border p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.5 rounded bg-gray-100">
                        {j.type}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-gray-100">
                        {j.status === "queued"
                          ? "queued"
                          : j.status === "processing"
                            ? "processing"
                            : j.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {typeof (j as any).cost_estimate_usd === "number" && (
                        <span className="rounded bg-yellow-50 px-1.5 py-0.5 text-yellow-800">
                          est ${Number((j as any).cost_estimate_usd).toFixed(2)}
                        </span>
                      )}
                      {typeof (j as any).cost_actual_usd === "number" &&
                        Number((j as any).cost_actual_usd) > 0 && (
                          <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-800">
                            ${Number((j as any).cost_actual_usd).toFixed(2)}
                          </span>
                        )}
                    </div>
                  </div>
                  <div className="text-xs text-gray-600">
                    id: <span className="font-mono">{j.id}</span>
                  </div>
                  {j.prediction_id && (
                    <div className="text-xs text-gray-600">
                      prediction_id:{" "}
                      <span className="font-mono">{j.prediction_id}</span>
                    </div>
                  )}
                  {j.model_version && (
                    <div className="text-xs text-gray-600">
                      model_version:{" "}
                      <span className="font-mono">{j.model_version}</span>
                    </div>
                  )}
                  {typeof j.seed === "number" && (
                    <div className="text-xs text-gray-600">
                      seed: <span className="font-mono">{String(j.seed)}</span>
                    </div>
                  )}
                  {typeof j.duration_ms === "number" && (
                    <div className="text-xs text-gray-600">
                      duration_ms:{" "}
                      <span className="font-mono">{String(j.duration_ms)}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    {typeof (j as any).cost_estimate_usd === "number" && (
                      <span className="rounded bg-yellow-50 px-1.5 py-0.5 text-yellow-800">
                        Est ${Number((j as any).cost_estimate_usd).toFixed(2)}
                      </span>
                    )}
                    {typeof (j as any).cost_actual_usd === "number" &&
                      Number((j as any).cost_actual_usd) > 0 && (
                        <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-800">
                          Actual $
                          {Number((j as any).cost_actual_usd).toFixed(2)}
                        </span>
                      )}
                  </div>
                  {!!j.artifacts?.length && (
                    <div className="mt-2">
                      <div className="text-xs text-gray-600">Artifacts</div>
                      <div className="mt-1 space-y-1">
                        {j.artifacts!.map((a) => (
                          <div key={a.id} className="text-xs">
                            {a.url &&
                              (/\.mp4|\.webm/i.test(a.url) ? (
                                <video
                                  src={a.url}
                                  controls
                                  className="w-full max-h-56 rounded border"
                                />
                              ) : /\.png|\.jpg|\.jpeg|\.gif/i.test(a.url) ? (
                                <img
                                  src={a.url}
                                  alt="artifact"
                                  className="w-full max-h-56 object-contain rounded border"
                                />
                              ) : null)}
                            {a.url &&
                              !/\.mp4|\.webm|\.png|\.jpg|\.jpeg|\.gif/i.test(
                                a.url,
                              ) && (
                                <a
                                  className="text-blue-600 underline"
                                  href={a.url}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {a.url}
                                </a>
                              )}
                            {a.url && (
                              <div className="mt-1">
                                <button
                                  className="rounded border px-2 py-0.5 text-[10px]"
                                  onClick={() => {
                                    if (!compareAUrl) setCompareAUrl(a.url!);
                                    else if (!compareBUrl)
                                      setCompareBUrl(a.url!);
                                    else {
                                      setCompareAUrl(a.url!);
                                      setCompareBUrl(null);
                                    }
                                  }}
                                >
                                  Select for compare
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="mt-2 flex items-center gap-2">
                    {j.status === "queued" && (
                      <button
                        className="rounded border px-2 py-1 text-xs"
                        onClick={async () => {
                          try {
                            const res = await fetch(
                              `${apiBase}/jobs/${j.id}/cancel`,
                              { method: "POST" },
                            );
                            if (res.ok)
                              show({ title: "Cancelled", variant: "success" });
                            else if (res.status === 409)
                              show({
                                title: "Not cancellable",
                                description: "Job already processing",
                                variant: "error",
                              });
                            else
                              show({
                                title: "Cancel failed",
                                variant: "error",
                              });
                          } catch (e: any) {
                            show({
                              title: "Cancel failed",
                              description: String(e?.message || e),
                              variant: "error",
                            });
                          }
                        }}
                      >
                        Cancel
                      </button>
                    )}
                    <button
                      className="rounded border px-2 py-1 text-xs"
                      onClick={async () => {
                        try {
                          await fetch(`${apiBase}/jobs/${j.id}/decision`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ decision: "approved" }),
                          });
                          show({ title: "Approved", variant: "success" });
                        } catch {
                          show({ title: "Approve failed", variant: "error" });
                        }
                      }}
                    >
                      Approve
                    </button>
                    <button
                      className="rounded border px-2 py-1 text-xs"
                      onClick={async () => {
                        const note = prompt("Reason?") || "";
                        try {
                          await fetch(`${apiBase}/jobs/${j.id}/decision`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              decision: "rejected",
                              note,
                            }),
                          });
                          show({ title: "Rejected", variant: "success" });
                        } catch {
                          show({ title: "Reject failed", variant: "error" });
                        }
                      }}
                    >
                      Reject
                    </button>
                    <button
                      className="rounded border px-2 py-1 text-xs"
                      onClick={async () => {
                        try {
                          const payload = await promptRerunPayload(j);
                          if (!payload) return;
                          const res = await fetch(
                            `${apiBase}/jobs/${j.id}/rerun`,
                            {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ payload }),
                            },
                          );
                          const data = await res.json();
                          if (res.ok)
                            show({ title: "Rerun queued", variant: "success" });
                          else
                            show({
                              title: "Rerun failed",
                              description: String(
                                data?.error || res.statusText,
                              ),
                              variant: "error",
                            });
                        } catch (e: any) {
                          show({
                            title: "Rerun failed",
                            description: String(e?.message || e),
                            variant: "error",
                          });
                        }
                      }}
                    >
                      Re-run
                    </button>
                    <button
                      className="rounded border px-2 py-1 text-xs"
                      onClick={async () => {
                        try {
                          // For same-seed rerun, prompt for the last scene/manifest and inject seed
                          const payload = await promptRerunPayload(j);
                          if (!payload) return;
                          if (j.seed && payload?.model_inputs)
                            payload.model_inputs.seed = j.seed;
                          const res = await fetch(
                            `${apiBase}/jobs/${j.id}/rerun`,
                            {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ payload }),
                            },
                          );
                          const data = await res.json();
                          if (res.ok)
                            show({
                              title: "Re-run with seed queued",
                              variant: "success",
                            });
                          else
                            show({
                              title: "Re-run failed",
                              description: String(
                                data?.error || res.statusText,
                              ),
                              variant: "error",
                            });
                        } catch (e: any) {
                          show({
                            title: "Re-run failed",
                            description: String(e?.message || e),
                            variant: "error",
                          });
                        }
                      }}
                    >
                      Re-run (same seed)
                    </button>
                    <button
                      className="rounded border px-2 py-1 text-xs"
                      onClick={async () => {
                        try {
                          const payload = await promptRerunPayload(j);
                          if (!payload) return;
                          if (payload?.model_inputs)
                            payload.model_inputs.seed = Math.floor(
                              Math.random() * 1_000_000_000,
                            );
                          const res = await fetch(
                            `${apiBase}/jobs/${j.id}/rerun`,
                            {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ payload }),
                            },
                          );
                          const data = await res.json();
                          if (res.ok)
                            show({
                              title: "Duplicate with new seed queued",
                              variant: "success",
                            });
                          else
                            show({
                              title: "Duplicate failed",
                              description: String(
                                data?.error || res.statusText,
                              ),
                              variant: "error",
                            });
                        } catch (e: any) {
                          show({
                            title: "Duplicate failed",
                            description: String(e?.message || e),
                            variant: "error",
                          });
                        }
                      }}
                    >
                      Duplicate (new seed)
                    </button>
                    <button
                      className="rounded border px-2 py-1 text-xs"
                      onClick={() => setDrawerJobId(j.id)}
                    >
                      Open job drawer
                    </button>
                  </div>
                </div>
              ))}
              {items.length === 0 && (
                <div className="text-sm text-gray-500">No jobs yet.</div>
              )}
            </div>
          )}
        </section>
        {drawerJobId && (
          <div className="fixed inset-0 z-50 flex justify-end">
            <div
              className="absolute inset-0 bg-black/30"
              onClick={() => setDrawerJobId(null)}
            />
            <div className="relative h-full w-full max-w-md bg-white shadow-xl border-l p-4 overflow-auto">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">Job details</div>
                <button
                  className="text-xs underline"
                  onClick={() => setDrawerJobId(null)}
                >
                  Close
                </button>
              </div>
              {!drawerJob ? (
                <div className="mt-3 text-sm text-gray-600">Loading…</div>
              ) : (
                <div className="mt-3 space-y-2 text-xs">
                  <div>
                    id: <span className="font-mono">{drawerJob.id}</span>
                  </div>
                  <div>
                    type: <span className="font-mono">{drawerJob.type}</span>
                  </div>
                  <div>
                    status:{" "}
                    <span className="font-mono">{drawerJob.status}</span>
                  </div>
                  {drawerJob.prediction_id && (
                    <div>
                      prediction_id:{" "}
                      <span className="font-mono">
                        {drawerJob.prediction_id}
                      </span>
                    </div>
                  )}
                  {drawerJob.model_version && (
                    <div>
                      model_version:{" "}
                      <span className="font-mono">
                        {drawerJob.model_version}
                      </span>
                    </div>
                  )}
                  {typeof drawerJob.duration_ms === "number" && (
                    <div>
                      duration_ms:{" "}
                      <span className="font-mono">
                        {String(drawerJob.duration_ms)}
                      </span>
                    </div>
                  )}
                  {typeof drawerJob.cost_usd === "number" && (
                    <div>
                      cost_usd:{" "}
                      <span className="font-mono">
                        {Number(drawerJob.cost_usd).toFixed(2)}
                      </span>
                    </div>
                  )}
                  {Array.isArray(drawerJob.artifacts) &&
                    drawerJob.artifacts.length > 0 && (
                      <div className="mt-2">
                        <div className="text-gray-700">Artifacts</div>
                        <pre className="rounded border bg-gray-50 p-2 max-h-40 overflow-auto">
                          {JSON.stringify(drawerJob.artifacts, null, 2)}
                        </pre>
                      </div>
                    )}
                  {Array.isArray(drawerJob.costs) &&
                    drawerJob.costs.length > 0 && (
                      <div className="mt-2">
                        <div className="text-gray-700">Cost ledger</div>
                        <pre className="rounded border bg-gray-50 p-2 max-h-40 overflow-auto">
                          {JSON.stringify(drawerJob.costs, null, 2)}
                        </pre>
                      </div>
                    )}
                  {drawerJob.job_meta && (
                    <div className="mt-2">
                      <div className="text-gray-700">
                        Job meta (request/response)
                      </div>
                      <pre className="rounded border bg-gray-50 p-2 max-h-60 overflow-auto">
                        {JSON.stringify(drawerJob.job_meta, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function promptRerunPayload(job: Job): Promise<any | null> {
  return new Promise((resolve) => {
    const hint =
      job.type === "scene_render"
        ? "scene spec JSON"
        : job.type === "video_assemble"
          ? "video manifest JSON"
          : "payload JSON";
    const input = prompt(`Paste ${hint} to rerun:`) || "";
    if (!input.trim()) return resolve(null);
    try {
      const parsed = JSON.parse(input);
      resolve(parsed);
    } catch (e) {
      alert("Invalid JSON");
      resolve(null);
    }
  });
}
