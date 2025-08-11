import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useToast } from "../components/Toast";
import { ajv } from "@gpt5video/shared";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import sceneSpecsLineSchema from "../../../../packages/schemas/schemas/scene_specs_line.schema.json";
import dynamic from "next/dynamic";
const Editor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

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
    const res = await fetch(`${apiBase}/scenes/plan`, {
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

  return (
    <main className="min-h-dvh bg-gray-50">
      <div className="mx-auto max-w-6xl p-6 space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Scenes</h1>
          <nav className="flex gap-4 text-sm">
            <Link className="text-blue-600 underline" href="/">
              Dashboard
            </Link>
          </nav>
        </header>
        <section className="rounded border bg-white p-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="min-h-[480px]">
              <Editor
                height="480px"
                defaultLanguage="json"
                value={text}
                onChange={(v) => {
                  const next = v || "";
                  setText(next);
                  validate(next);
                }}
                onMount={(editor) => {
                  editorRef.current = editor;
                }}
                options={{ minimap: { enabled: false }, fontSize: 12 }}
              />
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
              </div>
              {resp && (
                <pre className="mt-3 max-h-60 overflow-auto rounded border bg-gray-50 p-2 text-xs">
                  {JSON.stringify(resp, null, 2)}
                </pre>
              )}
            </div>
          </div>
        </section>
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
