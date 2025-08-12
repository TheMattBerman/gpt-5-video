import Link from "next/link";
import { useRouter } from "next/router";
import PageHeader from "../components/PageHeader";
import { useToast } from "../components/Toast";
import { useEffect, useMemo, useRef, useState } from "react";
import { ajv } from "@gpt5video/shared";
import { fetchWithAuth } from "../lib/http";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import sceneSpecsLineSchema from "../../../../packages/schemas/schemas/scene_specs_line.schema.json";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Tabs,
} from "../components/ui";
import dynamic from "next/dynamic";

const MonacoEditor = dynamic(
  async () => (await import("@monaco-editor/react")).default,
  { ssr: false },
);
const MonacoDiffEditor = dynamic(
  async () => (await import("@monaco-editor/react")).DiffEditor,
  { ssr: false },
);

type SceneSpec = any;
type ModelKey = "ideogram-character" | "imagen-4";

type FormState = {
  scene_id: string;
  duration_s: string;
  composition: string;
  model: ModelKey;
  prompt: string;
  character_reference_image?: string;
  aspect_ratio: string;
  rendering_speed?: "Default" | "Fast" | "Slow";
  negative_prompt?: string;
  vo_prompt: string;
  dialogue: Array<{ character: string; line: string }>;
};

const defaultForm: FormState = {
  scene_id: "hook1_s1",
  duration_s: "2.0",
  composition: "tight mid on mascot, text plate right",
  model: "ideogram-character",
  prompt: "mascot in startup office, confident expression",
  character_reference_image: "https://example.com/mascot-headshot.png",
  aspect_ratio: "9:16",
  rendering_speed: "Default",
  negative_prompt: "",
  vo_prompt: "",
  dialogue: [],
};

