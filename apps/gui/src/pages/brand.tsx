import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PageHeader from "../components/PageHeader";
import { Card } from "../components/ui";
import { ajv } from "@gpt5video/shared";
import { useToast } from "../components/Toast";
// For Week 1 in GUI, import schema JSON directly to avoid package export quirks from the schemas package
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import brandProfileSchema from "../../../../packages/schemas/schemas/brand_profile.schema.json";

export default function BrandIngestPage() {
  const apiBase = useMemo(
    () => process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000",
    [],
  );
  const { show } = useToast();
  const [jsonText, setJsonText] = useState<string>(() =>
    JSON.stringify(exampleBrandProfile, null, 2),
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [resultId, setResultId] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [briefText, setBriefText] = useState<string>("");
  const [briefSubmitting, setBriefSubmitting] = useState<boolean>(false);

  const validator = useMemo(() => ajv.compile(brandProfileSchema as any), []);

  function validate(text: string) {
    try {
      const obj = JSON.parse(text);
      const valid = validator(obj);
      if (valid) {
        setErrors([]);
        return { valid: true, obj } as const;
      }
      setErrors(
        (validator.errors || []).map(
          (e: any) => `${e.instancePath || "/"} ${e.message || "invalid"}`,
        ),
      );
      return { valid: false, obj: null } as const;
    } catch (err: any) {
      setErrors([`JSON parse error: ${err?.message || String(err)}`]);
      return { valid: false, obj: null } as const;
    }
  }

  // Load latest saved profile on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // Prefer server latest; fall back to localStorage
        const res = await fetch(`${apiBase}/ingest/brand/latest`);
        if (res.ok) {
          const data = await res.json();
          const obj = data?.data;
          if (obj && !cancelled) {
            const txt = JSON.stringify(obj, null, 2);
            setJsonText(txt);
            validate(txt);
          }
        } else {
          try {
            const local = window.localStorage.getItem(
              "gpt5video_brand_profile",
            );
            if (local && !cancelled) {
              setJsonText(local);
              validate(local);
            }
          } catch {}
        }
      } catch {
        try {
          const local = window.localStorage.getItem("gpt5video_brand_profile");
          if (local && !cancelled) {
            setJsonText(local);
            validate(local);
          }
        } catch {}
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiBase]);

  async function handleSubmit() {
    const { valid, obj } = validate(jsonText);
    if (!valid || !obj) return;
    setSubmitting(true);
    setResultId("");
    try {
      const res = await fetch(`${apiBase}/ingest/brand`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(obj),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "submit_failed");
      setResultId(String(data.id || ""));
      try {
        window.localStorage.setItem(
          "gpt5video_brand_profile",
          JSON.stringify(obj, null, 2),
        );
      } catch {}
      show({ title: "Brand saved", variant: "success" });
    } catch (err: any) {
      setErrors([`Submit error: ${err?.message || String(err)}`]);
      show({
        title: "Save failed",
        description: String(err?.message || err),
        variant: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-dvh">
      <div className="mx-auto max-w-5xl p-6 space-y-6">
        <PageHeader
          title="Brand Ingest"
          description="Paste or edit your brand profile JSON. We validate against schema before saving."
        />
        <header className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Brand Ingest</h1>
          <nav className="flex gap-4 text-sm">
            <Link href="/" className="text-blue-600 underline">
              Dashboard
            </Link>
          </nav>
        </header>

        <Card>
          <div className="mb-3 text-sm text-gray-700">
            Paste or edit a `brand_profile.json` then validate and submit.
          </div>
          <div className="grid grid-cols-2 gap-4">
            <textarea
              className="h-[420px] w-full resize-vertical rounded border p-2 font-mono text-xs"
              value={jsonText}
              onChange={(e) => {
                setJsonText(e.target.value);
                validate(e.target.value);
              }}
            />
            <div className="flex flex-col">
              <div className="text-sm font-medium">Validation</div>
              <div className="mt-2 flex-1 overflow-auto rounded border bg-gray-50 p-2 text-xs">
                {loading ? (
                  <div className="text-gray-600">Loading…</div>
                ) : errors.length === 0 ? (
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
                  onClick={handleSubmit}
                  disabled={submitting || errors.length > 0}
                  className="rounded bg-black px-3 py-1.5 text-white text-sm disabled:opacity-50"
                >
                  {submitting ? "Submitting..." : "Submit"}
                </button>
                <button
                  onClick={() => {
                    try {
                      window.localStorage.setItem(
                        "gpt5video_brand_profile",
                        jsonText,
                      );
                      show({ title: "Saved locally", variant: "success" });
                    } catch {
                      show({ title: "Local save failed", variant: "error" });
                    }
                  }}
                  className="rounded border px-3 py-1.5 text-sm"
                >
                  Save locally
                </button>
                <button
                  onClick={async () => {
                    setLoading(true);
                    try {
                      const res = await fetch(`${apiBase}/ingest/brand/latest`);
                      if (!res.ok) throw new Error("not_found");
                      const data = await res.json();
                      const txt = JSON.stringify(data?.data ?? {}, null, 2);
                      setJsonText(txt);
                      validate(txt);
                      show({ title: "Loaded latest", variant: "success" });
                    } catch (e: any) {
                      show({
                        title: "Load failed",
                        description: String(e?.message || e),
                        variant: "error",
                      });
                    } finally {
                      setLoading(false);
                    }
                  }}
                  className="rounded border px-3 py-1.5 text-sm"
                >
                  Load latest
                </button>
                {resultId && (
                  <div className="text-sm">
                    Created id: <span className="font-mono">{resultId}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div className="mb-3 text-sm text-gray-700">
            Or drop a creative brief and let the system synthesize a brand
            profile for you.
          </div>
          <div className="grid grid-cols-2 gap-4">
            <textarea
              className="h-[240px] w-full resize-vertical rounded border p-2 font-mono text-xs"
              placeholder="Paste creative brief here..."
              value={briefText}
              onChange={(e) => setBriefText(e.target.value)}
            />
            <div className="flex flex-col">
              <div className="text-sm font-medium">Generate from brief</div>
              <div className="text-xs text-gray-600 mt-1">
                We call the LLM to extract voice, ICP, banned phrases, legal
                constraints, and objectives into the schema.
              </div>
              <div className="mt-3 flex items-center gap-3">
                <button
                  onClick={async () => {
                    if (!briefText.trim()) return;
                    setBriefSubmitting(true);
                    try {
                      const res = await fetch(`${apiBase}/ingest/brief`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          brief_text: briefText,
                          brand_key: "default",
                        }),
                      });
                      const data = await res.json();
                      if (!res.ok)
                        throw new Error(String(data?.error || res.statusText));
                      const profile = data?.data || data;
                      const txt = JSON.stringify(profile, null, 2);
                      setJsonText(txt);
                      validate(txt);
                      setResultId(String(data?.id || ""));
                      show({ title: "Profile generated", variant: "success" });
                    } catch (e: any) {
                      show({
                        title: "Generation failed",
                        description: String(e?.message || e),
                        variant: "error",
                      });
                    } finally {
                      setBriefSubmitting(false);
                    }
                  }}
                  disabled={briefSubmitting || !briefText.trim()}
                  className="rounded bg-black px-3 py-1.5 text-white text-sm disabled:opacity-50"
                >
                  {briefSubmitting ? "Generating..." : "Generate profile"}
                </button>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </main>
  );
}

const exampleBrandProfile = {
  brand_id: "noteworthy-spirits",
  voice: {
    principles: ["energetic", "confident", "founder-to-founder"],
    banned_phrases: ["hangover-free"],
  },
  icp_segments: [
    { name: "DTC operators", pains: ["rising CAC"], gains: ["faster testing"] },
  ],
  proof: ["3M impressions in 14 days", "catalog rights secured"],
  legal_constraints: ["no medical claims"],
  objectives: ["lead gen", "email capture", "retargetable views"],
  done_criteria: ["5 hooks ship with approved scenes and video drafts"],
};
