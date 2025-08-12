import { useRouter } from "next/router";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

export default function ShareView() {
  const router = useRouter();
  const { id } = router.query;
  const apiBase = useMemo(
    () => process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000",
    [],
  );
  const [asset, setAsset] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || Array.isArray(id)) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`${apiBase}/share/${id}`);
        const data = await res.json();
        if (!cancelled) {
          if (res.ok) setAsset(data);
          else setError(String(data?.error || res.statusText));
        }
      } catch (e: any) {
        if (!cancelled) setError(String(e?.message || e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiBase, id]);

  const aspect = asset?.aspect_ratio || "9:16";
  const aspectLabel =
    aspect === "1:1" ? "1x1" : aspect === "16:9" ? "16x9" : "9x16";

  return (
    <div className="min-h-dvh bg-neutral-50">
      <header className="sticky top-0 z-10 border-b bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60">
        <div className="mx-auto max-w-content-4xl px-4 py-3 flex items-center justify-between">
          <div className="text-sm font-medium text-gray-900">
            Shared Preview
          </div>
          <Link href="/" className="text-xs text-accent-700 underline">
            Back to app
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-content-4xl p-4 md:p-6">
        {loading ? (
          <div className="text-sm text-gray-600">Loading…</div>
        ) : error ? (
          <div className="rounded-md border bg-white p-4 text-sm text-red-700">
            {error}
          </div>
        ) : !asset ? (
          <div className="rounded-md border bg-white p-4 text-sm text-gray-700">
            Not found
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-xs text-gray-600">
              {String(asset?.title || "")}
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="rounded bg-gray-100 px-1.5 py-0.5">
                {aspectLabel}
              </span>
              {asset?.seed != null && (
                <span className="rounded bg-gray-100 px-1.5 py-0.5">
                  seed {String(asset.seed)}
                </span>
              )}
              {asset?.model_version && (
                <span className="rounded bg-gray-100 px-1.5 py-0.5">
                  {String(asset.model_version)}
                </span>
              )}
            </div>
            <div className="rounded-md border bg-white p-2">
              {/\.mp4|\.webm/i.test(String(asset?.url || "")) ? (
                <video
                  src={asset.url}
                  controls
                  className="w-full max-h-[70vh] object-contain"
                />
              ) : /\.png|\.jpg|\.jpeg|\.gif/i.test(String(asset?.url || "")) ? (
                <img
                  src={asset.url}
                  className="w-full max-h-[70vh] object-contain"
                />
              ) : asset?.url ? (
                <a
                  href={asset.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent-700 underline"
                >
                  Open asset
                </a>
              ) : (
                <div className="text-sm text-gray-600">No asset URL</div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
