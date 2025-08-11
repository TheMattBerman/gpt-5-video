import { useMemo, useState } from "react";
import Link from "next/link";
import PageHeader from "../components/PageHeader";
import { ajv } from "@gpt5video/shared";
// For Week 1 in GUI, import schema JSON directly to avoid package export quirks from the schemas package
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import brandProfileSchema from "../../../../packages/schemas/schemas/brand_profile.schema.json";

export default function BrandIngestPage() {
  const apiBase = useMemo(
    () => process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000",
    [],
  );
  const [jsonText, setJsonText] = useState<string>(() =>
    JSON.stringify(exampleBrandProfile, null, 2),
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [resultId, setResultId] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);

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
    } catch (err: any) {
      setErrors([`Submit error: ${err?.message || String(err)}`]);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-dvh bg-gray-50">
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

        <section className="rounded border bg-white p-4">
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
                  onClick={handleSubmit}
                  disabled={submitting || errors.length > 0}
                  className="rounded bg-black px-3 py-1.5 text-white text-sm disabled:opacity-50"
                >
                  {submitting ? "Submitting..." : "Submit"}
                </button>
                {resultId && (
                  <div className="text-sm">
                    Created id: <span className="font-mono">{resultId}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
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
