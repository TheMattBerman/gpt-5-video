import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
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
  const validate = useMemo(
    () => ajv.compile(characterProfileSchema as any),
    [],
  );
  const prefixRef = useRef<string>(`dev/character/${Date.now()}/`);

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
        description: String(data?.id || ""),
        variant: "success",
      });
    }
  }

  return (
    <main className="min-h-dvh bg-gray-50">
      <div className="mx-auto max-w-5xl p-6 space-y-6">
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
      </div>
    </main>
  );
}
