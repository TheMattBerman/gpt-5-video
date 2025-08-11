import Link from "next/link";
import { useMemo, useState } from "react";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import videoManifestSchema from "../../../../packages/schemas/schemas/video_manifest.schema.json";
import { ajv } from "@gpt5video/shared";
import { addJob, updateJob } from "../lib/jobs";
import { useToast } from "../components/Toast";

export default function VideoAssemblePage() {
  const apiBase = useMemo(
    () => process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000",
    [],
  );
  const [text, setText] = useState<string>(() =>
    JSON.stringify(exampleManifest, null, 2),
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [resp, setResp] = useState<any>(null);
  const validate = useMemo(() => ajv.compile(videoManifestSchema as any), []);
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
    const manifest = validateText(text);
    if (!manifest) return;
    const provisionalId = `video_assemble_${Date.now()}`;
    addJob({
      id: provisionalId,
      type: "video_assemble",
      status: "queued",
      createdAt: Date.now(),
    });
    const res = await fetch(`${apiBase}/videos/assemble`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ manifest }),
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

  const outputs: string[] = Array.isArray(resp?.data?.output)
    ? resp.data.output
    : resp?.data?.output
      ? [resp.data.output]
      : [];

  return (
    <main className="min-h-dvh bg-gray-50">
      <div className="mx-auto max-w-5xl p-6 space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Video Assemble</h1>
          <nav className="flex gap-4 text-sm">
            <Link className="text-blue-600 underline" href="/">
              Dashboard
            </Link>
          </nav>
        </header>
        <section className="rounded border bg-white p-4">
          <div className="mb-3 text-sm text-gray-700">
            Build a minimal manifest, validate, and submit (audio.mode must be
            "none").
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
                  Assemble
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

const exampleManifest = {
  order: ["hook1_s1", "hook1_s2"],
  transitions: "hard_cuts",
  motion: "subtle parallax",
  audio: { mode: "none" },
};
