import Link from "next/link";
import { useRouter } from "next/router";
import PageHeader from "../components/PageHeader";
import { Card } from "../components/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "../components/Toast";
import { fetchWithAuth } from "../lib/http";
import { Badge, Button, Tooltip } from "../components/ui";
import QuickTour from "../components/QuickTour";

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
  job_meta?: any;
};

export default function RendersPage() {
  const router = useRouter();
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
  const [compareAThumbs, setCompareAThumbs] = useState<string[]>([]);
  const [compareBThumbs, setCompareBThumbs] = useState<string[]>([]);
  const thumbsTaskA = useRef<number>(0);
  const thumbsTaskB = useRef<number>(0);
  const thumbsTimerA = useRef<ReturnType<typeof setTimeout> | null>(null);
  const thumbsTimerB = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [drawerJobId, setDrawerJobId] = useState<string | null>(null);
  const [drawerJob, setDrawerJob] = useState<any | null>(null);
  const [lastEventByJob, setLastEventByJob] = useState<
    Record<string, { step?: string; attempt_count?: number; status?: string }>
  >({});
  // Build-a-video picker state
  const [pickerOpen, setPickerOpen] = useState<boolean>(false);
  const [pickerBusy, setPickerBusy] = useState<boolean>(false);
  const [pickerScenes, setPickerScenes] = useState<
    Array<{ sceneId: string; thumbUrl: string; jobId: string }>
  >([]);
  const [selectedSceneId, setSelectedSceneId] = useState<string>("");
  const [selectedRefUrl, setSelectedRefUrl] = useState<string>("");

  async function loadPickerScenes() {
    try {
      setPickerBusy(true);
      const res = await fetch(`${apiBase}/jobs/recent?limit=100`);
      const data = await res.json();
      const items: any[] = Array.isArray(data.items) ? data.items : [];
      const scenes: Array<{
        sceneId: string;
        thumbUrl: string;
        jobId: string;
      }> = [];
      for (const j of items) {
        if (j?.type !== "scene_render" || j?.status !== "succeeded") continue;
        let sceneId: string | null = null;
        try {
          if (j?.job_meta?.request?.scene_id)
            sceneId = String(j.job_meta.request.scene_id);
        } catch {}
        const a = Array.isArray(j?.artifacts) ? j.artifacts : [];
        const img = a.find(
          (x: any) =>
            typeof x?.url === "string" && /\.(png|jpg|jpeg|gif)$/i.test(x.url),
        );
        if (!sceneId) {
          const m = String(img?.url || "").match(
            /([a-z0-9_\-]{3,})\.(png|jpg|jpeg|gif)/i,
          );
          if (m) sceneId = m[1];
        }
        if (!sceneId) continue;
        scenes.push({ sceneId, thumbUrl: img?.url || "", jobId: j.id });
      }
      setPickerScenes(scenes);
    } catch {
      setPickerScenes([]);
    } finally {
      setPickerBusy(false);
    }
  }

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

  function scheduleThumbs(which: "A" | "B", url: string) {
    if (which === "A") {
      if (thumbsTimerA.current) clearTimeout(thumbsTimerA.current);
      thumbsTimerA.current = setTimeout(() => {
        thumbsTaskA.current++;
        const thisId = thumbsTaskA.current;
        void generateThumbs(url).then((arr) => {
          if (thisId === thumbsTaskA.current) setCompareAThumbs(arr);
        });
      }, 200);
    } else {
      if (thumbsTimerB.current) clearTimeout(thumbsTimerB.current);
      thumbsTimerB.current = setTimeout(() => {
        thumbsTaskB.current++;
        const thisId = thumbsTaskB.current;
        void generateThumbs(url).then((arr) => {
          if (thisId === thumbsTaskB.current) setCompareBThumbs(arr);
        });
      }, 200);
    }
  }

  useEffect(() => {
    fetchData();
    const timer = setInterval(fetchData, 4000);
    return () => {
      clearInterval(timer);
    };
  }, [apiBase, tick]);

  useEffect(() => {
    const es = new EventSource(`${apiBase}/jobs/stream`);
    const onJob = (ev: MessageEvent) => {
      setTick((t) => t + 1);
      try {
        const evt = JSON.parse((ev as MessageEvent).data || "{}");
        if (evt && evt.id) {
          setLastEventByJob((prev) => ({
            ...prev,
            [evt.id]: {
              step: evt?.progress?.step,
              attempt_count: evt?.attempt_count,
              status: evt?.status,
            },
          }));
        }
      } catch {}
    };
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
    <main className="min-h-dvh">
      <div className="mx-auto max-w-5xl p-6 space-y-6">
        <PageHeader
          title="Renders"
          description="Preview outputs, compare, approve or re-run. Status and costs shown per job."
        />
        <QuickTour
          storageKey="gpt5video_quick_tour_renders"
          steps={[
            {
              id: "compare",
              title: "Compare two outputs",
              description:
                "Click ‘Select for compare’ on two images or videos to view them side-by-side with thumbnails.",
            },
            {
              id: "approve",
              title: "Approve or reject",
              description:
                "Use Approve to mark a keeper or Reject to leave a note on why it’s not usable.",
            },
            {
              id: "rerun",
              title: "Re-run options",
              description:
                "Re-run queues a new job. Use ‘same seed’ for consistency or ‘duplicate (new seed)’ to explore variants.",
            },
            {
              id: "drawer",
              title: "Open job drawer",
              description:
                "See raw request/response, costs, model version and seed for auditability.",
            },
          ]}
        />
        <header className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Renders</h1>
          <nav className="flex gap-4 text-sm">
            <Link className="text-blue-600 underline" href="/">
              Dashboard
            </Link>
          </nav>
        </header>
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-medium">Recent renders</div>
            <Button
              size="sm"
              variant="primary"
              className="bg-accent-600 from-accent-600 to-accent-700 text-white"
              aria-label="Build a video"
              onClick={async () => {
                setPickerOpen(true);
                await loadPickerScenes();
              }}
            >
              Build a video
            </Button>
          </div>
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
                    <div>
                      <video
                        src={compareAUrl}
                        controls
                        className="w-full max-h-80 object-contain"
                        onLoadedData={() => scheduleThumbs("A", compareAUrl)}
                      />
                      {compareAThumbs.length > 0 && (
                        <div className="mt-1 flex items-center gap-2 overflow-x-auto">
                          {compareAThumbs.map((u, i) => (
                            <img
                              key={i}
                              src={u}
                              className="h-12 w-auto rounded border"
                            />
                          ))}
                        </div>
                      )}
                    </div>
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
                    <div>
                      <video
                        src={compareBUrl}
                        controls
                        className="w-full max-h-80 object-contain"
                        onLoadedData={() => scheduleThumbs("B", compareBUrl)}
                      />
                      {compareBThumbs.length > 0 && (
                        <div className="mt-1 flex items-center gap-2 overflow-x-auto">
                          {compareBThumbs.map((u, i) => (
                            <img
                              key={i}
                              src={u}
                              className="h-12 w-auto rounded border"
                            />
                          ))}
                        </div>
                      )}
                    </div>
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
                <div
                  key={j.id}
                  className="rounded border p-3 space-y-2 bg-white/95"
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <Badge className="capitalize">{j.type}</Badge>
                      <Badge
                        variant={
                          j.status === "succeeded"
                            ? "success"
                            : j.status === "failed"
                              ? "error"
                              : j.status === "processing"
                                ? "info"
                                : "warning"
                        }
                        className="capitalize"
                      >
                        {j.status}
                      </Badge>
                      {lastEventByJob[j.id]?.step && (
                        <Badge variant="default">
                          {lastEventByJob[j.id].step}
                        </Badge>
                      )}
                      {typeof lastEventByJob[j.id]?.attempt_count ===
                        "number" && (
                        <Badge variant="default">
                          #{lastEventByJob[j.id]!.attempt_count}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {typeof (j as any).cost_estimate_usd === "number" && (
                        <Badge variant="warning">
                          est ${Number((j as any).cost_estimate_usd).toFixed(2)}
                        </Badge>
                      )}
                      {typeof (j as any).cost_actual_usd === "number" &&
                        Number((j as any).cost_actual_usd) > 0 && (
                          <Badge variant="info">
                            ${Number((j as any).cost_actual_usd).toFixed(2)}
                          </Badge>
                        )}
                    </div>
                  </div>
                  <div className="text-xs text-gray-600">
                    id: <span className="font-mono">{j.id}</span>
                  </div>
                  {typeof (j as any).attempt_count === "number" && (
                    <div className="text-xs text-gray-600">
                      attempts: {String((j as any).attempt_count)}
                    </div>
                  )}
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
                      <Badge variant="warning">
                        Est ${Number((j as any).cost_estimate_usd).toFixed(2)}
                      </Badge>
                    )}
                    {typeof (j as any).cost_actual_usd === "number" &&
                      Number((j as any).cost_actual_usd) > 0 && (
                        <Badge variant="info">
                          Actual $
                          {Number((j as any).cost_actual_usd).toFixed(2)}
                        </Badge>
                      )}
                  </div>
                  {!!j.artifacts?.length && (
                    <div className="mt-2">
                      <div className="text-xs text-gray-600">Artifacts</div>
                      <div className="mt-1 space-y-1">
                        {j.artifacts!.map((a, ai) => (
                          <div key={`${a.id}-${ai}`} className="text-xs">
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
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  aria-label="Select for compare"
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
                                </Button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {j.status === "queued" && (
                      <Tooltip label="Cancel a queued job">
                        <Button
                          size="sm"
                          variant="danger"
                          aria-label="Cancel job"
                          onClick={async () => {
                            try {
                              const res = await fetchWithAuth(
                                `${apiBase}/jobs/${j.id}/cancel`,
                                { method: "POST" },
                              );
                              if (res.ok)
                                show({
                                  title: "Cancelled",
                                  variant: "success",
                                });
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
                        </Button>
                      </Tooltip>
                    )}
                    <Button
                      size="sm"
                      variant="primary"
                      aria-label="Approve job"
                      onClick={async () => {
                        try {
                          await fetchWithAuth(
                            `${apiBase}/jobs/${j.id}/decision`,
                            {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ decision: "approved" }),
                            },
                          );
                          show({ title: "Approved", variant: "success" });
                        } catch {
                          show({ title: "Approve failed", variant: "error" });
                        }
                      }}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      aria-label="Reject job"
                      onClick={async () => {
                        const note = prompt("Reason?") || "";
                        try {
                          await fetchWithAuth(
                            `${apiBase}/jobs/${j.id}/decision`,
                            {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                decision: "rejected",
                                note,
                              }),
                            },
                          );
                          show({ title: "Rejected", variant: "success" });
                        } catch {
                          show({ title: "Reject failed", variant: "error" });
                        }
                      }}
                    >
                      Reject
                    </Button>
                    <Tooltip label="Queue a new job with edited JSON">
                      <Button
                        size="sm"
                        variant="secondary"
                        aria-label="Re-run job"
                        onClick={async () => {
                          try {
                            const payload = await promptRerunPayload(j);
                            if (!payload) return;
                            const res = await fetchWithAuth(
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
                                title: "Rerun queued",
                                variant: "success",
                              });
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
                      </Button>
                    </Tooltip>
                    <Tooltip label="Re-run using the same seed for consistency">
                      <Button
                        size="sm"
                        variant="secondary"
                        aria-label="Re-run with same seed"
                        onClick={async () => {
                          try {
                            const payload = await promptRerunPayload(j);
                            if (!payload) return;
                            if (j.seed && payload?.model_inputs)
                              payload.model_inputs.seed = j.seed;
                            const res = await fetchWithAuth(
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
                      </Button>
                    </Tooltip>
                    <Tooltip label="Duplicate with a new random seed to explore variants">
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label="Duplicate with new seed"
                        onClick={async () => {
                          try {
                            const payload = await promptRerunPayload(j);
                            if (!payload) return;
                            if (payload?.model_inputs)
                              payload.model_inputs.seed = Math.floor(
                                Math.random() * 1_000_000_000,
                              );
                            const res = await fetchWithAuth(
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
                      </Button>
                    </Tooltip>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label="Open job drawer"
                      onClick={() => setDrawerJobId(j.id)}
                    >
                      Open job drawer
                    </Button>
                  </div>
                </div>
              ))}
              {items.length === 0 && (
                <div className="text-sm text-gray-500">No jobs yet.</div>
              )}
            </div>
          )}
        </Card>
        {pickerOpen && (
          <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
            <div
              className="absolute inset-0 bg-black/30"
              onClick={() => setPickerOpen(false)}
            />
            <div className="relative m-4 w-full max-w-3xl rounded-md border bg-white p-4 shadow-elevated">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">
                  Select scenes to assemble
                </div>
                <button
                  className="text-xs underline"
                  onClick={() => setPickerOpen(false)}
                >
                  Close
                </button>
              </div>
              <div className="mt-3 text-xs text-gray-600">
                Pick the scene_ids you want in your video. These come from your
                succeeded image renders.
              </div>
              <div className="mt-3">
                {pickerBusy ? (
                  <div className="text-sm text-gray-600">Loading…</div>
                ) : pickerScenes.length === 0 ? (
                  <div className="text-sm text-gray-600">
                    No recent scenes found.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {pickerScenes.map((sc, idx) => {
                      const checked = selectedSceneId === sc.sceneId;
                      return (
                        <label
                          key={`${sc.jobId}-${sc.sceneId}-${idx}`}
                          className={`rounded border p-2 flex gap-2 items-center cursor-pointer select-none ${checked ? "ring-2 ring-accent-600" : ""}`}
                        >
                          <input
                            type="radio"
                            name="scene-pick"
                            className="mt-0.5"
                            checked={checked}
                            onChange={() => {
                              setSelectedSceneId(sc.sceneId);
                              setSelectedRefUrl(sc.thumbUrl || "");
                            }}
                          />
                          {sc.thumbUrl ? (
                            <img
                              src={sc.thumbUrl}
                              alt="thumb"
                              className="h-16 w-12 object-cover rounded border"
                            />
                          ) : (
                            <div className="h-16 w-12 rounded border bg-gray-50" />
                          )}
                          <span className="font-mono text-xs">
                            {sc.sceneId}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="mt-4 flex items-center justify-end">
                <Button
                  onClick={() => {
                    const order = selectedSceneId ? [selectedSceneId] : [];
                    if (order.length === 0) return;
                    const params = new URLSearchParams();
                    params.set("order", order.join(","));
                    if (selectedRefUrl) params.set("ref", selectedRefUrl);
                    router.push(`/video-assemble?${params.toString()}`);
                  }}
                  disabled={!selectedSceneId}
                >
                  Continue to Video
                </Button>
              </div>
            </div>
          </div>
        )}
        {drawerJobId && (
          <div className="fixed inset-0 z-50 flex justify-end">
            <div
              className="absolute inset-0 bg-black/30"
              onClick={() => setDrawerJobId(null)}
            />
            <div className="relative h-full w-full max-w-md bg-white/95 backdrop-blur shadow-xl border-l p-4 overflow-auto">
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

async function generateThumbs(url: string, count = 5): Promise<string[]> {
  try {
    const video = document.createElement("video");
    video.src = url;
    video.crossOrigin = "anonymous";
    video.muted = true;
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = reject as any;
    });
    const duration = isFinite(video.duration) ? video.duration : 0;
    if (!duration) return [];
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return [];
    const vw = video.videoWidth || 1920;
    const vh = video.videoHeight || 1080;
    const width = 200;
    const height = Math.round(width * (vh / vw));
    canvas.width = width;
    canvas.height = height;
    const captures: string[] = [];
    for (let i = 1; i <= count; i++) {
      const t = (duration * i) / (count + 1);
      await new Promise<void>((resolve) => {
        const onSeeked = () => {
          ctx.drawImage(video, 0, 0, width, height);
          try {
            captures.push(canvas.toDataURL("image/jpeg", 0.7));
          } catch {}
          resolve();
        };
        video.currentTime = t;
        video.onseeked = onSeeked;
      });
    }
    const result = captures.slice(0);
    try {
      video.src = "";
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      video.load?.();
    } catch {}
    return result;
  } catch {
    return [];
  }
}

// scheduleThumbs is defined inside the component to access state/refs

// Load recent scene_render jobs and derive scene_id with a representative image
async function loadPickerScenes(this: void) {
  try {
    const base = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";
    const res = await fetch(`${base}/jobs/recent?limit=100`);
    const data = await res.json();
    const items = Array.isArray(data.items) ? data.items : [];
    const scenes: Array<{ sceneId: string; thumbUrl: string; jobId: string }> =
      [];
    for (const j of items) {
      if (j?.type !== "scene_render" || j?.status !== "succeeded") continue;
      // Derive scene_id from persisted job_meta.request.scene_id if present
      let sceneId: string | null = null;
      try {
        if (j?.job_meta?.request?.scene_id)
          sceneId = String(j.job_meta.request.scene_id);
      } catch {}
      // Fallback: try first artifact image filename pattern containing a scene id-like token
      const a = Array.isArray(j?.artifacts) ? j.artifacts : [];
      const img = a.find(
        (x: any) =>
          typeof x?.url === "string" && /\.(png|jpg|jpeg|gif)$/i.test(x.url),
      );
      if (!sceneId) {
        const m = String(img?.url || "").match(
          /([a-z0-9_\-]{3,})\.(png|jpg|jpeg|gif)/i,
        );
        if (m) sceneId = m[1];
      }
      if (!sceneId) continue;
      scenes.push({ sceneId, thumbUrl: img?.url || "", jobId: j.id });
    }
    // @ts-ignore - access component state via window event
    (window as any).setBuildVideoPicker?.(scenes);
  } catch {}
}
