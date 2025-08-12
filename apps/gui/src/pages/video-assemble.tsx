import Link from "next/link";
import { useRouter } from "next/router";
import PageHeader from "../components/PageHeader";
import { useEffect, useMemo, useRef, useState } from "react";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import videoManifestSchema from "../../../../packages/schemas/schemas/video_manifest.schema.json";
import { ajv } from "@gpt5video/shared";
import { addJob, updateJob } from "../lib/jobs";
import { fetchWithAuth } from "../lib/http";
import { useToast } from "../components/Toast";
import {
  Badge,
  Button,
  SegmentedControl,
  Tabs,
  Tooltip,
} from "../components/ui";
import QuickTour from "../components/QuickTour";

export default function VideoAssemblePage() {
  const router = useRouter();
  const apiBase = useMemo(
    () => process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000",
    [],
  );
  const [text, setText] = useState<string>(() =>
    JSON.stringify(exampleManifest, null, 2),
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [resp, setResp] = useState<any>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobDetail, setJobDetail] = useState<any | null>(null);
  const [tick, setTick] = useState<number>(0);
  const [sseEvents, setSseEvents] = useState<
    Array<{
      ts: number;
      step?: string;
      status?: string;
      attempt_count?: number;
    }>
  >([]);
  const validate = useMemo(() => ajv.compile(videoManifestSchema as any), []);
  const { show } = useToast();
  const [order, setOrder] = useState<string>("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [filmstripUrls, setFilmstripUrls] = useState<string[]>([]);
  const [transitions, setTransitions] = useState<string>("hard_cuts");
  const [motion, setMotion] = useState<string>("subtle parallax");
  const [model, setModel] = useState<"veo-3" | "veo-3-fast">("veo-3-fast");
  const validateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const parsingRef = useRef<number>(0);
  // Audio tab fields
  const [audioMode, setAudioMode] = useState<"none" | "voiceover" | "dialogue">(
    "none",
  );
  const [voiceStyle, setVoiceStyle] = useState<string>("conversational_ugcs");
  const [language, setLanguage] = useState<string>("en");
  const [pace, setPace] = useState<string>("fast");
  const [volume, setVolume] = useState<string>("normal");
  const [voPrompt, setVoPrompt] = useState<string>(
    "Hey — quick one: your CAC isn’t high, your loop is broken. Fix the loop, win your market.",
  );
  const [dialogueTiming, setDialogueTiming] = useState<
    Array<{ scene_id: string; t: number; character: string; line: string }>
  >([]);
  const [refs, setRefs] = useState<
    Array<{ scene_id: string; image_url: string }>
  >([]);
  // filmstrip capture control
  const filmstripTaskIdRef = useRef<number>(0);
  const filmstripTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function syncFormFromManifest(parsed: any) {
    try {
      if (!parsed || typeof parsed !== "object") return;
      const ord: string[] = Array.isArray(parsed.order) ? parsed.order : [];
      if (ord.length) setOrder(ord.join(", "));
      if (typeof parsed.transitions === "string")
        setTransitions(parsed.transitions);
      if (typeof parsed.motion === "string") setMotion(parsed.motion);
      if (parsed.model === "veo-3" || parsed.model === "veo-3-fast")
        setModel(parsed.model);
      const a = parsed.audio || {};
      const mode = a?.mode as "none" | "voiceover" | "dialogue" | undefined;
      if (mode === "none" || mode === "voiceover" || mode === "dialogue")
        setAudioMode(mode);
      if (typeof a?.voice_style === "string") setVoiceStyle(a.voice_style);
      if (typeof a?.language === "string") setLanguage(a.language);
      if (typeof a?.pace === "string") setPace(a.pace);
      if (typeof a?.volume === "string") setVolume(a.volume);
      if (typeof a?.vo_prompt === "string") setVoPrompt(a.vo_prompt);
      if (Array.isArray(a?.dialogue_timing))
        setDialogueTiming(a.dialogue_timing);
    } catch {}
  }

  // Initialize from Renders picker (order=scene1,scene2)
  useEffect(() => {
    try {
      const q = router.query?.order as string | undefined;
      const ref = router.query?.ref as string | undefined;
      if (q && typeof q === "string") {
        const ord = q
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        if (ord.length) setOrder(ord.join(", "));
        if (ref && typeof ref === "string") {
          setRefs(() =>
            ord.slice(0, 1).map((scene_id) => ({ scene_id, image_url: ref })),
          );
        }
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.query?.order]);

  function debouncedValidateAndMaybeSync(t: string) {
    if (validateTimerRef.current) clearTimeout(validateTimerRef.current);
    const runId = ++parsingRef.current;
    validateTimerRef.current = setTimeout(() => {
      try {
        const parsed = JSON.parse(t);
        const ok = validate(parsed);
        if (runId !== parsingRef.current) return; // stale
        if (!ok) {
          setErrors(
            (validate.errors || []).map(
              (e) => `${e.instancePath || "/"} ${e.message || "invalid"}`,
            ),
          );
        } else {
          setErrors([]);
          // two-way sync: update form fields from valid JSON
          syncFormFromManifest(parsed);
        }
      } catch (err: any) {
        if (runId !== parsingRef.current) return; // stale
        // hold errors until debounce; show a single parse line
        setErrors([`JSON parse error: ${err?.message || String(err)}`]);
      }
    }, 300);
  }

  function buildManifestFromForm() {
    const orderArr = order
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const audio: any = { mode: audioMode };
    if (audioMode === "voiceover") {
      audio.provider = "veo3";
      audio.voice_style = voiceStyle;
      audio.language = language;
      audio.pace = pace;
      audio.volume = volume;
      audio.vo_prompt = voPrompt;
    } else if (audioMode === "dialogue") {
      audio.provider = "veo3";
      audio.voice_style = voiceStyle;
      audio.language = language;
      audio.pace = pace;
      audio.volume = volume;
      audio.dialogue_timing = dialogueTiming;
    }
    const candidate = {
      model,
      order: orderArr,
      transitions,
      motion,
      audio,
      refs: refs.reduce(
        (acc, r) => {
          if (r.scene_id && r.image_url) acc[r.scene_id] = r.image_url;
          return acc;
        },
        {} as Record<string, string>,
      ),
    };
    const ok = validate(candidate);
    if (!ok) {
      setErrors(
        (validate.errors || []).map(
          (e) => `${e.instancePath || "/"} ${e.message || "invalid"}`,
        ),
      );
      show({ title: "Invalid manifest", variant: "error" });
      return;
    }
    const pretty = JSON.stringify(candidate, null, 2);
    setText(pretty);
    setErrors([]);
    // Auto-assemble to reduce steps
    void submit();
  }

  const orderArray = order
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  function moveOrder(idx: number, dir: -1 | 1) {
    const next = [...orderArray];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    const tmp = next[idx];
    next[idx] = next[j];
    next[j] = tmp;
    setOrder(next.join(", "));
  }

  async function submit() {
    let manifest: any = null;
    try {
      manifest = JSON.parse(text);
    } catch {}
    if (!manifest) {
      show({ title: "Invalid manifest", variant: "error" });
      return;
    }
    const ok = validate(manifest);
    if (!ok) {
      setErrors(
        (validate.errors || []).map(
          (e) => `${e.instancePath || "/"} ${e.message || "invalid"}`,
        ),
      );
      show({ title: "Invalid manifest", variant: "error" });
      return;
    }
    if (!manifest) return;
    const provisionalId = `video_assemble_${Date.now()}`;
    addJob({
      id: provisionalId,
      type: "video_assemble",
      status: "queued",
      createdAt: Date.now(),
    });
    const res = await fetchWithAuth(`${apiBase}/videos/assemble`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ manifest }),
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
        runId: data?.run_id,
      });
      show({ title: "Video assembled", variant: "success" });
    } else {
      updateJob(provisionalId, {
        status: "failed",
        completedAt: Date.now(),
        error: String(data?.error || res.statusText),
      });
      show({
        title: "Video assemble failed",
        description: String(data?.error || res.statusText),
        variant: "error",
      });
    }
  }

  // Subscribe to SSE to refresh job detail when events occur
  useEffect(() => {
    if (!jobId) return;
    const es = new EventSource(`${apiBase}/jobs/stream`);
    const onJob = (ev: MessageEvent) => {
      setTick((t) => t + 1);
      try {
        const evt = JSON.parse((ev as MessageEvent).data || "{}");
        if (evt && evt.id === jobId) {
          setSseEvents((prev) =>
            [
              ...prev,
              {
                ts: Date.now(),
                step: evt?.progress?.step,
                status: evt?.status,
                attempt_count: evt?.attempt_count,
              },
            ].slice(-25),
          );
        }
      } catch {}
    };
    es.addEventListener("job", onJob as any);
    return () => {
      es.removeEventListener("job", onJob as any);
      es.close();
    };
  }, [apiBase, jobId]);

  // Fetch job detail on tick or when jobId set
  useEffect(() => {
    if (!jobId) return;
    (async () => {
      try {
        const res = await fetch(`${apiBase}/jobs/${jobId}`);
        if (!res.ok) return;
        const data = await res.json();
        setJobDetail(data);
      } catch {}
    })();
  }, [apiBase, jobId, tick]);

  const outputs: string[] = Array.isArray(resp?.data?.output)
    ? resp.data.output
    : resp?.data?.output
      ? [resp.data.output]
      : [];

  // Filmstrip generation for first video output
  function scheduleFilmstrip(url: string) {
    if (filmstripTimerRef.current) clearTimeout(filmstripTimerRef.current);
    filmstripTimerRef.current = setTimeout(() => generateFilmstrip(url), 250);
  }

  async function generateFilmstrip(url: string) {
    const taskId = ++filmstripTaskIdRef.current;
    try {
      const video = document.createElement("video");
      video.src = url;
      video.crossOrigin = "anonymous";
      video.muted = true;
      await new Promise((resolve, reject) => {
        video.onloadedmetadata = resolve;
        video.onerror = reject as any;
      });
      if (taskId !== filmstripTaskIdRef.current) return; // cancelled
      const duration = isFinite(video.duration) ? video.duration : 0;
      if (!duration) {
        setFilmstripUrls([]);
        return;
      }
      const thumbs = 5;
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setFilmstripUrls([]);
        return;
      }
      const vw = video.videoWidth || 1920;
      const vh = video.videoHeight || 1080;
      const targetWidth = 240;
      const aspect = vw > 0 && vh > 0 ? vh / vw : 9 / 16;
      const targetHeight = Math.round(targetWidth * aspect);
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const captures: string[] = [];
      for (let i = 1; i <= thumbs; i++) {
        if (taskId !== filmstripTaskIdRef.current) return; // cancelled
        const t = (duration * i) / (thumbs + 1);
        await new Promise<void>((resolve) => {
          const onSeeked = () => {
            ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
            try {
              captures.push(canvas.toDataURL("image/jpeg", 0.7));
            } catch {}
            resolve();
          };
          video.currentTime = t;
          video.onseeked = onSeeked;
        });
      }
      if (taskId !== filmstripTaskIdRef.current) return; // cancelled
      setFilmstripUrls(captures);
      // cleanup
      try {
        video.src = "";
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        video.load?.();
      } catch {}
    } catch {
      if (taskId !== filmstripTaskIdRef.current) return;
      setFilmstripUrls([]);
    }
  }

  return (
    <main className="min-h-dvh">
      <div className="mx-auto max-w-5xl p-6 space-y-6">
        <QuickTour
          steps={[
            {
              id: "order",
              title: "Order scenes",
              description: "Reorder by drag and set transitions + motion.",
            },
            {
              id: "audio",
              title: "Audio modes",
              description:
                "Choose none, voiceover, or dialogue (guardrails enforced).",
            },
            {
              id: "assemble",
              title: "Assemble",
              description: "Submit and preview with a lightweight filmstrip.",
            },
          ]}
          storageKey="gpt5video_quick_tour_video"
        />
        <PageHeader
          title="Video Assemble"
          description="Build a manifest via form or JSON. Audio modes: none, voiceover, dialogue."
          actions={
            <div className="flex items-center gap-2">
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
              {/* Link to Renders when job exists */}
              {jobId && (
                <Link
                  href="/renders"
                  className="rounded-sm bg-blue-600 text-white px-2 py-1 text-xs"
                >
                  View in Renders →
                </Link>
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
        <section className="rounded border bg-white p-4">
          <Tabs
            sticky
            defaultId="form"
            tabs={[
              {
                id: "form",
                label: "Form",
                content: (
                  <div>
                    <div className="mb-3 grid grid-cols-3 gap-3 text-sm">
                      <label>
                        <div className="text-gray-700">
                          Order (comma-separated scene_ids)
                        </div>
                        <input
                          className="mt-1 w-full rounded border px-2 py-1 text-sm"
                          value={order}
                          onChange={(e) => setOrder(e.target.value)}
                        />
                        {!!orderArray.length && (
                          <div className="mt-2 space-y-1">
                            <div className="text-xs text-gray-600 mb-1">
                              Drag to reorder
                            </div>
                            {orderArray.map((id, i) => (
                              <div
                                key={`${id}-${i}`}
                                className={`flex items-center gap-2 rounded border px-2 py-1 ${dragIndex === i ? "bg-gray-100" : "bg-white"}`}
                                draggable
                                onDragStart={() => setDragIndex(i)}
                                onDragOver={(e) => {
                                  e.preventDefault();
                                  if (dragIndex === null || dragIndex === i)
                                    return;
                                  const next = [...orderArray];
                                  const [moved] = next.splice(dragIndex, 1);
                                  next.splice(i, 0, moved);
                                  setDragIndex(i);
                                  setOrder(next.join(", "));
                                }}
                                onDragEnd={() => setDragIndex(null)}
                              >
                                <span
                                  className="cursor-grab select-none"
                                  aria-hidden
                                >
                                  ☰
                                </span>
                                <span className="font-mono flex-1">{id}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </label>
                      <label>
                        <div className="text-gray-700">Transitions</div>
                        <input
                          className="mt-1 w-full rounded border px-2 py-1 text-sm"
                          value={transitions}
                          onChange={(e) => setTransitions(e.target.value)}
                        />
                      </label>
                      <label>
                        <div className="text-gray-700">Motion</div>
                        <input
                          className="mt-1 w-full rounded border px-2 py-1 text-sm"
                          value={motion}
                          onChange={(e) => setMotion(e.target.value)}
                        />
                      </label>
                      <label>
                        <div className="text-gray-700">Model</div>
                        <div className="mt-1">
                          <SegmentedControl
                            ariaLabel="Veo model"
                            options={[
                              { value: "veo-3", label: "Veo 3" },
                              { value: "veo-3-fast", label: "Veo 3 Fast" },
                            ]}
                            value={model}
                            onChange={(v) => setModel(v as any)}
                          />
                        </div>
                      </label>
                      <div className="col-span-3">
                        <div className="mt-4 rounded border p-3 bg-white">
                          <div className="text-sm font-medium mb-2">Audio</div>
                          <div className="grid grid-cols-2 gap-3">
                            <label className="text-sm">
                              <div className="text-gray-700">Mode</div>
                              <div className="mt-1">
                                <SegmentedControl
                                  ariaLabel="Audio mode"
                                  options={[
                                    { value: "none", label: "none" },
                                    { value: "voiceover", label: "voiceover" },
                                    { value: "dialogue", label: "dialogue" },
                                  ]}
                                  value={audioMode}
                                  onChange={(v) => setAudioMode(v as any)}
                                />
                              </div>
                            </label>
                            <label className="text-sm">
                              <div className="text-gray-700">Voice style</div>
                              <select
                                className="mt-1 w-full rounded border px-2 py-1 text-sm"
                                value={voiceStyle}
                                onChange={(e) => setVoiceStyle(e.target.value)}
                              >
                                <option value="conversational_ugcs">
                                  Conversational (UGC)
                                </option>
                                <option value="confident_casual">
                                  Confident casual
                                </option>
                                <option value="authoritative">
                                  Authoritative
                                </option>
                              </select>
                            </label>
                            <label className="text-sm">
                              <div className="text-gray-700">Language</div>
                              <input
                                className="mt-1 w-full rounded border px-2 py-1 text-sm"
                                value={language}
                                onChange={(e) => setLanguage(e.target.value)}
                              />
                            </label>
                            <label className="text-sm">
                              <div className="text-gray-700">Pace</div>
                              <input
                                className="mt-1 w-full rounded border px-2 py-1 text-sm"
                                value={pace}
                                onChange={(e) => setPace(e.target.value)}
                              />
                            </label>
                            <label className="text-sm">
                              <div className="text-gray-700">Volume</div>
                              <input
                                className="mt-1 w-full rounded border px-2 py-1 text-sm"
                                value={volume}
                                onChange={(e) => setVolume(e.target.value)}
                              />
                            </label>
                          </div>
                          {audioMode === "voiceover" && (
                            <label className="mt-3 block text-sm">
                              <div className="text-gray-700">
                                Voiceover prompt
                              </div>
                              <textarea
                                className="mt-1 h-24 w-full rounded border p-2 text-sm"
                                value={voPrompt}
                                onChange={(e) => setVoPrompt(e.target.value)}
                                placeholder="Confident voiceover that says: ..."
                              />
                              <div className="mt-1 text-xs text-gray-600">
                                Required when audio mode is voiceover.
                              </div>
                            </label>
                          )}
                          {audioMode === "dialogue" && (
                            <div className="mt-3 space-y-2">
                              <div className="text-sm">Dialogue timing</div>
                              {dialogueTiming.map((d, i) => (
                                <div key={i} className="grid grid-cols-4 gap-2">
                                  <input
                                    className="rounded border px-2 py-1 text-sm"
                                    placeholder="scene_id"
                                    value={d.scene_id}
                                    onChange={(e) =>
                                      setDialogueTiming((prev) =>
                                        prev.map((v, idx) =>
                                          idx === i
                                            ? { ...v, scene_id: e.target.value }
                                            : v,
                                        ),
                                      )
                                    }
                                  />
                                  <input
                                    className="rounded border px-2 py-1 text-sm"
                                    placeholder="time (s)"
                                    value={d.t}
                                    onChange={(e) =>
                                      setDialogueTiming((prev) =>
                                        prev.map((v, idx) =>
                                          idx === i
                                            ? {
                                                ...v,
                                                t: Number(e.target.value) || 0,
                                              }
                                            : v,
                                        ),
                                      )
                                    }
                                  />
                                  <input
                                    className="rounded border px-2 py-1 text-sm"
                                    placeholder="character"
                                    value={d.character}
                                    onChange={(e) =>
                                      setDialogueTiming((prev) =>
                                        prev.map((v, idx) =>
                                          idx === i
                                            ? {
                                                ...v,
                                                character: e.target.value,
                                              }
                                            : v,
                                        ),
                                      )
                                    }
                                  />
                                  <input
                                    className="rounded border px-2 py-1 text-sm"
                                    placeholder="line"
                                    value={d.line}
                                    onChange={(e) =>
                                      setDialogueTiming((prev) =>
                                        prev.map((v, idx) =>
                                          idx === i
                                            ? { ...v, line: e.target.value }
                                            : v,
                                        ),
                                      )
                                    }
                                  />
                                </div>
                              ))}
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() =>
                                  setDialogueTiming((prev) => [
                                    ...prev,
                                    {
                                      scene_id: "",
                                      t: 0,
                                      character: "",
                                      line: "",
                                    },
                                  ])
                                }
                              >
                                Add line
                              </Button>
                              <div className="mt-1 text-xs text-gray-600">
                                Required mapping when audio mode is dialogue.
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="col-span-3">
                        <div className="mt-4 rounded border p-3 bg-white">
                          <div className="text-sm font-medium mb-2">
                            Reference image
                          </div>
                          <div className="space-y-2">
                            <div className="grid grid-cols-3 gap-2 items-center">
                              <input
                                className="rounded border px-2 py-1 text-sm"
                                placeholder="scene_id"
                                value={
                                  order
                                    .split(",")
                                    .map((s) => s.trim())
                                    .filter(Boolean)[0] ||
                                  refs[0]?.scene_id ||
                                  ""
                                }
                                onChange={(e) =>
                                  setRefs([
                                    {
                                      scene_id: e.target.value,
                                      image_url: refs[0]?.image_url || "",
                                    },
                                  ])
                                }
                              />
                              <input
                                className="rounded border px-2 py-1 text-sm col-span-2"
                                placeholder="reference image url"
                                value={refs[0]?.image_url || ""}
                                onChange={(e) =>
                                  setRefs([
                                    {
                                      scene_id:
                                        refs[0]?.scene_id ||
                                        order
                                          .split(",")
                                          .map((s) => s.trim())
                                          .filter(Boolean)[0] ||
                                        "",
                                      image_url: e.target.value,
                                    },
                                  ])
                                }
                              />
                            </div>
                            <div className="mt-1 text-xs text-gray-600">
                              Auto-filled from Renders selection. This anchors
                              identity in Veo.
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="col-span-3 flex items-center gap-2">
                        <Button
                          onClick={buildManifestFromForm}
                          aria-label="Make video"
                        >
                          Make video
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => {
                            const candidate = {
                              model,
                              order: order
                                .split(",")
                                .map((s) => s.trim())
                                .filter(Boolean),
                              transitions,
                              motion,
                              audio: {
                                mode: audioMode,
                                voice_style: voiceStyle,
                                language,
                                pace,
                                volume,
                                vo_prompt: voPrompt,
                              },
                            };
                            setText(JSON.stringify(candidate, null, 2));
                          }}
                        >
                          Populate JSON
                        </Button>
                      </div>
                    </div>
                  </div>
                ),
              },
              {
                id: "json",
                label: "JSON",
                content: (
                  <div className="grid grid-cols-2 gap-4">
                    <textarea
                      className="h-[420px] w-full resize-vertical rounded border p-2 font-mono text-xs"
                      value={text}
                      onChange={(e) => {
                        setText(e.target.value);
                        debouncedValidateAndMaybeSync(e.target.value);
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
                          aria-label="Assemble"
                        >
                          Assemble
                        </Button>
                        {jobId && (
                          <Link
                            href="/renders"
                            className="rounded-sm bg-blue-600 text-white px-2 py-1 text-xs"
                          >
                            Open in Renders →
                          </Link>
                        )}
                      </div>
                      {(resp || jobDetail) && (
                        <div className="mt-3 space-y-2 text-sm">
                          <div className="text-gray-700">
                            prediction_id:{" "}
                            <span className="font-mono">
                              {jobDetail?.prediction_id ||
                                resp?.data?.prediction_id}
                            </span>
                          </div>
                          <div className="text-gray-700">
                            model_version:{" "}
                            <span className="font-mono">
                              {jobDetail?.model_version ||
                                resp?.data?.model_version}
                            </span>
                          </div>
                          <div className="text-gray-700">
                            duration_ms:{" "}
                            <span className="font-mono">
                              {String(
                                jobDetail?.duration_ms ??
                                  resp?.data?.duration_ms ??
                                  "",
                              )}
                            </span>
                          </div>
                          <div className="text-gray-700">
                            status:{" "}
                            <span className="font-mono">
                              {jobDetail?.status || resp.data?.status}
                            </span>
                          </div>
                          <div className="text-gray-700">
                            run_id:{" "}
                            <span className="font-mono">
                              {String(
                                jobDetail?.run_id ?? resp.data?.run_id ?? "",
                              )}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {typeof jobDetail?.cost_estimate_usd ===
                              "number" && (
                              <Badge variant="warning">
                                Est $
                                {Number(jobDetail.cost_estimate_usd).toFixed(2)}
                              </Badge>
                            )}
                            {typeof jobDetail?.cost_actual_usd === "number" &&
                              Number(jobDetail.cost_actual_usd) > 0 && (
                                <Badge variant="info">
                                  Actual $
                                  {Number(jobDetail.cost_actual_usd).toFixed(2)}
                                </Badge>
                              )}
                          </div>
                          {jobId && (
                            <div className="mt-2">
                              <div className="text-xs text-gray-600 mb-1">
                                Live status
                              </div>
                              <div className="space-y-1 text-xs">
                                {sseEvents.map((e, i) => (
                                  <div
                                    key={i}
                                    className="flex items-center gap-2"
                                  >
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
                                      <span className="text-gray-600">
                                        {e.status}
                                      </span>
                                    )}
                                  </div>
                                ))}
                                {sseEvents.length === 0 && (
                                  <div className="text-gray-500">
                                    Waiting for events…
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ),
              },
            ]}
          />
        </section>
        {!!outputs.length && (
          <section className="rounded border bg-white p-4">
            <div className="text-sm font-medium mb-2">Outputs</div>
            <div className="grid grid-cols-3 gap-3">
              {outputs.map((u, i) => (
                <div key={i} className="rounded border p-2">
                  {/\.mp4|\.webm/i.test(u) ? (
                    <div>
                      <video
                        src={u}
                        controls
                        className="w-full max-h-[480px] object-contain"
                        onLoadedData={() => scheduleFilmstrip(u)}
                      />
                      {filmstripUrls.length > 0 && (
                        <div className="mt-2 flex items-center gap-2 overflow-x-auto">
                          {filmstripUrls.map((fu, fi) => (
                            <img
                              key={fi}
                              src={fu}
                              alt={`thumb-${fi}`}
                              className="h-16 w-auto rounded border"
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
          </section>
        )}
      </div>
    </main>
  );
}

const exampleManifest = {
  model: "veo-3-fast",
  order: ["hook1_s1", "hook1_s2"],
  transitions: "hard_cuts",
  motion: "subtle parallax",
  audio: {
    mode: "voiceover",
    provider: "veo3",
    voice_style: "confident_casual",
    language: "en",
    pace: "fast",
    volume: "normal",
    vo_prompt:
      "Confident voiceover that says: Your CAC is fine. Your loop is broken. Fix your loop, win your market.",
  },
};
