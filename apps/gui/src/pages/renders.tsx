import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Job = {
  id: string;
  type: string;
  status: string;
  prediction_id?: string;
  model_version?: string;
  seed?: number | null;
  duration_ms?: number | null;
  created_at?: string;
  artifacts?: Array<{ id: number; type?: string; url?: string; key?: string }>;
};

export default function RendersPage() {
  const apiBase = useMemo(
    () => process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000",
    [],
  );
  const [items, setItems] = useState<Job[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [tick, setTick] = useState<number>(0);

  const fetchData = async () => {
    try {
      const res = await fetch(`${apiBase}/jobs/recent?limit=50`);
      const data = await res.json();
      setItems(
        Array.isArray(data.items)
          ? data.items.filter(
              (j: Job) =>
                j.type === "scene_render" || j.type === "video_assemble",
            )
          : [],
      );
    } catch {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    fetchData();
    const timer = setInterval(fetchData, 4000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [apiBase, tick]);

  useEffect(() => {
    const es = new EventSource(`${apiBase}/jobs/stream`);
    const onJob = () => setTick((t) => t + 1);
    es.addEventListener("job", onJob as any);
    return () => {
      es.removeEventListener("job", onJob as any);
      es.close();
    };
  }, [apiBase]);

  return (
    <main className="min-h-dvh bg-gray-50">
      <div className="mx-auto max-w-5xl p-6 space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Renders</h1>
          <nav className="flex gap-4 text-sm">
            <Link className="text-blue-600 underline" href="/">
              Dashboard
            </Link>
          </nav>
        </header>
        <section className="rounded border bg-white p-4">
          <div className="text-sm font-medium mb-2">Recent renders</div>
          {loading ? (
            <div className="text-sm text-gray-600">Loading…</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {items.map((j) => (
                <div key={j.id} className="rounded border p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="px-1.5 py-0.5 rounded bg-gray-100">
                      {j.type}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded ${j.status === "succeeded" ? "bg-green-100 text-green-800" : j.status === "failed" ? "bg-red-100 text-red-800" : "bg-yellow-100 text-yellow-800"}`}
                    >
                      {j.status}
                    </span>
                  </div>
                  <div className="text-xs text-gray-600">
                    id: <span className="font-mono">{j.id}</span>
                  </div>
                  {j.prediction_id && (
                    <div className="text-xs text-gray-600">
                      prediction_id:{" "}
                      <span className="font-mono">{j.prediction_id}</span>
                    </div>
                  )}
                  {j.model_version && (
                    <div className="text-xs text-gray-600">
                      model_version:{" "}
                      <span className="font-mono">{j.model_version}</span>
                    </div>
                  )}
                  {typeof j.seed === "number" && (
                    <div className="text-xs text-gray-600">
                      seed: <span className="font-mono">{String(j.seed)}</span>
                    </div>
                  )}
                  {typeof j.duration_ms === "number" && (
                    <div className="text-xs text-gray-600">
                      duration_ms:{" "}
                      <span className="font-mono">{String(j.duration_ms)}</span>
                    </div>
                  )}
                  {!!j.artifacts?.length && (
                    <div className="mt-2">
                      <div className="text-xs text-gray-600">Artifacts</div>
                      <div className="mt-1 space-y-1">
                        {j.artifacts!.map((a) => (
                          <div key={a.id} className="text-xs">
                            {a.url &&
                              (/\.mp4|\.webm/i.test(a.url) ? (
                                <video
                                  src={a.url}
                                  controls
                                  className="w-full max-h-56 rounded border"
                                />
                              ) : /\.png|\.jpg|\.jpeg|\.gif/i.test(a.url) ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={a.url}
                                  alt="artifact"
                                  className="w-full max-h-56 object-contain rounded border"
                                />
                              ) : null)}
                            {a.url &&
                              !/\.mp4|\.webm|\.png|\.jpg|\.jpeg|\.gif/i.test(
                                a.url,
                              ) && (
                                <a
                                  className="text-blue-600 underline"
                                  href={a.url}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {a.url}
                                </a>
                              )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {items.length === 0 && (
                <div className="text-sm text-gray-500">No jobs yet.</div>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
