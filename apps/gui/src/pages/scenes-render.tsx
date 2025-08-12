import Link from "next/link";
import PageHeader from "../components/PageHeader";
import { Card } from "../components/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Tooltip } from "../components/ui";
import QuickTour from "../components/QuickTour";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import sceneSpecsLineSchema from "../../../../packages/schemas/schemas/scene_specs_line.schema.json";
import { ajv } from "@gpt5video/shared";
import { addJob, updateJob } from "../lib/jobs";
import { fetchWithAuth } from "../lib/http";
import { useToast } from "../components/Toast";

export default function ScenesRenderPage() {
  const apiBase = useMemo(
    () => process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000",
    [],
  );
  const [text, setText] = useState<string>(() =>
    JSON.stringify(exampleScene, null, 2),
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [resp, setResp] = useState<any>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [sseEvents, setSseEvents] = useState<
    Array<{
      ts: number;
      step?: string;
      status?: string;
      attempt_count?: number;
    }>
  >([]);
  const validate = useMemo(() => ajv.compile(sceneSpecsLineSchema as any), []);
  const { show } = useToast();

  function validateText(t: string) {
    try {
      const parsed = JSON.parse(t);
      const ok = validate(parsed);
      if (!ok)
        setErrors(
          (validate.errors || []).map(
            (e) => `${e.instancePath || "/"} ${e.message || "invalid"}`,
          ),
        );
      else setErrors([]);
      return ok ? parsed : null;
    } catch (err: any) {
      setErrors([`JSON parse error: ${err?.message || String(err)}`]);
      return null;
    }
  }

  async function submit() {
    const scene = validateText(text);
    if (!scene) return;
    const provisionalId = `scene_render_${Date.now()}`;
    addJob({
      id: provisionalId,
      type: "scene_render",
      status: "queued",
      createdAt: Date.now(),
    });
    const res = await fetchWithAuth(`${apiBase}/scenes/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scene }),
    });
    const data = await res.json();
    setResp({ ok: res.ok, data });
    if (res.ok) {
      if (typeof data?.id === "string") setJobId(data.id);
      updateJob(provisionalId, {
        status: "succeeded",
        completedAt: Date.now(),
        durationMs:
          typeof data?.duration_ms === "number" ? data.duration_ms : undefined,
        predictionId: data?.prediction_id,
        modelVersion: data?.model_version,
        seed: typeof data?.seed === "number" ? data.seed : null,
        runId: data?.run_id,
      });
      show({ title: "Scene rendered", variant: "success" });
    } else {
      updateJob(provisionalId, {
        status: "failed",
        completedAt: Date.now(),
        error: String(data?.error || res.statusText),
      });
      show({
        title: "Render failed",
        description: String(data?.error || res.statusText),
        variant: "error",
      });
    }
  }

  async function queueBatch(count = 15) {
    const scene: any = validateText(text);
    if (!scene) return show({ title: "Invalid scene spec", variant: "error" });
    let okCount = 0;
    for (let i = 0; i < count; i++) {
      const seed = Math.floor(Math.random() * 1_000_000_000);
      const payload = {
        ...scene,
        model_inputs: { ...(scene.model_inputs || {}), seed },
      };
      try {
        const res = await fetchWithAuth(`${apiBase}/scenes/render`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scene: payload }),
        });
        if (res.ok) okCount++;
      } catch {}
      // small gap to avoid thundering herd
      await new Promise((r) => setTimeout(r, 75));
    }
    show({
      title: `Batch queued (${okCount}/${count})`,
      variant: okCount === count ? "success" : okCount > 0 ? "info" : "error",
    });
  }

  const contentType =
    typeof resp?.data?.output === "string" &&
    resp?.data?.output?.match(/\.mp4|\.webm|\.gif|\.png|\.jpg/i)
      ? resp.data.output.endsWith(".mp4") || resp.data.output.endsWith(".webm")
        ? "video"
        : "image"
      : undefined;

  const outputs: string[] = Array.isArray(resp?.data?.output)
    ? resp.data.output
    : resp?.data?.output
      ? [resp.data.output]
      : [];
  const [guardrailWarning, setGuardrailWarning] = useState(false);
  const [thumbsByIndex, setThumbsByIndex] = useState<Record<number, string[]>>(
    {},
  );
  const thumbTimers = useRef<
    Record<number, ReturnType<typeof setTimeout> | null>
  >({});

  // Subscribe to SSE and collect step feed for this job
  useEffect(() => {
    if (!jobId) return;
    const es = new EventSource(`${apiBase}/jobs/stream`);
    const onJob = (ev: MessageEvent) => {
      try {
        const evt = JSON.parse(ev.data || "{}");
        if (evt && evt.id === jobId) {
          const step: string | undefined = evt?.progress?.step;
          const status: string | undefined = evt?.status;
          const attempt_count: number | undefined = evt?.attempt_count;
          setSseEvents((prev) =>
            [...prev, { ts: Date.now(), step, status, attempt_count }].slice(
              -25,
            ),
          );
          if (step === "rejected_guardrail") setGuardrailWarning(true);
        }
      } catch {}
    };
    es.addEventListener("job", onJob as any);
    return () => {
      es.removeEventListener("job", onJob as any);
      es.close();
    };
  }, [apiBase, jobId]);

  function scheduleThumbsFor(index: number, url: string) {
    if (thumbTimers.current[index]) clearTimeout(thumbTimers.current[index]!);
    thumbTimers.current[index] = setTimeout(() => {
      void generateThumbs(url).then((arr: string[]) =>
        setThumbsByIndex((prev) => ({ ...prev, [index]: arr })),
      );
    }, 200);
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
        // eslint-disable-next-line no-await-in-loop
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
      try {
        video.src = "";
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        video.load?.();
      } catch {}
      return captures;
    } catch {
      return [];
    }
  }

  return (
    <main className="min-h-dvh bg-gray-50">
      <div className="mx-auto max-w-5xl p-6 space-y-6">
        <QuickTour
          steps={[
            {
              id: "paste",
              title: "Paste JSON",
              description: "Provide a valid scene spec (schema-checked).",
            },
            {
              id: "render",
              title: "Render",
              description: "Queue a render and watch live chips update.",
            },
            {
              id: "outputs",
              title: "Outputs",
              description: "Preview frames and a lightweight filmstrip.",
            },
          ]}
          storageKey="gpt5video_quick_tour_render"
        />
        <PageHeader
          title="Scenes Render"
          description="Paste a valid scene spec and queue renders. Watch live status and preview outputs."
          actions={
            <div className="flex items-center gap-2">
              {jobId && (
                <>
                  <Badge variant="info">job {jobId}</Badge>
                  {sseEvents.at(-1)?.status && (
                    <Badge variant="default">{sseEvents.at(-1)!.status}</Badge>
                  )}
                  {typeof sseEvents.at(-1)?.attempt_count === "number" && (
                    <Badge variant="default">
                      #{sseEvents.at(-1)!.attempt_count}
                    </Badge>
                  )}
                  {sseEvents.at(-1)?.step && (
                    <Badge variant="default">{sseEvents.at(-1)!.step}</Badge>
                  )}
                </>
              )}
              {resp?.data?.cost_estimate_usd != null && (
                <Badge variant="warning">
                  est ${Number(resp.data.cost_estimate_usd).toFixed(2)}
                </Badge>
              )}
              {resp?.data?.cost_actual_usd != null &&
                Number(resp.data.cost_actual_usd) > 0 && (
                  <Badge variant="info">
                    ${Number(resp.data.cost_actual_usd).toFixed(2)}
                  </Badge>
                )}
              {guardrailWarning && (
                <Badge variant="warning">Guardrail warning</Badge>
              )}
            </div>
          }
        />
        <nav className="flex gap-4 text-sm">
          <Link
            className="text-accent-700 underline focus-visible:ring-2 focus-visible:ring-accent-600 focus-visible:ring-offset-2 rounded outline-none"
            href="/"
          >
            Dashboard
          </Link>
        </nav>
        <Card>
          <div className="mb-3 text-sm text-gray-700">
            Paste a valid scene spec, submit to render, and preview outputs.
          </div>
          <div className="grid grid-cols-2 gap-4">
            <textarea
              className="h-[420px] w-full resize-vertical rounded border p-2 font-mono text-xs"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                validateText(e.target.value);
              }}
            />
            <div className="flex flex-col">
              <div className="text-sm font-medium">Validation</div>
              <div className="mt-2 flex-1 overflow-auto rounded border bg-gray-50 p-2 text-xs">
                {errors.length === 0 ? (
                  <div className="text-green-700">Valid ✔︎</div>
                ) : (
                  <ul className="list-disc pl-4">
                    {errors.map((e, i) => (
                      <li key={i} className="text-red-700">
                        {e}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="mt-3 flex items-center gap-3">
                <Button
                  onClick={submit}
                  disabled={errors.length > 0}
                  aria-label="Render"
                >
                  Render
                </Button>
                <Tooltip label="Insert an example spec for Ideogram Character">
                  <Button
                    variant="secondary"
                    onClick={() =>
                      setText(JSON.stringify(exampleScene, null, 2))
                    }
                    aria-label="Insert Ideogram preset"
                  >
                    Insert preset
                  </Button>
                </Tooltip>
                <Tooltip label="Queues 15 predictions with random seeds">
                  <Button
                    variant="secondary"
                    onClick={() => void queueBatch(15)}
                    disabled={errors.length > 0}
                    aria-label="Queue 15 renders"
                  >
                    Queue 15 renders
                  </Button>
                </Tooltip>
              </div>
              {resp && (
                <div className="mt-3 space-y-2 text-sm">
                  <div className="text-gray-700">
                    prediction_id:{" "}
                    <span className="font-mono">
                      {resp.data?.prediction_id}
                    </span>
                  </div>
                  <div className="text-gray-700">
                    model_version:{" "}
                    <span className="font-mono">
                      {resp.data?.model_version}
                    </span>
                  </div>
                  {typeof resp.data?.seed === "number" && (
                    <div className="inline-flex items-center gap-2">
                      <span className="text-xs rounded bg-gray-100 px-1.5 py-0.5">
                        seed
                      </span>
                      <span className="font-mono text-xs">
                        {String(resp.data.seed)}
                      </span>
                    </div>
                  )}
                  <div className="text-gray-700">
                    duration_ms:{" "}
                    <span className="font-mono">
                      {String(resp.data?.duration_ms ?? "")}
                    </span>
                  </div>
                  <div className="text-gray-700">
                    status:{" "}
                    <span className="font-mono">{resp.data?.status}</span>
                  </div>
                  <div className="text-gray-700">
                    run_id:{" "}
                    <span className="font-mono">
                      {String(resp.data?.run_id ?? "")}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>
        {jobId && (
          <Card>
            <div className="text-sm font-medium mb-2">Live status</div>
            <div className="flex items-center gap-2 text-xs mb-2">
              <span className="text-gray-600">job</span>
              <span className="font-mono">{jobId}</span>
            </div>
            <div className="space-y-1 text-xs">
              {sseEvents.map((e, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-gray-500 w-28">
                    {new Date(e.ts).toLocaleTimeString()}
                  </span>
                  {typeof e.attempt_count === "number" && (
                    <span className="rounded bg-gray-100 px-1 py-0.5">
                      #{e.attempt_count}
                    </span>
                  )}
                  {e.step && (
                    <span className="rounded bg-gray-50 px-1.5 py-0.5 text-gray-800">
                      {e.step}
                    </span>
                  )}
                  {e.status && (
                    <span className="text-gray-600">{e.status}</span>
                  )}
                </div>
              ))}
              {sseEvents.length === 0 && (
                <div className="text-gray-500">Waiting for events…</div>
              )}
            </div>
          </Card>
        )}
        {!!outputs.length && (
          <Card>
            <div className="text-sm font-medium mb-2">Outputs</div>
            <div className="grid grid-cols-3 gap-3">
              {outputs.map((u, i) => (
                <div key={i} className="rounded border p-2">
                  {/\.mp4|\.webm/i.test(u) ? (
                    <div>
                      <video
                        src={u}
                        controls
                        className="max-h-60 w-full object-contain"
                        onLoadedData={() => scheduleThumbsFor(i, u)}
                      />
                      {Array.isArray(thumbsByIndex[i]) &&
                        thumbsByIndex[i]!.length > 0 && (
                          <div className="mt-1 flex items-center gap-2 overflow-x-auto">
                            {thumbsByIndex[i]!.map((t, j) => (
                              <img
                                key={j}
                                src={t}
                                className="h-12 w-auto rounded border"
                              />
                            ))}
                          </div>
                        )}
                    </div>
                  ) : /\.png|\.jpg|\.jpeg|\.gif/i.test(u) ? (
                    <img
                      src={u}
                      alt="output"
                      className="max-h-60 w-full object-contain"
                    />
                  ) : (
                    <a
                      href={u}
                      className="text-blue-600 underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {u}
                    </a>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </main>
  );
}

const exampleScene = {
  scene_id: "hook1_s1",
  duration_s: 2.0,
  composition: "tight mid on mascot, text plate right",
  props: ["phone", "chart"],
  overlays: [{ type: "lower_third", text: "Fix your loop" }],
  model: "ideogram-character",
  model_inputs: {
    prompt: "mascot in startup office, confident expression",
    character_reference_image: "https://example.com/mascot-headshot.png",
    aspect_ratio: "9:16",
    rendering_speed: "Default",
  },
};
