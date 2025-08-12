import Link from "next/link";
import PageHeader from "../components/PageHeader";
import { useMemo, useState } from "react";
import { useToast } from "../components/Toast";
import { fetchWithAuth } from "../lib/http";
import { Button, SegmentedControl, Tooltip } from "../components/ui";
import QuickTour from "../components/QuickTour";

export default function ReviewExportPage() {
  const apiBase = useMemo(
    () => process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000",
    [],
  );
  const [checks, setChecks] = useState({
    tone: false,
    claims: false,
    assets: false,
  });
  const [preset, setPreset] = useState<"9:16" | "1:1" | "16:9" | "">("");
  const [s3Key, setS3Key] = useState<string>("dev/exports/draft.mp4");
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(undefined);
  const { show } = useToast();

  async function handlePreview() {
    try {
      const res = await fetch(
        `${apiBase}/uploads/debug-get?key=${encodeURIComponent(s3Key)}`,
      );
      if (!res.ok) return;
      const data = await res.json();
      setPreviewUrl(data.public_url || data.url);
    } catch {}
  }

  function computeKey(base = "dev/exports", name = "draft") {
    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "");
    const suffix =
      preset === "1:1" ? "1x1" : preset === "16:9" ? "16x9" : "9x16";
    return `${base.replace(/\/$/, "")}/${name}_${suffix}_${ts}.mp4`;
  }

  function applyPreset(p: "9:16" | "1:1" | "16:9") {
    setPreset(p);
    setS3Key(computeKey());
  }

  return (
    <main className="min-h-dvh bg-gray-50">
      <div className="mx-auto max-w-4xl p-6 space-y-6">
        <QuickTour
          steps={[
            {
              id: "checklist",
              title: "Checklist",
              description: "Confirm tone, claims, and assets are ready.",
            },
            {
              id: "presets",
              title: "Presets",
              description: "Pick an aspect ratio and see S3 key suffix.",
            },
            {
              id: "actions",
              title: "Actions",
              description: "Copy the S3 key or open a signed URL.",
            },
          ]}
          storageKey="gpt5video_quick_tour_review"
        />
        <PageHeader
          title="Review & Export"
          description="Run the checklist, pick an aspect preset, copy or open S3 keys, and download the CSV report."
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
          <div className="text-sm font-medium mb-2">Checklist</div>
          <div className="space-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={checks.tone}
                onChange={(e) =>
                  setChecks((c) => ({ ...c, tone: e.target.checked }))
                }
              />
              Tone matches brand voice
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={checks.claims}
                onChange={(e) =>
                  setChecks((c) => ({ ...c, claims: e.target.checked }))
                }
              />
              Claims approved (no banned phrases)
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={checks.assets}
                onChange={(e) =>
                  setChecks((c) => ({ ...c, assets: e.target.checked }))
                }
              />
              All assets present (images, video, overlays)
            </label>
          </div>
        </section>

        <section className="rounded border bg-white p-4">
          <div className="text-sm font-medium mb-2">Export presets</div>
          <SegmentedControl
            ariaLabel="Export presets"
            options={[
              { value: "9:16", label: "9:16" },
              { value: "1:1", label: "1:1" },
              { value: "16:9", label: "16:9" },
            ]}
            value={preset || "9:16"}
            onChange={(v) => applyPreset(v as any)}
          />
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <label>
              <div className="text-gray-700">S3 key</div>
              <input
                className="mt-1 w-full rounded border px-2 py-1 text-sm"
                value={s3Key}
                onChange={(e) => setS3Key(e.target.value)}
                placeholder="dev/exports/draft.mp4"
              />
              <div className="mt-1 text-xs text-gray-600">
                Preset note:{" "}
                {preset === "1:1"
                  ? "1x1"
                  : preset === "16:9"
                    ? "16x9"
                    : preset === "9:16"
                      ? "9x16"
                      : "n/a"}
              </div>
            </label>
            <div className="flex items-end">
              <Button
                variant="secondary"
                onClick={handlePreview}
                aria-label="Preview from S3"
              >
                Preview from S3
              </Button>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs">
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(s3Key);
                  show({
                    title: "Copied!",
                    description: "S3 key copied",
                    variant: "success",
                  });
                } catch {
                  show({ title: "Copy failed", variant: "error" });
                }
              }}
            >
              Copy S3 key
            </Button>
            <Tooltip label="Opens a signed URL to the asset">
              <a
                className="rounded border px-2 py-1 underline"
                href={`${apiBase}/uploads/debug-get?key=${encodeURIComponent(s3Key)}`}
                target="_blank"
                rel="noreferrer"
                aria-label="Open signed URL"
              >
                Open (signed)
              </a>
            </Tooltip>
          </div>
          {previewUrl && (
            <div className="mt-3">
              <div className="text-xs text-gray-600 mb-1">Preview</div>
              {/\.mp4|\.webm/i.test(previewUrl) ? (
                <video
                  src={previewUrl}
                  controls
                  className="max-h-96 w-full rounded border"
                />
              ) : (
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 underline"
                >
                  {previewUrl}
                </a>
              )}
            </div>
          )}
        </section>

        <section className="rounded border bg-white p-4">
          <div className="text-sm font-medium mb-2">Report</div>
          <div className="text-sm text-gray-700 mb-2">
            Download today's renders/videos CSV.
          </div>
          <a
            href={`${apiBase}/export/report.csv`}
            className="inline-flex items-center rounded border px-3 py-1.5 text-sm underline"
          >
            Download report (CSV)
          </a>
        </section>
      </div>
    </main>
  );
}
