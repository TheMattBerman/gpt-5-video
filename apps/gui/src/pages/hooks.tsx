import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { addJob, updateJob } from "../lib/jobs";

export default function HooksPage() {
  const apiBase = useMemo(
    () => process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000",
    [],
  );
  const [assets, setAssets] = useState<
    Array<{
      key: string;
      size: number | null;
      last_modified: string | null;
      preview_url?: string;
    }>
  >([]);
  const [mineBody, setMineBody] = useState<string>(() =>
    JSON.stringify(
      { sources: [{ platform: "tiktok", handle: "@creator" }] },
      null,
      2,
    ),
  );
  const [synthBody, setSynthBody] = useState<string>(() =>
    JSON.stringify({ corpus_id: "corpus_1", icp: "DTC operators" }, null, 2),
  );
  const [mineResp, setMineResp] = useState<any>(null);
  const [synthResp, setSynthResp] = useState<any>(null);
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${apiBase}/assets?prefix=dev/&limit=50`);
        if (!res.ok) return;
        const data = await res.json();
        setAssets(Array.isArray(data.items) ? data.items : []);
      } catch {}
    })();
  }, [apiBase]);
  return (
    <main className="min-h-dvh bg-gray-50">
      <div className="mx-auto max-w-4xl p-6 space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Hooks</h1>
          <nav className="flex gap-4 text-sm">
            <Link href="/" className="text-blue-600 underline">
              Dashboard
            </Link>
            <Link href="/brand" className="text-blue-600 underline">
              Brand
            </Link>
          </nav>
        </header>

        <section className="rounded border bg-white p-4 space-y-3">
          <div className="text-sm font-medium">
            Recent assets (prefix: dev/)
          </div>
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-gray-600">
                  <th className="px-2 py-1">Key</th>
                  <th className="px-2 py-1">Size</th>
                  <th className="px-2 py-1">Modified</th>
                  <th className="px-2 py-1">Preview</th>
                </tr>
              </thead>
              <tbody>
                {assets.map((a) => (
                  <tr key={a.key} className="border-t">
                    <td className="px-2 py-1 font-mono">{a.key}</td>
                    <td className="px-2 py-1">{a.size ?? ""}</td>
                    <td className="px-2 py-1 text-gray-600">
                      {a.last_modified ?? ""}
                    </td>
                    <td className="px-2 py-1">
                      {a.preview_url ? (
                        <a
                          className="text-blue-600 underline"
                          href={a.preview_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          open
                        </a>
                      ) : (
                        ""
                      )}
                    </td>
                  </tr>
                ))}
                {assets.length === 0 && (
                  <tr>
                    <td className="px-2 py-3 text-gray-500" colSpan={4}>
                      No assets found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
        <section className="rounded border bg-white p-4">
          <div className="text-sm text-gray-700">
            Source setup and mining UI coming next. Placeholder for Week 1.
          </div>
        </section>
        <section className="rounded border bg-white p-4 grid grid-cols-2 gap-4">
          <div>
            <div className="text-sm font-medium mb-2">
              Mine Hooks (POST /hooks/mine)
            </div>
            <textarea
              className="h-40 w-full rounded border p-2 font-mono text-xs"
              value={mineBody}
              onChange={(e) => setMineBody(e.target.value)}
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                className="rounded bg-black px-3 py-1.5 text-white text-sm"
                onClick={async () => {
                  // Minimal validation: ensure JSON and sources array exists
                  let parsed: any;
                  try {
                    parsed = JSON.parse(mineBody);
                  } catch (e) {
                    setMineResp({ ok: false, data: { error: "invalid_json" } });
                    return;
                  }
                  if (!parsed?.sources || !Array.isArray(parsed.sources)) {
                    setMineResp({
                      ok: false,
                      data: { error: "sources_required" },
                    });
                    return;
                  }
                  const provisionalId = `hooks_mine_${Date.now()}`;
                  addJob({
                    id: provisionalId,
                    type: "hooks_mine",
                    status: "queued",
                    createdAt: Date.now(),
                  });
                  const res = await fetch(`${apiBase}/hooks/mine`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(parsed),
                  });
                  const data = await res.json();
                  setMineResp({ ok: res.ok, data });
                  if (res.ok)
                    updateJob(provisionalId, {
                      status: "succeeded",
                      completedAt: Date.now(),
                    });
                  else
                    updateJob(provisionalId, {
                      status: "failed",
                      completedAt: Date.now(),
                      error: String(data?.error || res.statusText),
                    });
                }}
              >
                Send
              </button>
            </div>
            {mineResp && (
              <pre className="mt-2 max-h-48 overflow-auto rounded border bg-gray-50 p-2 text-xs">
                {JSON.stringify(mineResp, null, 2)}
              </pre>
            )}
          </div>
          <div>
            <div className="text-sm font-medium mb-2">
              Synthesize Hooks (POST /hooks/synthesize)
            </div>
            <textarea
              className="h-40 w-full rounded border p-2 font-mono text-xs"
              value={synthBody}
              onChange={(e) => setSynthBody(e.target.value)}
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                className="rounded bg-black px-3 py-1.5 text-white text-sm"
                onClick={async () => {
                  let parsed: any;
                  try {
                    parsed = JSON.parse(synthBody);
                  } catch (e) {
                    setSynthResp({
                      ok: false,
                      data: { error: "invalid_json" },
                    });
                    return;
                  }
                  if (!parsed?.corpus_id) {
                    setSynthResp({
                      ok: false,
                      data: { error: "corpus_id_required" },
                    });
                    return;
                  }
                  const provisionalId = `hooks_synthesize_${Date.now()}`;
                  addJob({
                    id: provisionalId,
                    type: "hooks_synthesize",
                    status: "queued",
                    createdAt: Date.now(),
                  });
                  const res = await fetch(`${apiBase}/hooks/synthesize`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(parsed),
                  });
                  const data = await res.json();
                  setSynthResp({ ok: res.ok, data });
                  if (res.ok)
                    updateJob(provisionalId, {
                      status: "succeeded",
                      completedAt: Date.now(),
                    });
                  else
                    updateJob(provisionalId, {
                      status: "failed",
                      completedAt: Date.now(),
                      error: String(data?.error || res.statusText),
                    });
                }}
              >
                Send
              </button>
            </div>
            {synthResp && (
              <pre className="mt-2 max-h-48 overflow-auto rounded border bg-gray-50 p-2 text-xs">
                {JSON.stringify(synthResp, null, 2)}
              </pre>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
