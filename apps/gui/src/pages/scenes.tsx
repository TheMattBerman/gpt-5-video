import Link from "next/link";
import PageHeader from "../components/PageHeader";
import { useMemo, useRef, useState } from "react";
import { useToast } from "../components/Toast";
import { fetchWithAuth } from "../lib/http";
import { ajv } from "@gpt5video/shared";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import sceneSpecsLineSchema from "../../../../packages/schemas/schemas/scene_specs_line.schema.json";
import dynamic from "next/dynamic";
import { Card } from "../components/ui";
const MonacoEditor = dynamic(
  async () => (await import("@monaco-editor/react")).default,
  { ssr: false },
);
const MonacoDiffEditor = dynamic(
  async () => (await import("@monaco-editor/react")).DiffEditor,
  { ssr: false },
);

type SceneSpec = any;

export default function ScenesEditorPage() {
  const apiBase = useMemo(
    () => process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000",
    [],
  );
  const { show } = useToast();
  const [text, setText] = useState<string>(() =>
    JSON.stringify(exampleScene, null, 2),
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [resp, setResp] = useState<any>(null);
  const [showDiff, setShowDiff] = useState<boolean>(false);
  const [original, setOriginal] = useState<string>(() =>
    JSON.stringify(exampleScene, null, 2),
  );
  const [voPrompt, setVoPrompt] = useState<string>("");
  const [dialogue, setDialogue] = useState<
    Array<{ character: string; line: string }>
  >([]);
  const validateLine = useMemo(
    () => ajv.compile(sceneSpecsLineSchema as any),
    [],
  );
  const editorRef = useRef<any>(null);

  function validate(input: string) {
    try {
      const parsed = JSON.parse(input);
      const asArray = Array.isArray(parsed) ? parsed : [parsed];
      for (const s of asArray) {
        if (!validateLine(s)) {
          setErrors(
            (validateLine.errors || []).map(
              (e) => `${e.instancePath || "/"} ${e.message || "invalid"}`,
            ),
          );
          return { valid: false, parsed: null } as const;
        }
      }
      setErrors([]);
      return { valid: true, parsed } as const;
    } catch (err: any) {
      setErrors([`JSON parse error: ${err?.message || String(err)}`]);
      return { valid: false, parsed: null } as const;
    }
  }

  async function submit() {
    const { valid, parsed } = validate(text);
    if (!valid || !parsed) {
      show({ title: "Invalid scene spec", variant: "error" });
      return;
    }
    const res = await fetchWithAuth(`${apiBase}/scenes/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed),
    });
    const data = await res.json();
    setResp({ ok: res.ok, data });
    if (res.ok) show({ title: "Scenes planned", variant: "success" });
    else
      show({
        title: "Scenes plan failed",
        description: String(data?.error || res.statusText),
        variant: "error",
      });
  }

  function formatJson() {
    try {
      const parsed = JSON.parse(text);
      const pretty = JSON.stringify(parsed, null, 2);
      setText(pretty);
      if (editorRef.current) editorRef.current.setValue(pretty);
    } catch {}
  }

  function insertPreset() {
    const pretty = JSON.stringify(exampleScene, null, 2);
    setText(pretty);
    if (editorRef.current) editorRef.current.setValue(pretty);
  }

  function mergeAudioIntoJson() {
    try {
      const parsed = JSON.parse(text);
      const asArray = Array.isArray(parsed) ? parsed : [parsed];
      const audioFields: any = {
        dialogue: dialogue.length ? dialogue : undefined,
        vo_prompt: voPrompt || "",
      };
      const merged = asArray.map((s: any) => ({
        ...s,
        audio: {
          ...(s.audio || {}),
          ...audioFields,
        },
      }));
      const next = Array.isArray(parsed) ? merged : merged[0];
      const pretty = JSON.stringify(next, null, 2);
      setText(pretty);
      if (editorRef.current) editorRef.current.setValue(pretty);
      validate(pretty);
      show({ title: "Audio merged", variant: "success" });
    } catch (e: any) {
      show({
        title: "Merge failed",
        description: String(e?.message || e),
        variant: "error",
      });
    }
  }

  function applyTemplate(kind: "ideogram" | "imagen4") {
    const tpl = kind === "ideogram" ? exampleScene : imagen4Template;
    const pretty = JSON.stringify(tpl, null, 2);
    setText(pretty);
    if (editorRef.current) editorRef.current.setValue(pretty);
    validate(pretty);
  }

  return (
    <main className="min-h-dvh bg-gray-50">
      <div className="mx-auto max-w-6xl p-6 space-y-6">
        <PageHeader
          title="Scenes"
          description="Author scene specs with JSON + schema checks. Merge audio fields when needed."
        />
        <header className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Scenes</h1>
          <nav className="flex gap-4 text-sm">
            <Link className="text-blue-600 underline" href="/">
              Dashboard
            </Link>
          </nav>
        </header>
        <Card>
          <div className="grid grid-cols-2 gap-4">
            <div className="min-h-[480px]">
              {!showDiff ? (
                <MonacoEditor
                  height="480px"
                  defaultLanguage="json"
                  value={text}
                  onChange={(v) => {
                    const next = v || "";
                    setText(next);
                    validate(next);
                  }}
                  onMount={(editor: any, monaco: any) => {
                    editorRef.current = editor;
                    try {
                      monaco?.languages?.json?.jsonDefaults?.setDiagnosticsOptions?.(
                        {
                          validate: true,
                          enableSchemaRequest: false,
                          schemas: [
                            {
                              uri: "inmemory://model/scene_specs_line.schema.json",
                              fileMatch: ["*"],
                              schema: sceneSpecsLineSchema,
                            },
                          ],
                        },
                      );
                    } catch {}
                  }}
                  options={{ minimap: { enabled: false }, fontSize: 12 }}
                />
              ) : (
                <MonacoDiffEditor
                  height="480px"
                  original={original}
                  modified={text}
                  originalLanguage="json"
                  modifiedLanguage="json"
                  theme="vs-dark"
                />
              )}
            </div>
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
                  Submit Plan
                </button>
                <button
                  onClick={formatJson}
                  className="rounded border px-3 py-1.5 text-sm"
                >
                  Format JSON
                </button>
                <button
                  onClick={insertPreset}
                  className="rounded border px-3 py-1.5 text-sm"
                >
                  Insert Ideogram preset
                </button>
                <button
                  onClick={() => setShowDiff((v) => !v)}
                  className="rounded border px-3 py-1.5 text-sm"
                >
                  {showDiff ? "Hide diff" : "Show diff"}
                </button>
                <button
                  onClick={mergeAudioIntoJson}
                  className="rounded border px-3 py-1.5 text-sm"
                >
                  Merge Audio into JSON
                </button>
                <select
                  className="rounded border px-2 py-1 text-sm"
                  onChange={(e) => {
                    const v = e.target.value as any;
                    if (!v) return;
                    applyTemplate(v);
                  }}
                  defaultValue=""
                >
                  <option value="" disabled>
                    Templates
                  </option>
                  <option value="ideogram">Ideogram Character</option>
                  <option value="imagen4">Imagen 4 stub</option>
                </select>
              </div>
              {resp && (
                <pre className="mt-3 max-h-60 overflow-auto rounded border bg-gray-50 p-2 text-xs">
                  {JSON.stringify(resp, null, 2)}
                </pre>
              )}
            </div>
          </div>
        </Card>
        <Card>
          <div className="text-sm font-medium mb-2">Audio panel</div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-sm">
                <span className="text-gray-700">
                  Voiceover prompt (vo_prompt)
                </span>
                <textarea
                  className="mt-1 h-24 w-full rounded border p-2 text-sm"
                  value={voPrompt}
                  onChange={(e) => setVoPrompt(e.target.value)}
                />
              </label>
              <div className="text-xs text-gray-600">
                If using dialogue lines, leave voiceover empty.
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm">Dialogue lines</div>
                <button
                  className="rounded border px-2 py-1 text-xs"
                  onClick={() =>
                    setDialogue((prev) => [
                      ...prev,
                      { character: "", line: "" },
                    ])
                  }
                >
                  Add line
                </button>
              </div>
              <div className="space-y-2">
                {dialogue.map((d, i) => (
                  <div key={i} className="grid grid-cols-2 gap-2">
                    <input
                      className="rounded border px-2 py-1 text-sm"
                      placeholder="Character"
                      value={d.character}
                      onChange={(e) =>
                        setDialogue((prev) =>
                          prev.map((v, idx) =>
                            idx === i ? { ...v, character: e.target.value } : v,
                          ),
                        )
                      }
                    />
                    <input
                      className="rounded border px-2 py-1 text-sm"
                      placeholder="Line"
                      value={d.line}
                      onChange={(e) =>
                        setDialogue((prev) =>
                          prev.map((v, idx) =>
                            idx === i ? { ...v, line: e.target.value } : v,
                          ),
                        )
                      }
                    />
                  </div>
                ))}
                {dialogue.length > 0 && (
                  <div className="text-xs text-gray-600">
                    If using dialogue, ensure vo_prompt is empty.
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="mt-3 text-xs text-gray-700">
            This panel is a helper to compose audio fields. Copy fields into
            your scene JSON. Validation still enforces that either dialogue or
            vo_prompt should be empty unless audio is enabled, per PRD.
          </div>
        </Card>
      </div>
    </main>
  );
}

const exampleScene: SceneSpec = {
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
  audio: {
    dialogue: [
      { character: "Mascot", line: "Your CAC is fine. Your loop is broken." },
    ],
    vo_prompt: "",
  },
};

const imagen4Template: SceneSpec = {
  scene_id: "hook1_s1",
  duration_s: 2.0,
  composition: "product glamour, clean backdrop",
  props: [],
  overlays: [{ type: "lower_third", text: "Your brand here" }],
  model: "imagen-4",
  model_inputs: {
    prompt: "studio product photo, soft shadows, crisp edges",
    aspect_ratio: "9:16",
    negative_prompt: "blurry, low quality",
  },
  audio: { dialogue: [], vo_prompt: "" },
};
