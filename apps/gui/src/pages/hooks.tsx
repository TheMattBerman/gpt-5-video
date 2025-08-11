import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { addJob, updateJob } from "../lib/jobs";
import { fetchWithAuth } from "../lib/http";
import { useToast } from "../components/Toast";

type HookCorpusRow = {
  id: number;
  mine_id: string;
  platform?: string;
  author?: string;
  url?: string;
  caption_or_transcript?: string;
  detected_format?: string;
  metrics?: any;
  scraper?: string;
  scrape_meta?: any;
  created_at?: string;
};

type HookSynthRow = {
  id: number;
  synth_id: string;
  mine_id?: string | null;
  hook_text?: string;
  angle?: string;
  icp?: string;
  risk_flags?: string[] | null;
  inspiration_url?: string;
  approved?: boolean;
  edited_hook_text?: string | null;
  created_at?: string;
};

export default function HooksPage() {
  const apiBase = useMemo(
    () => process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000",
    [],
  );
  const { show } = useToast();
  const [assets, setAssets] = useState<
    Array<{
      key: string;
      size: number | null;
      last_modified: string | null;
      preview_url?: string;
    }>
  >([]);
  const [corpus, setCorpus] = useState<HookCorpusRow[]>([]);
  const [synth, setSynth] = useState<HookSynthRow[]>([]);
  const [lastMineId, setLastMineId] = useState<string>("");
  const [lastSynthId, setLastSynthId] = useState<string>("");
  const [sources, setSources] = useState<
    Array<{
      platform: "tiktok" | "instagram" | "youtube";
      handle_or_url: string;
      limit: number;
      notes?: string;
    }>
  >(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem("gpt5video_hooks_sources");
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) return parsed;
      return [];
    } catch {
      return [];
    }
  });
  const [platform, setPlatform] = useState<"tiktok" | "instagram" | "youtube">(
    "tiktok",
  );
  const [handleOrUrl, setHandleOrUrl] = useState<string>("");
  const [limit, setLimit] = useState<number>(10);
  const [notes, setNotes] = useState<string>("");
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
  const [mineProgress, setMineProgress] = useState<string>("");
  const [synthProgress, setSynthProgress] = useState<string>("");
  const [synthErrorCat, setSynthErrorCat] = useState<string>("");
  const [mineErrorCat, setMineErrorCat] = useState<string>("");
  const [corpusPage, setCorpusPage] = useState<{
    limit: number;
    offset: number;
  }>({ limit: 20, offset: 0 });
  const [synthPage, setSynthPage] = useState<{ limit: number; offset: number }>(
    { limit: 20, offset: 0 },
  );
  const [synthApprovedFilter, setSynthApprovedFilter] = useState<
    "all" | "approved" | "unapproved"
  >("all");
  const [synthIcp, setSynthIcp] = useState<string>("");
  const [synthEdit, setSynthEdit] = useState<{
    open: boolean;
    row?: HookSynthRow;
  }>(() => ({ open: false }));
  const [corpusSort, setCorpusSort] = useState<string>("created_at:desc");
  const [synthSort, setSynthSort] = useState<string>("created_at:desc");
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

  // SSE progress for mining/synthesis
  useEffect(() => {
    const es = new EventSource(`${apiBase}/jobs/stream`);
    const onJob = (ev: MessageEvent) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data || "{}");
        if (data?.type === "hooks_mine") {
          if (data.status === "processing" && data.progress)
            setMineProgress(
              `${data.progress.step || "processing"} ${data.progress.pct ?? 0}%`,
            );
          if (data.status === "succeeded") {
            setMineProgress("done");
            setMineErrorCat("");
          }
          if (data.status === "failed") {
            setMineProgress("failed");
            setMineErrorCat(String(data.error_category || ""));
          }
        }
        if (data?.type === "hooks_synthesize") {
          if (data.status === "processing" && data.progress)
            setSynthProgress(
              `${data.progress.step || "processing"} ${data.progress.pct ?? 0}%`,
            );
          if (data.status === "succeeded") {
            setSynthProgress("done");
            setSynthErrorCat("");
          }
          if (data.status === "failed") {
            setSynthProgress("failed");
            setSynthErrorCat(String(data.error_category || ""));
          }
        }
      } catch {}
    };
    es.addEventListener("job", onJob as any);
    return () => {
      es.removeEventListener("job", onJob as any);
      es.close();
    };
  }, [apiBase]);

  async function refreshCorpus() {
    const params = new URLSearchParams();
    if (lastMineId) params.set("mine_id", lastMineId);
    params.set("limit", String(corpusPage.limit));
    params.set("offset", String(corpusPage.offset));
    if (corpusSort) params.set("sort", corpusSort);
    const res = await fetch(`${apiBase}/hooks/corpus?${params.toString()}`);
    const data = await res.json();
    setCorpus(Array.isArray(data.items) ? data.items : []);
  }

  async function refreshSynth() {
    const params = new URLSearchParams();
    if (lastSynthId) params.set("synth_id", lastSynthId);
    if (lastMineId) params.set("mine_id", lastMineId);
    params.set("limit", String(synthPage.limit));
    params.set("offset", String(synthPage.offset));
    if (synthSort) params.set("sort", synthSort);
    if (synthApprovedFilter === "approved") params.set("approved", "true");
    if (synthApprovedFilter === "unapproved") params.set("approved", "false");
    if (synthIcp.trim()) params.set("icp", synthIcp.trim());
    const res = await fetch(`${apiBase}/hooks/synth?${params.toString()}`);
    const data = await res.json();
    setSynth(Array.isArray(data.items) ? data.items : []);
  }

  useEffect(() => {
    try {
      localStorage.setItem("gpt5video_hooks_sources", JSON.stringify(sources));
    } catch {}
  }, [sources]);

  const formValid =
    sources.length > 0 &&
    sources.every(
      (s) =>
        (s.platform === "tiktok" ||
          s.platform === "instagram" ||
          s.platform === "youtube") &&
        typeof s.handle_or_url === "string" &&
        s.handle_or_url.trim().length > 0 &&
        typeof s.limit === "number" &&
        s.limit > 0,
    );
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
        <section className="rounded border bg-white p-4 space-y-3">
          <div className="text-sm font-medium">Source setup</div>
          <div className="grid grid-cols-4 gap-3 items-end">
            <label className="text-sm">
              <span className="text-gray-700">Platform</span>
              <select
                className="mt-1 w-full rounded border px-2 py-1 text-sm"
                value={platform}
                onChange={(e) => setPlatform(e.target.value as any)}
              >
                <option value="tiktok">tiktok</option>
                <option value="instagram">instagram</option>
                <option value="youtube">youtube</option>
              </select>
            </label>
            <label className="text-sm col-span-2">
              <span className="text-gray-700">Handle or URL</span>
              <input
                className="mt-1 w-full rounded border px-2 py-1 text-sm"
                value={handleOrUrl}
                onChange={(e) => setHandleOrUrl(e.target.value)}
                placeholder="@creator or https://..."
              />
            </label>
            <label className="text-sm">
              <span className="text-gray-700">Limit</span>
              <input
                type="number"
                min={1}
                className="mt-1 w-full rounded border px-2 py-1 text-sm"
                value={String(limit)}
                onChange={(e) =>
                  setLimit(Math.max(1, Number(e.target.value || 0)))
                }
              />
            </label>
            <label className="text-sm col-span-4">
              <span className="text-gray-700">Notes (optional)</span>
              <input
                className="mt-1 w-full rounded border px-2 py-1 text-sm"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="any context"
              />
            </label>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="rounded border px-3 py-1.5 text-sm"
              onClick={() => {
                if (!handleOrUrl.trim() || !platform || limit <= 0) return;
                setSources((prev) => [
                  {
                    platform,
                    handle_or_url: handleOrUrl.trim(),
                    limit,
                    notes: notes.trim() || undefined,
                  },
                  ...prev,
                ]);
                setHandleOrUrl("");
                setNotes("");
              }}
            >
              Add Source
            </button>
            <button
              className="rounded bg-black px-3 py-1.5 text-white text-sm disabled:opacity-50"
              disabled={!formValid}
              onClick={async () => {
                const payload = {
                  sources: sources.map((s) => ({
                    platform: s.platform,
                    handle: s.handle_or_url,
                    limit: s.limit,
                    notes: s.notes,
                  })),
                };
                const provisionalId = `hooks_mine_${Date.now()}`;
                addJob({
                  id: provisionalId,
                  type: "hooks_mine",
                  status: "queued",
                  createdAt: Date.now(),
                });
                try {
                  const res = await fetchWithAuth(`${apiBase}/hooks/mine`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                  });
                  const data = await res.json();
                  if (res.ok) {
                    setLastMineId(String(data?.id || ""));
                    setCorpus(Array.isArray(data?.items) ? data.items : []);
                    updateJob(provisionalId, {
                      status: "succeeded",
                      completedAt: Date.now(),
                      runId: data?.run_id,
                    });
                    show({
                      title: "Mining started",
                      description: String(data?.id || ""),
                      variant: "success",
                    });
                  } else {
                    updateJob(provisionalId, {
                      status: "failed",
                      completedAt: Date.now(),
                      error: String(data?.error || res.statusText),
                    });
                    show({
                      title: "Mine failed",
                      description: String(data?.error || res.statusText),
                      variant: "error",
                    });
                  }
                } catch (e: any) {
                  updateJob(provisionalId, {
                    status: "failed",
                    completedAt: Date.now(),
                    error: String(e?.message || e),
                  });
                  show({
                    title: "Mine failed",
                    description: String(e?.message || e),
                    variant: "error",
                  });
                }
              }}
            >
              Mine Hooks
            </button>
          </div>
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-gray-600">
                  <th className="px-2 py-1">Platform</th>
                  <th className="px-2 py-1">Handle/URL</th>
                  <th className="px-2 py-1">Limit</th>
                  <th className="px-2 py-1">Notes</th>
                  <th className="px-2 py-1">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((s, idx) => (
                  <tr
                    key={`${s.platform}-${s.handle_or_url}-${idx}`}
                    className="border-t"
                  >
                    <td className="px-2 py-1">{s.platform}</td>
                    <td className="px-2 py-1 font-mono">{s.handle_or_url}</td>
                    <td className="px-2 py-1">{s.limit}</td>
                    <td className="px-2 py-1 text-gray-600">{s.notes || ""}</td>
                    <td className="px-2 py-1">
                      <button
                        className="text-red-600 underline text-xs"
                        onClick={() =>
                          setSources((prev) => prev.filter((_, i) => i !== idx))
                        }
                      >
                        remove
                      </button>
                    </td>
                  </tr>
                ))}
                {sources.length === 0 && (
                  <tr>
                    <td className="px-2 py-3 text-gray-500" colSpan={5}>
                      No sources added
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-600">
            <div className="flex items-center gap-2">
              <span>Last mine id:</span>
              <span className="font-mono">{lastMineId || "--"}</span>
              {mineProgress && (
                <span className="rounded bg-yellow-50 px-2 py-0.5 text-yellow-800">
                  {mineProgress}
                </span>
              )}
              {mineErrorCat && (
                <span className="rounded bg-red-50 px-2 py-0.5 text-red-800">
                  {mineErrorCat}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                className="rounded border px-2 py-0.5"
                disabled={!lastMineId}
                onClick={refreshCorpus}
              >
                Refresh corpus
              </button>
              <label>
                <select
                  className="rounded border px-2 py-0.5"
                  value={String(corpusPage.limit)}
                  onChange={(e) =>
                    setCorpusPage((p) => ({
                      ...p,
                      limit: Number(e.target.value || 20),
                    }))
                  }
                >
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </label>
              <div className="flex items-center gap-1">
                <button
                  className="rounded border px-2 py-0.5"
                  onClick={() =>
                    setCorpusPage((p) => ({
                      ...p,
                      offset: Math.max(0, p.offset - p.limit),
                    }))
                  }
                >
                  Prev
                </button>
                <button
                  className="rounded border px-2 py-0.5"
                  onClick={() =>
                    setCorpusPage((p) => ({ ...p, offset: p.offset + p.limit }))
                  }
                >
                  Next
                </button>
              </div>
            </div>
          </div>
          {!!corpus.length && (
            <div className="mt-3">
              <div className="text-sm font-medium mb-1">Corpus</div>
              <div className="overflow-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="text-left text-gray-600">
                      <th
                        className="px-2 py-1 cursor-pointer"
                        onClick={() =>
                          setCorpusSort((s) =>
                            s === "created_at:asc"
                              ? "created_at:desc"
                              : "created_at:asc",
                          )
                        }
                      >
                        Platform
                      </th>
                      <th
                        className="px-2 py-1 cursor-pointer"
                        onClick={() =>
                          setCorpusSort((s) =>
                            s === "created_at:asc"
                              ? "created_at:desc"
                              : "created_at:asc",
                          )
                        }
                      >
                        Author
                      </th>
                      <th className="px-2 py-1">URL</th>
                      <th
                        className="px-2 py-1 cursor-pointer"
                        onClick={() =>
                          setCorpusSort((s) =>
                            s === "views:asc" ? "views:desc" : "views:asc",
                          )
                        }
                      >
                        Views
                      </th>
                      <th className="px-2 py-1">Caption/Transcript</th>
                    </tr>
                  </thead>
                  <tbody>
                    {corpus.map((c) => (
                      <tr key={c.id} className="border-t align-top">
                        <td className="px-2 py-1">{c.platform || ""}</td>
                        <td className="px-2 py-1">{c.author || ""}</td>
                        <td className="px-2 py-1">
                          {c.url ? (
                            <a
                              className="text-blue-600 underline"
                              href={c.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              link
                            </a>
                          ) : (
                            ""
                          )}
                        </td>
                        <td className="px-2 py-1">
                          {Number((c.metrics || {}).views || 0)}
                        </td>
                        <td className="px-2 py-1">
                          <div className="line-clamp-2 max-w-[360px]">
                            {c.caption_or_transcript || ""}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {!!synth.length && (
            <div className="mt-3">
              <div className="text-sm font-medium mb-1">
                Synthesized hooks (sample)
              </div>
              <ul className="list-disc pl-4 text-xs">
                {synth.slice(0, 5).map((h, i) => (
                  <li key={i} className="truncate">
                    {h.hook_text || JSON.stringify(h)}
                  </li>
                ))}
              </ul>
            </div>
          )}
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
                  const res = await fetchWithAuth(`${apiBase}/hooks/mine`, {
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
                  if (res.ok) {
                    setLastSynthId(String(data?.id || ""));
                    setSynth(Array.isArray(data?.items) ? data.items : []);
                  }
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
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-600">
              <div className="flex items-center gap-2">
                <span>Last synth id:</span>
                <span className="font-mono">{lastSynthId || "--"}</span>
                {synthProgress && (
                  <span className="rounded bg-yellow-50 px-2 py-0.5 text-yellow-800">
                    {synthProgress}
                  </span>
                )}
                {synthErrorCat && (
                  <span className="rounded bg-red-50 px-2 py-0.5 text-red-800">
                    {synthErrorCat}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="rounded border px-2 py-0.5"
                  disabled={!lastSynthId}
                  onClick={refreshSynth}
                >
                  Refresh synth
                </button>
                <label className="text-xs text-gray-700">
                  Approved
                  <select
                    className="ml-1 rounded border px-2 py-0.5"
                    value={synthApprovedFilter}
                    onChange={(e) =>
                      setSynthApprovedFilter(e.target.value as any)
                    }
                  >
                    <option value="all">all</option>
                    <option value="approved">approved</option>
                    <option value="unapproved">unapproved</option>
                  </select>
                </label>
                <label className="text-xs text-gray-700">
                  ICP
                  <input
                    className="ml-1 rounded border px-2 py-0.5"
                    placeholder="filter ICP"
                    value={synthIcp}
                    onChange={(e) => setSynthIcp(e.target.value)}
                  />
                </label>
                <label>
                  <select
                    className="rounded border px-2 py-0.5"
                    value={String(synthPage.limit)}
                    onChange={(e) =>
                      setSynthPage((p) => ({
                        ...p,
                        limit: Number(e.target.value || 20),
                      }))
                    }
                  >
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </label>
                <div className="flex items-center gap-1">
                  <button
                    className="rounded border px-2 py-0.5"
                    onClick={() =>
                      setSynthPage((p) => ({
                        ...p,
                        offset: Math.max(0, p.offset - p.limit),
                      }))
                    }
                  >
                    Prev
                  </button>
                  <button
                    className="rounded border px-2 py-0.5"
                    onClick={() =>
                      setSynthPage((p) => ({
                        ...p,
                        offset: p.offset + p.limit,
                      }))
                    }
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
            {!!synth.length && (
              <div className="mt-2">
                <div className="text-sm font-medium mb-1">
                  Synthesized hooks
                </div>
                <div className="overflow-auto">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="text-left text-gray-600">
                        <th
                          className="px-2 py-1 cursor-pointer"
                          onClick={() =>
                            setSynthSort((s) =>
                              s === "created_at:asc"
                                ? "created_at:desc"
                                : "created_at:asc",
                            )
                          }
                        >
                          Hook
                        </th>
                        <th
                          className="px-2 py-1 cursor-pointer"
                          onClick={() =>
                            setSynthSort((s) =>
                              s === "created_at:asc"
                                ? "created_at:desc"
                                : "created_at:asc",
                            )
                          }
                        >
                          Angle
                        </th>
                        <th
                          className="px-2 py-1 cursor-pointer"
                          onClick={() =>
                            setSynthSort((s) =>
                              s === "created_at:asc"
                                ? "created_at:desc"
                                : "created_at:asc",
                            )
                          }
                        >
                          ICP
                        </th>
                        <th
                          className="px-2 py-1 cursor-pointer"
                          onClick={() =>
                            setSynthSort((s) =>
                              s === "approved:asc"
                                ? "approved:desc"
                                : "approved:asc",
                            )
                          }
                        >
                          Approved
                        </th>
                        <th className="px-2 py-1">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {synth.map((h) => (
                        <tr key={h.id} className="border-t align-top">
                          <td className="px-2 py-1 max-w-[360px]">
                            <div
                              className="line-clamp-3"
                              title={h.hook_text || ""}
                            >
                              {h.edited_hook_text || h.hook_text || ""}
                            </div>
                          </td>
                          <td className="px-2 py-1">{h.angle || ""}</td>
                          <td className="px-2 py-1">{h.icp || ""}</td>
                          <td className="px-2 py-1">
                            {h.approved ? "yes" : "no"}
                          </td>
                          <td className="px-2 py-1">
                            <div className="flex items-center gap-2">
                              <button
                                className="rounded border px-2 py-0.5"
                                onClick={() =>
                                  setSynthEdit({ open: true, row: h })
                                }
                              >
                                Edit
                              </button>
                              {!h.approved && (
                                <button
                                  className="rounded border px-2 py-0.5"
                                  onClick={async () => {
                                    try {
                                      const res = await fetchWithAuth(
                                        `${apiBase}/hooks/synth/${h.id}`,
                                        {
                                          method: "PATCH",
                                          headers: {
                                            "Content-Type": "application/json",
                                          },
                                          body: JSON.stringify({
                                            approved: true,
                                          }),
                                        },
                                      );
                                      if (!res.ok)
                                        throw new Error(String(res.statusText));
                                      show({
                                        title: "Approved",
                                        variant: "success",
                                      });
                                      await refreshSynth();
                                    } catch (e: any) {
                                      show({
                                        title: "Approve failed",
                                        description: String(e?.message || e),
                                        variant: "error",
                                      });
                                    }
                                  }}
                                >
                                  Approve
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {synthEdit.open && synthEdit.row && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
                <div className="w-[520px] rounded border bg-white p-4 space-y-3">
                  <div className="text-sm font-medium">Edit hook</div>
                  <textarea
                    className="h-32 w-full rounded border p-2 text-sm"
                    defaultValue={
                      synthEdit.row.edited_hook_text ||
                      synthEdit.row.hook_text ||
                      ""
                    }
                    onChange={(e) =>
                      setSynthEdit((prev) => ({
                        ...prev,
                        row: { ...prev.row!, edited_hook_text: e.target.value },
                      }))
                    }
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      className="rounded border px-3 py-1.5 text-sm"
                      onClick={() => setSynthEdit({ open: false })}
                    >
                      Cancel
                    </button>
                    <button
                      className="rounded bg-black px-3 py-1.5 text-white text-sm"
                      onClick={async () => {
                        try {
                          const res = await fetchWithAuth(
                            `${apiBase}/hooks/synth/${synthEdit.row!.id}`,
                            {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                edited_hook_text:
                                  synthEdit.row!.edited_hook_text ||
                                  synthEdit.row!.hook_text ||
                                  "",
                              }),
                            },
                          );
                          if (!res.ok) throw new Error(String(res.statusText));
                          setSynthEdit({ open: false });
                          show({ title: "Saved", variant: "success" });
                          await refreshSynth();
                        } catch (e: any) {
                          show({
                            title: "Save failed",
                            description: String(e?.message || e),
                            variant: "error",
                          });
                        }
                      }}
                    >
                      Save
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
