import Link from "next/link";
import { useMemo, useState } from "react";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import sceneSpecsLineSchema from "../../../../packages/schemas/schemas/scene_specs_line.schema.json";
import { ajv } from "@gpt5video/shared";
import { addJob, updateJob } from "../lib/jobs";
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
    const res = await fetch(`${apiBase}/scenes/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scene }),
    });
    const data = await res.json();
    setResp({ ok: res.ok, data });
    if (res.ok) {
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
        const res = await fetch(`${apiBase}/scenes/render`, {
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

  return (
    <main className="min-h-dvh bg-gray-50">
      <div className="mx-auto max-w-5xl p-6 space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Scenes Render</h1>
          <nav className="flex gap-4 text-sm">
            <Link className="text-blue-600 underline" href="/">
              Dashboard
            </Link>
          </nav>
        </header>
        <section className="rounded border bg-white p-4">
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
                <button
                  onClick={submit}
                  disabled={errors.length > 0}
                  className="rounded bg-black px-3 py-1.5 text-white text-sm disabled:opacity-50"
                >
                  Render
                </button>
                <button
                  onClick={() => setText(JSON.stringify(exampleScene, null, 2))}
                  className="rounded border px-3 py-1.5 text-sm"
                >
                  Insert Ideogram preset
                </button>
                <button
                  onClick={() => void queueBatch(15)}
                  disabled={errors.length > 0}
                  className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
                >
                  Queue 15 renders
                </button>
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
        </section>
        {!!outputs.length && (
          <section className="rounded border bg-white p-4">
            <div className="text-sm font-medium mb-2">Outputs</div>
            <div className="grid grid-cols-3 gap-3">
              {outputs.map((u, i) => (
                <div key={i} className="rounded border p-2">
                  {/\.mp4|\.webm/i.test(u) ? (
                    <video
                      src={u}
                      controls
                      className="max-h-60 w-full object-contain"
                    />
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
