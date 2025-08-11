import Link from "next/link";
import PageHeader from "../components/PageHeader";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "../components/Toast";
import { ajv } from "@gpt5video/shared";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import characterProfileSchema from "../../../../packages/schemas/schemas/character_profile.schema.json";

type UploadedRef = {
  key: string;
  previewUrl: string;
  contentType: string;
};

export default function CharacterPage() {
  const { show } = useToast();
  const apiBase = useMemo(
    () => process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000",
    [],
  );
  const publicAssetBase = useMemo(
    () => (process.env.NEXT_PUBLIC_ASSET_BASE || "").replace(/\/$/, ""),
    [],
  );

  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploaded, setUploaded] = useState<UploadedRef[]>([]);
  const [styleInput, setStyleInput] = useState<string>("");
  const [maskInput, setMaskInput] = useState<string>("");
  const [seedLocked, setSeedLocked] = useState<boolean>(false);
  const [winner, setWinner] = useState<{
    seed?: number | null;
    url?: string;
  } | null>(null);
  const [testPrompts, setTestPrompts] = useState<string[]>([
    "mascot at a standing desk, soft key light",
    "mascot in startup office, confident expression",
    "mascot close-up, clean typography background",
  ]);
  const [testAspect, setTestAspect] = useState<string>("9:16");
  const [testSpeed, setTestSpeed] = useState<string>("Default");
  const [testResults, setTestResults] = useState<
    Array<{
      prompt: string;
      output?: string;
      seed?: number | null;
      model_version?: string;
      status: string;
    }>
  >([]);
  const validate = useMemo(
    () => ajv.compile(characterProfileSchema as any),
    [],
  );
  const prefixRef = useRef<string>(`dev/character/${Date.now()}/`);

  // Load winner from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem("gpt5video_character_winner");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") setWinner(parsed);
      }
    } catch {}
  }, []);

  const styleConstraints = useMemo(
    () =>
      styleInput
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    [styleInput],
  );
  const maskRules = useMemo(
    () =>
      maskInput
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    [maskInput],
  );

  const referenceImages = uploaded.map((u) => u.previewUrl);

  const validation = useMemo(() => {
    const candidate = {
      reference_images: referenceImages,
      style_constraints: styleConstraints,
      mask_rules: maskRules,
    } as any;
    const ok = validate(candidate);
    const errs = ok
      ? []
      : (validate.errors || []).map(
          (e) => `${e.instancePath || "/"} ${e.message || "invalid"}`,
        );
    return { ok, errors: errs } as const;
  }, [referenceImages, styleConstraints, maskRules, validate]);

  const handlePick = useCallback((fl: FileList | null) => {
    const arr = fl ? Array.from(fl) : [];
    setFiles(arr);
  }, []);

  const uploadAll = useCallback(async () => {
    if (!files.length) return;
    setUploading(true);
    try {
      const results: UploadedRef[] = [];
      for (const f of files) {
        const key = `${prefixRef.current}${f.name}`.replace(/\/+/, "/");
        const ctype = f.type || "application/octet-stream";
        const signRes = await fetch(`${apiBase}/uploads/sign`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, content_type: ctype }),
        });
        if (!signRes.ok) throw new Error(`sign failed: ${signRes.status}`);
        const { url } = (await signRes.json()) as { url: string; key: string };
        const putRes = await fetch(url, {
          method: "PUT",
          headers: { "Content-Type": ctype },
          body: f,
        });
        if (!putRes.ok) throw new Error(`put failed: ${putRes.status}`);
        let previewUrl: string;
        if (publicAssetBase) previewUrl = `${publicAssetBase}/${key}`;
        else {
          const dbg = await fetch(
            `${apiBase}/uploads/debug-get?key=${encodeURIComponent(key)}`,
          ).then((r) => r.json());
          previewUrl = (dbg.public_url as string) || (dbg.url as string) || "";
        }
        if (!previewUrl) throw new Error("preview url missing");
        results.push({ key, previewUrl, contentType: ctype });
      }
      setUploaded((prev) => [...results, ...prev]);
      show({ title: "Uploaded", variant: "success" });
    } catch (err: any) {
      show({
        title: "Upload failed",
        description: String(err?.message || err),
        variant: "error",
      });
    } finally {
      setUploading(false);
    }
  }, [apiBase, files, publicAssetBase, show]);

  async function submitProfile() {
    const body = {
      reference_images: referenceImages,
      style_constraints: styleConstraints,
      mask_rules: maskRules,
    } as const;
    const ok = validate(body);
    if (!ok) {
      show({ title: "Invalid input", variant: "error" });
      return;
    }
    const res = await fetch(`${apiBase}/character/profile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      show({
        title: "Save failed",
        description: String(data?.error || res.statusText),
        variant: "error",
      });
    } else {
      show({
        title: "Character profile saved",
        description: String(data?.character_id || ""),
        variant: "success",
      });
    }
  }

  async function runStabilityTest() {
    if (!referenceImages.length) {
      show({ title: "Upload at least one reference image", variant: "error" });
      return;
    }
    const ref = referenceImages[0];
    const prompts = testPrompts.filter((p) => p.trim());
    if (!prompts.length) return;
    setTestResults(prompts.map((p) => ({ prompt: p, status: "queued" })));
    try {
      const res = await fetch(`${apiBase}/character/stability-test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reference_image: ref,
          prompts,
          aspect_ratio: testAspect,
          rendering_speed: testSpeed,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(String(data?.error || res.statusText));
      const results = Array.isArray(data?.results) ? data.results : [];
      setTestResults(
        prompts.map((p) => {
          const r = results.find((x: any) => x.prompt === p);
          return (
            r || {
              prompt: p,
              status: "failed",
            }
          );
        }),
      );
    } catch (e: any) {
      show({
        title: "Stability test failed",
        description: String(e?.message || e),
        variant: "error",
      });
      setTestResults((prev) => prev.map((r) => ({ ...r, status: "failed" })));
    }
  }

  return (
    <main className="min-h-dvh bg-gray-50">
      <div className="mx-auto max-w-5xl p-6 space-y-6">
        <PageHeader
          title="Character"
          description="Upload references and set style/mask rules. Run a stability test and lock a winning seed."
        />
        <header className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Character</h1>
          <nav className="flex gap-4 text-sm">
            <Link className="text-blue-600 underline" href="/">
              Dashboard
            </Link>
          </nav>
        </header>

        <section className="rounded border bg-white p-4 space-y-3">
          <div className="text-sm font-medium">Reference images</div>
          <input
            type="file"
            multiple
            accept="image/*"
            className="block w-full text-sm"
            onChange={(e) => handlePick(e.target.files)}
          />
          <div className="flex items-center gap-3">
            <button
              onClick={uploadAll}
              disabled={!files.length || uploading}
              className="rounded bg-black px-3 py-1.5 text-white text-sm disabled:opacity-50"
            >
              {uploading ? "Uploading..." : "Upload selected"}
            </button>
            <div className="text-xs text-gray-600">
              {files.length
                ? `${files.length} file(s) selected`
                : "No files selected"}
            </div>
          </div>
          {!!uploaded.length && (
            <div className="mt-2">
              <div className="text-xs text-gray-500 mb-1">Preview</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {uploaded.map((u) => (
                  <div key={u.key} className="rounded border p-2">
                    <img
                      src={u.previewUrl}
                      alt={u.key}
                      className="h-36 w-full object-cover rounded"
                    />
                    <div className="mt-1 text-[10px] text-gray-600 break-all">
                      {u.key}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="rounded border bg-white p-4 grid grid-cols-2 gap-4">
          <div className="space-y-3">
            <label className="block text-sm">
              <span className="text-gray-700">
                Style constraints (comma-separated)
              </span>
              <input
                className="mt-1 w-full rounded border px-2 py-1 text-sm"
                value={styleInput}
                onChange={(e) => setStyleInput(e.target.value)}
                placeholder="studio key light, clean typography"
              />
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="rounded border"
                checked={seedLocked}
                onChange={(e) => setSeedLocked(e.target.checked)}
              />
              <span className="text-gray-700">Lock seed for approved look</span>
            </label>
            <label className="block text-sm">
              <span className="text-gray-700">
                Mask rules (comma-separated)
              </span>
              <input
                className="mt-1 w-full rounded border px-2 py-1 text-sm"
                value={maskInput}
                onChange={(e) => setMaskInput(e.target.value)}
                placeholder="preserve face, replace background only"
              />
            </label>
            <div className="flex items-center gap-3">
              <button
                onClick={submitProfile}
                disabled={!validation.ok}
                className="rounded bg-black px-3 py-1.5 text-white text-sm disabled:opacity-50"
              >
                Submit Profile
              </button>
            </div>
            <div className="pt-2 border-t mt-2">
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="rounded border"
                  checked={seedLocked}
                  onChange={(e) => setSeedLocked(e.target.checked)}
                />
                <span className="text-gray-700">
                  Lock seed for approved look (local)
                </span>
              </label>
            </div>
          </div>
          <div className="flex flex-col">
            <div className="text-sm font-medium">Validation</div>
            <div className="mt-2 flex-1 overflow-auto rounded border bg-gray-50 p-2 text-xs">
              {validation.errors.length === 0 ? (
                <div className="text-green-700">Valid ✔︎</div>
              ) : (
                <ul className="list-disc pl-4">
                  {validation.errors.map((e, i) => (
                    <li key={i} className="text-red-700">
                      {e}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>

        <section className="rounded border bg-white p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Stability test</div>
            {winner && (
              <div className="text-xs text-gray-700">
                Winner seed:{" "}
                <span className="font-mono">{String(winner.seed ?? "-")}</span>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              {testPrompts.map((p, i) => (
                <label key={i} className="block text-sm">
                  <span className="text-gray-700">Prompt {i + 1}</span>
                  <input
                    className="mt-1 w-full rounded border px-2 py-1 text-sm"
                    value={p}
                    onChange={(e) =>
                      setTestPrompts((prev) =>
                        prev.map((v, idx) => (idx === i ? e.target.value : v)),
                      )
                    }
                  />
                </label>
              ))}
              <div className="grid grid-cols-2 gap-2">
                <label className="text-sm">
                  <span className="text-gray-700">Aspect ratio</span>
                  <select
                    className="mt-1 w-full rounded border px-2 py-1 text-sm"
                    value={testAspect}
                    onChange={(e) => setTestAspect(e.target.value)}
                  >
                    <option value="9:16">9:16</option>
                    <option value="1:1">1:1</option>
                    <option value="16:9">16:9</option>
                  </select>
                </label>
                <label className="text-sm">
                  <span className="text-gray-700">Rendering speed</span>
                  <select
                    className="mt-1 w-full rounded border px-2 py-1 text-sm"
                    value={testSpeed}
                    onChange={(e) => setTestSpeed(e.target.value)}
                  >
                    <option>Default</option>
                    <option>Turbo</option>
                  </select>
                </label>
              </div>
              <button
                onClick={runStabilityTest}
                className="rounded bg-black px-3 py-1.5 text-white text-sm disabled:opacity-50"
              >
                Run test
              </button>
            </div>
            <div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {testResults.map((r, i) => (
                  <div key={i} className="rounded border p-2 text-xs space-y-1">
                    <div className="font-medium">{r.status}</div>
                    <div className="text-gray-700 truncate" title={r.prompt}>
                      {r.prompt}
                    </div>
                    {r.output && /\.png|\.jpg|\.jpeg|\.gif/i.test(r.output) && (
                      <img
                        src={r.output}
                        alt="out"
                        className="w-full h-40 object-contain rounded border"
                      />
                    )}
                    {typeof r.seed === "number" && (
                      <div>
                        seed:{" "}
                        <span className="font-mono">{String(r.seed)}</span>
                      </div>
                    )}
                    {r.model_version && (
                      <div>
                        version:{" "}
                        <span className="font-mono">{r.model_version}</span>
                      </div>
                    )}
                    {r.output && (
                      <button
                        className="rounded border px-2 py-1 text-xs"
                        onClick={() => {
                          setSeedLocked(true);
                          const next = { seed: r.seed ?? null, url: r.output };
                          setWinner(next);
                          try {
                            localStorage.setItem(
                              "gpt5video_character_winner",
                              JSON.stringify(next),
                            );
                          } catch {}
                        }}
                      >
                        Select as winner
                      </button>
                    )}
                  </div>
                ))}
                {testResults.length === 0 && (
                  <div className="text-gray-600">No results yet</div>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