export default function ScenesPlanPage() {
  const apiBase = useMemo(
    () => process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000",
    [],
  );
  const router = useRouter();
  const { show } = useToast();
  const validateLine = useMemo(
    () => ajv.compile(sceneSpecsLineSchema as any),
    [],
  );

  const [scene, setScene] = useState<SceneSpec>(() => exampleIdeogram);
  const [jsonText, setJsonText] = useState<string>(() =>
    JSON.stringify(exampleIdeogram, null, 2),
  );
  const [originalText, setOriginalText] = useState<string>(() =>
    JSON.stringify(exampleIdeogram, null, 2),
  );
  const [showDiff, setShowDiff] = useState<boolean>(false);
  const [form, setForm] = useState<FormState>(() =>
    formFromScene(exampleIdeogram),
  );
  const [ajvErrors, setAjvErrors] = useState<
    Array<{ path: string; message: string }>
  >([]);
  const [isValid, setIsValid] = useState<boolean>(true);
  const editorRef = useRef<any>(null);
  const [submitBusy, setSubmitBusy] = useState<boolean>(false);

  // Prefill from query param
  useEffect(() => {
    const q = router.query?.prefill;
    if (!q || Array.isArray(q)) return;
    try {
      const decoded = decodeURIComponent(q);
      const parsed = JSON.parse(decoded);
      if (validateSceneObject(parsed)) {
        setScene(parsed);
        const pretty = JSON.stringify(parsed, null, 2);
        setJsonText(pretty);
        setOriginalText(pretty);
        setForm(formFromScene(parsed));
      }
    } catch {}
  }, [router.query]);

  // Sync form -> scene -> json preview
  useEffect(() => {
    const next = sceneFromForm(form);
    setScene(next);
    const pretty = JSON.stringify(next, null, 2);
    setJsonText(pretty);
    validateSceneObject(next);
  }, [
    form.scene_id,
    form.duration_s,
    form.composition,
    form.model,
    form.prompt,
    form.character_reference_image,
    form.aspect_ratio,
    form.rendering_speed,
    form.negative_prompt,
    form.vo_prompt,
    JSON.stringify(form.dialogue),
  ]);

  function validateSceneObject(obj: any) {
    const ok = validateLine(obj);
    if (!ok) {
      const errs = (validateLine.errors || []).map((e) => ({
        path: String(e.instancePath || "/"),
        message: e.message || "invalid",
      }));
      setAjvErrors(errs);
      setIsValid(false);
    } else {
      setAjvErrors([]);
      setIsValid(true);
    }
    return ok;
  }

  function onJsonChange(nextText: string) {
    setJsonText(nextText);
    try {
      const parsed = JSON.parse(nextText || "{}");
      if (Array.isArray(parsed)) return;
      if (validateSceneObject(parsed)) {
        setScene(parsed);
        setForm(formFromScene(parsed));
      }
    } catch (e) {
      setIsValid(false);
      setAjvErrors([{ path: "/", message: `JSON parse error` }]);
    }
  }

  async function submit() {
    if (!isValid) return;
    setSubmitBusy(true);
    try {
      const body = scene;
      const res = await fetchWithAuth(`${apiBase}/scenes/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        show({ title: "Scenes planned", variant: "success" });
      } else {
        show({
          title: "Scenes plan failed",
          description: String(data?.error || res.statusText),
          variant: "error",
        });
      }
    } catch (e: any) {
      show({
        title: "Submit failed",
        description: String(e?.message || e),
        variant: "error",
      });
    } finally {
      setSubmitBusy(false);
    }
  }

  function formatJson() {
    try {
      const parsed = JSON.parse(jsonText);
      const pretty = JSON.stringify(parsed, null, 2);
      setJsonText(pretty);
      if (editorRef.current) editorRef.current.setValue(pretty);
    } catch {}
  }

  function insertTemplate(kind: "ideogram" | "imagen4") {
    const tpl = kind === "ideogram" ? exampleIdeogram : exampleImagen4;
    const pretty = JSON.stringify(tpl, null, 2);
    setJsonText(pretty);
    setScene(tpl);
    setForm(formFromScene(tpl));
    validateSceneObject(tpl);
    if (editorRef.current) editorRef.current.setValue(pretty);
  }

  function mergeAudioIntoJson(
    vo_prompt: string,
    dialogue: Array<{ character: string; line: string }>,
  ) {
    try {
      const parsed = JSON.parse(jsonText);
      const asArray = Array.isArray(parsed) ? parsed : [parsed];
      const audioFields: any = {
        dialogue: dialogue.length ? dialogue : undefined,
        vo_prompt: vo_prompt || "",
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
      setJsonText(pretty);
      if (!Array.isArray(parsed)) {
        setScene(next);
        setForm(formFromScene(next));
      }
      if (editorRef.current) editorRef.current.setValue(pretty);
      validateSceneObject(Array.isArray(parsed) ? parsed[0] : next);
      show({ title: "Audio merged", variant: "success" });
    } catch (e: any) {
      show({
        title: "Merge failed",
        description: String(e?.message || e),
        variant: "error",
      });
    }
  }

  function jumpToFirstError() {
    const first = ajvErrors[0];
    if (!first) return;
    const id = fieldIdFromJsonPath(first.path);
    const el = document.getElementById(id);
    if (el && typeof (el as any).focus === "function") (el as any).focus();
  }

  return (
    <main className="min-h-dvh bg-gray-50">
      <div className="mx-auto max-w-6xl p-6 space-y-6">
        <PageHeader
          title="Scenes Plan"
          description="Compose scenes with JSON or a friendly form. Live schema validation and helpful guidance."
          actions={
            <div className="flex items-center gap-2 text-xs">
              {isValid ? (
                <Badge variant="success">Valid</Badge>
              ) : (
                <Badge variant="error">Invalid</Badge>
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
            tabs={[
              {
                id: "json",
                label: "JSON",
                content: (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div>
                      {!showDiff ? (
                        <MonacoEditor
                          height="520px"
                          defaultLanguage="json"
                          value={jsonText}
                          onChange={(v) => onJsonChange(v || "")}
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
                          options={{
                            minimap: { enabled: false },
                            fontSize: 12,
                          }}
                        />
                      ) : (
                        <MonacoDiffEditor
                          height="520px"
                          original={originalText}
                          modified={jsonText}
                          originalLanguage="json"
                          modifiedLanguage="json"
                          theme="vs-dark"
                        />
                      )}
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Button
                          onClick={submit}
                          disabled={!isValid || submitBusy}
                          aria-label="Submit plan"
                        >
                          Submit Plan
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={formatJson}
                          aria-label="Format JSON"
                        >
                          Format JSON
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setOriginalText(jsonText);
                            insertTemplate("ideogram");
                          }}
                          aria-label="Insert Ideogram template"
                        >
                          Insert Ideogram template
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setOriginalText(jsonText);
                            insertTemplate("imagen4");
                          }}
                          aria-label="Insert Imagen 4 template"
                        >
                          Insert Imagen 4 template
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => setShowDiff((v) => !v)}
                          aria-label={showDiff ? "Hide diff" : "Show diff"}
                        >
                          {showDiff ? "Hide diff" : "Show diff"}
                        </Button>
                      </div>
                      <Card className="mt-4">
                        <CardHeader>
                          <CardTitle className="text-sm">
                            Merge Audio helpers
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <AudioMergeInline
                            onMerge={(vo, dlg) => mergeAudioIntoJson(vo, dlg)}
                          />
                          <div className="mt-2 text-xs text-gray-600">
                            Use either dialogue or voiceover. If audio isn’t
                            enabled later, it will be ignored.
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                    <div className="flex flex-col gap-3">
                      <ValidationPanel
                        isValid={isValid}
                        errors={ajvErrors}
                        onJumpFirst={jumpToFirstError}
                      />
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-sm">
                            Helper: What good looks like
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ul className="list-disc pl-5 text-xs text-gray-700 space-y-1">
                            <li>
                              <b>Prompt</b>: concrete subject, setting, action,
                              lighting, and style hints.
                            </li>
                            <li>
                              <b>Aspect ratio</b>: use 9:16 for shorts; 1:1 for
                              square, 16:9 for widescreen.
                            </li>
                            <li>
                              <b>Speed modes</b>: Default balances quality; Fast
                              for drafts; Slow for fidelity.
                            </li>
                          </ul>
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                ),
              },
              {
                id: "form",
                label: "Form",
                content: (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <FieldText
                        id="scene_id"
                        label="Scene ID"
                        value={form.scene_id}
                        onChange={(v) =>
                          setForm((f) => ({ ...f, scene_id: v }))
                        }
                        error={fieldError(ajvErrors, "/scene_id")}
                      />
                      <FieldText
                        id="duration_s"
                        label="Duration (seconds)"
                        type="number"
                        value={form.duration_s}
                        onChange={(v) =>
                          setForm((f) => ({ ...f, duration_s: v }))
                        }
                        error={fieldError(ajvErrors, "/duration_s")}
                      />
                      <FieldText
                        id="composition"
                        label="Composition"
                        value={form.composition}
                        onChange={(v) =>
                          setForm((f) => ({ ...f, composition: v }))
                        }
                        error={fieldError(ajvErrors, "/composition")}
                        helper="Camera, framing, overlays, CTA placement."
                      />
                      <div>
                        <label className="block text-sm text-gray-700 mb-1">
                          Model
                        </label>
                        <select
                          id="model"
                          className="rounded border px-2 py-1 text-sm w-full"
                          value={form.model}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              model: e.target.value as any,
                            }))
                          }
                        >
                          <option value="ideogram-character">
                            Ideogram Character
                          </option>
                          <option value="imagen-4">Imagen 4</option>
                        </select>
                        <InlineError text={fieldError(ajvErrors, "/model")} />
                      </div>
                      <FieldText
                        id="prompt"
                        label="Prompt"
                        textarea
                        value={form.prompt}
                        onChange={(v) => setForm((f) => ({ ...f, prompt: v }))}
                        error={fieldError(ajvErrors, "/model_inputs/prompt")}
                      />
                      {form.model === "ideogram-character" && (
                        <>
                          <FieldText
                            id="character_reference_image"
                            label="Character reference image URL"
                            value={form.character_reference_image || ""}
                            onChange={(v) =>
                              setForm((f) => ({
                                ...f,
                                character_reference_image: v,
                              }))
                            }
                            error={fieldError(
                              ajvErrors,
                              "/model_inputs/character_reference_image",
                            )}
                          />
                          <div className="grid grid-cols-2 gap-3">
                            <FieldText
                              id="aspect_ratio"
                              label="Aspect ratio"
                              value={form.aspect_ratio}
                              onChange={(v) =>
                                setForm((f) => ({ ...f, aspect_ratio: v }))
                              }
                              error={fieldError(
                                ajvErrors,
                                "/model_inputs/aspect_ratio",
                              )}
                            />
                            <div>
                              <label className="block text-sm text-gray-700 mb-1">
                                Rendering speed
                              </label>
                              <select
                                id="rendering_speed"
                                className="rounded border px-2 py-1 text-sm w-full"
                                value={form.rendering_speed || "Default"}
                                onChange={(e) =>
                                  setForm((f) => ({
                                    ...f,
                                    rendering_speed: e.target.value as any,
                                  }))
                                }
                              >
                                <option>Default</option>
                                <option>Fast</option>
                                <option>Slow</option>
                              </select>
                              <InlineError
                                text={fieldError(
                                  ajvErrors,
                                  "/model_inputs/rendering_speed",
                                )}
                              />
                            </div>
                          </div>
                        </>
                      )}
                      {form.model === "imagen-4" && (
                        <>
                          <FieldText
                            id="aspect_ratio"
                            label="Aspect ratio"
                            value={form.aspect_ratio}
                            onChange={(v) =>
                              setForm((f) => ({ ...f, aspect_ratio: v }))
                            }
                            error={fieldError(
                              ajvErrors,
                              "/model_inputs/aspect_ratio",
                            )}
                          />
                          <FieldText
                            id="negative_prompt"
                            label="Negative prompt (optional)"
                            value={form.negative_prompt || ""}
                            onChange={(v) =>
                              setForm((f) => ({ ...f, negative_prompt: v }))
                            }
                          />
                        </>
                      )}
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-sm">Audio</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <FieldText
                            id="vo_prompt"
                            label="Voiceover prompt"
                            textarea
                            value={form.vo_prompt}
                            onChange={(v) =>
                              setForm((f) => ({ ...f, vo_prompt: v }))
                            }
                          />
                          <div className="mt-2">
                            <div className="flex items-center justify-between">
                              <label className="text-sm text-gray-700">
                                Dialogue lines
                              </label>
                              <button
                                className="rounded border px-2 py-1 text-xs"
                                onClick={() =>
                                  setForm((f) => ({
                                    ...f,
                                    dialogue: [
                                      ...f.dialogue,
                                      { character: "", line: "" },
                                    ],
                                  }))
                                }
                                aria-label="Add dialogue line"
                              >
                                Add line
                              </button>
                            </div>
                            <div className="mt-2 space-y-2">
                              {form.dialogue.map((d, i) => (
                                <div key={i} className="grid grid-cols-2 gap-2">
                                  <input
                                    id={`dialogue_${i}_character`}
                                    className="rounded border px-2 py-1 text-sm"
                                    placeholder="Character"
                                    value={d.character}
                                    onChange={(e) =>
                                      setForm((f) => ({
                                        ...f,
                                        dialogue: f.dialogue.map((v, idx) =>
                                          idx === i
                                            ? {
                                                ...v,
                                                character: e.target.value,
                                              }
                                            : v,
                                        ),
                                      }))
                                    }
                                  />
                                  <input
                                    id={`dialogue_${i}_line`}
                                    className="rounded border px-2 py-1 text-sm"
                                    placeholder="Line"
                                    value={d.line}
                                    onChange={(e) =>
                                      setForm((f) => ({
                                        ...f,
                                        dialogue: f.dialogue.map((v, idx) =>
                                          idx === i
                                            ? { ...v, line: e.target.value }
                                            : v,
                                        ),
                                      }))
                                    }
                                  />
                                </div>
                              ))}
                            </div>
                            <div className="mt-2 text-xs text-gray-600">
                              Use either dialogue or voiceover. If audio isn’t
                              enabled later, it will be ignored.
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                      <div className="pt-2 flex items-center gap-2">
                        <Button
                          onClick={submit}
                          disabled={!isValid || submitBusy}
                          aria-label="Submit plan"
                        >
                          Submit Plan
                        </Button>
                        {!isValid && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={jumpToFirstError}
                            aria-label="Jump to first error"
                          >
                            Jump to first error
                          </Button>
                        )}
                      </div>
                    </div>
                    <div>
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-sm">
                            JSON preview
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <pre className="max-h-[480px] overflow-auto rounded border bg-gray-50 p-2 text-[12px]">
                            {JSON.stringify(scene, null, 2)}
                          </pre>
                        </CardContent>
                      </Card>
                      <div className="mt-3">
                        <HelperCopy />
                      </div>
                    </div>
                  </div>
                ),
              },
            ]}
            defaultId="json"
          />
        </section>
      </div>
    </main>
  );
}

// --- Helpers and small components ---
function HelperCopy() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Helper tips</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="list-disc pl-5 text-xs text-gray-700 space-y-1">
          <li>
            <b>Prompts</b>: specify subject, setting, action, lighting,
            typography.
          </li>
          <li>
            <b>Aspect ratio</b>: 9:16 for shorts; 1:1 or 16:9 as needed.
          </li>
          <li>
            <b>Speed</b>: Default for balance, Fast for drafts, Slow for
            fidelity.
          </li>
        </ul>
      </CardContent>
    </Card>
  );
}

function FieldText({
  id,
  label,
  value,
  onChange,
  error,
  helper,
  textarea,
  type = "text",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string | null;
  helper?: string;
  textarea?: boolean;
  type?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="text-gray-700">{label}</span>
      {textarea ? (
        <textarea
          id={id}
          className="mt-1 h-24 w-full rounded border p-2 text-sm"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          id={id}
          type={type}
          className="mt-1 w-full rounded border px-2 py-1 text-sm"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {helper && <div className="mt-1 text-xs text-gray-600">{helper}</div>}
      <InlineError text={error} id={`${id}_error`} />
    </label>
  );
}

function InlineError({ text, id }: { text?: string | null; id?: string }) {
  if (!text) return null;
  return (
    <div id={id} className="mt-1 text-xs text-red-700">
      {text}
    </div>
  );
}

function ValidationPanel({
  isValid,
  errors,
  onJumpFirst,
}: {
  isValid: boolean;
  errors: Array<{ path: string; message: string }>;
  onJumpFirst: () => void;
}) {
  return (
    <Card className="sticky top-4">
      <CardHeader className="flex items-center justify-between">
        <CardTitle className="text-sm">Validation</CardTitle>
      </CardHeader>
      <CardContent>
        {isValid ? (
          <div className="text-green-700 text-xs">Valid ✔︎</div>
        ) : (
          <div className="space-y-2">
            <button
              onClick={onJumpFirst}
              className="rounded border px-2 py-1 text-xs"
              aria-label="Jump to first error"
            >
              Jump to first error
            </button>
            <ul className="list-disc pl-5 text-xs">
              {errors.map((e, i) => (
                <li key={i} className="text-red-700">
                  <span className="font-mono mr-1">{e.path}</span>
                  {e.message}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function fieldError(
  errs: Array<{ path: string; message: string }>,
  jsonPath: string,
): string | null {
  const found = errs.find((e) => e.path === jsonPath);
  return found ? found.message : null;
}

function fieldIdFromJsonPath(path: string): string {
  switch (path) {
    case "/scene_id":
      return "scene_id";
    case "/duration_s":
      return "duration_s";
    case "/composition":
      return "composition";
    case "/model":
      return "model";
    case "/model_inputs/prompt":
      return "prompt";
    case "/model_inputs/character_reference_image":
      return "character_reference_image";
    case "/model_inputs/aspect_ratio":
      return "aspect_ratio";
    case "/model_inputs/rendering_speed":
      return "rendering_speed";
    default:
      return "scene_id";
  }
}

function sceneFromForm(f: FormState): SceneSpec {
  const durationNum = Number(f.duration_s);
  const base: any = {
    scene_id: f.scene_id,
    duration_s: isFinite(durationNum) ? durationNum : 0,
    composition: f.composition,
    props: [],
    overlays: [],
    model: f.model,
    model_inputs: {} as Record<string, unknown>,
    audio: {
      dialogue: f.dialogue,
      vo_prompt: f.vo_prompt || "",
    },
  };
  if (f.model === "ideogram-character") {
    base.model_inputs = {
      prompt: f.prompt,
      character_reference_image: f.character_reference_image || "",
      aspect_ratio: f.aspect_ratio,
      rendering_speed: f.rendering_speed || "Default",
    };
  } else if (f.model === "imagen-4") {
    base.model_inputs = {
      prompt: f.prompt,
      aspect_ratio: f.aspect_ratio,
      negative_prompt: f.negative_prompt || undefined,
    };
  }
  return base;
}

function formFromScene(s: SceneSpec): FormState {
  const model = (s?.model as ModelKey) || "ideogram-character";
  const inputs = (s?.model_inputs || {}) as Record<string, any>;
  return {
    scene_id: String(s?.scene_id || ""),
    duration_s: String(s?.duration_s ?? ""),
    composition: String(s?.composition || ""),
    model,
    prompt: String(inputs.prompt || ""),
    character_reference_image:
      model === "ideogram-character"
        ? String(inputs.character_reference_image || "")
        : undefined,
    aspect_ratio: String(inputs.aspect_ratio || "9:16"),
    rendering_speed:
      model === "ideogram-character"
        ? inputs.rendering_speed || "Default"
        : undefined,
    negative_prompt:
      model === "imagen-4" ? String(inputs.negative_prompt || "") : "",
    vo_prompt: String(s?.audio?.vo_prompt || ""),
    dialogue: Array.isArray(s?.audio?.dialogue)
      ? (s.audio.dialogue as any[]).map((d) => ({
          character: String(d.character || ""),
          line: String(d.line || ""),
        }))
      : [],
  };
}

function AudioMergeInline({
  onMerge,
}: {
  onMerge: (
    vo: string,
    dlg: Array<{ character: string; line: string }>,
  ) => void;
}) {
  const [vo, setVo] = useState("");
  const [dlg, setDlg] = useState<Array<{ character: string; line: string }>>(
    [],
  );
  return (
    <div>
      <label className="block text-sm">
        <span className="text-gray-700">Voiceover prompt (vo_prompt)</span>
        <textarea
          className="mt-1 h-20 w-full rounded border p-2 text-sm"
          value={vo}
          onChange={(e) => setVo(e.target.value)}
        />
      </label>
      <div className="mt-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-700">Dialogue</span>
          <button
            className="rounded border px-2 py-1 text-xs"
            onClick={() =>
              setDlg((prev) => [...prev, { character: "", line: "" }])
            }
            aria-label="Add dialogue line"
          >
            Add line
          </button>
        </div>
        <div className="mt-2 space-y-2">
          {dlg.map((d, i) => (
            <div key={i} className="grid grid-cols-2 gap-2">
              <input
                className="rounded border px-2 py-1 text-sm"
                placeholder="Character"
                value={d.character}
                onChange={(e) =>
                  setDlg((arr) =>
                    arr.map((v, idx) =>
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
                  setDlg((arr) =>
                    arr.map((v, idx) =>
                      idx === i ? { ...v, line: e.target.value } : v,
                    ),
                  )
                }
              />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3">
        <button
          className="rounded border px-3 py-1.5 text-sm"
          onClick={() => onMerge(vo, dlg)}
        >
          Merge Audio into JSON
        </button>
      </div>
    </div>
  );
}

// helper functions defined within component scope above

const exampleIdeogram: SceneSpec = {
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
  audio: { dialogue: [], vo_prompt: "" },
};

const exampleImagen4: SceneSpec = {
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
