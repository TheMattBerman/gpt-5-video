import Link from "next/link";
import PageHeader from "../components/PageHeader";
import { useToast } from "../components/Toast";
import { useMemo, useState } from "react";
import { ajv } from "@gpt5video/shared";
import { fetchWithAuth } from "../lib/http";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import sceneSpecsLineSchema from "../../../../packages/schemas/schemas/scene_specs_line.schema.json";

type SceneSpec = any;

export default function ScenesPlanPage() {
  const apiBase = useMemo(
    () => process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000",
    [],
  );
  const [text, setText] = useState<string>(() =>
    JSON.stringify(exampleScene, null, 2),
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [result, setResult] = useState<any>(null);
  const validateLine = useMemo(
    () => ajv.compile(sceneSpecsLineSchema as any),
    [],
  );
  const { show } = useToast();

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
    if (!valid || !parsed) return;
    const res = await fetchWithAuth(`${apiBase}/scenes/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed),
    });
    const data = await res.json();
    setResult({ ok: res.ok, data });
    if (!res.ok) {
      show({
        title: "Scenes plan failed",
        description: String(data?.error || res.statusText),
        variant: "error",
      });
    } else {
      show({ title: "Scenes planned", variant: "success" });
    }
  }

  return (
    <main className="min-h-dvh bg-gray-50">
      <div className="mx-auto max-w-5xl p-6 space-y-6">
        <PageHeader
          title="Scenes Plan"
          description="Draft 1–3 scene specs or an array. Validate against schema and submit."
        />
        <header className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Scenes Plan</h1>
          <nav className="flex gap-4 text-sm">
            <Link className="text-blue-600 underline" href="/">
              Dashboard
            </Link>
          </nav>
        </header>
        <section className="rounded border bg-white p-4">
          <div className="mb-3 text-sm text-gray-700">
            Author one scene spec or an array, validate, then submit.
          </div>
          <div className="grid grid-cols-2 gap-4">
            <textarea
              className="h-[420px] w-full resize-vertical rounded border p-2 font-mono text-xs"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                validate(e.target.value);
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
                  Submit
                </button>
                <button
                  onClick={() => setText(JSON.stringify(exampleScene, null, 2))}
                  className="rounded border px-3 py-1.5 text-sm"
                >
                  Insert Ideogram preset
                </button>
              </div>
              {result && (
                <pre className="mt-3 max-h-60 overflow-auto rounded border bg-gray-50 p-2 text-xs">
                  {JSON.stringify(result, null, 2)}
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
