import Link from "next/link";
import { useRouter } from "next/router";
import PageHeader from "../components/PageHeader";
import { useEffect, useMemo, useState } from "react";
import { addJob, updateJob } from "../lib/jobs";
import { fetchWithAuth } from "../lib/http";
import { useToast } from "../components/Toast";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Chip,
  EmptyState,
  Table,
  TD,
  TH,
  THead,
  TRow,
  Tooltip,
} from "../components/ui";

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
  const router = useRouter();
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
  const [mineAttemptCount, setMineAttemptCount] = useState<number>(0);
  const [synthAttemptCount, setSynthAttemptCount] = useState<number>(0);
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
  const [search, setSearch] = useState<string>("");
  const [mineDialogOpen, setMineDialogOpen] = useState<boolean>(false);
  const [synthDialogOpen, setSynthDialogOpen] = useState<boolean>(false);
  const [synthDialogIcp, setSynthDialogIcp] = useState<string>("");
  const [synthDialogCorpusId, setSynthDialogCorpusId] = useState<string>("");
  // Derived filters (toolbar chips)
  const availableIcps = useMemo(
    () =>
      Array.from(new Set(synth.map((s) => String(s.icp || "").trim())))
        .filter(Boolean)
        .slice(0, 6),
    [synth],
  );
  const [synthAngleFilter, setSynthAngleFilter] = useState<
    "all" | "contrarian" | "pattern_interrupt" | "howto" | "general" | "insight"
  >("all");
  const [guardrails, setGuardrails] = useState<{
    max_concurrency: number;
    max_cost_per_batch_usd: number;
  } | null>(null);
  const [processingCount, setProcessingCount] = useState<number>(0);
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
          if (typeof data.attempt_count === "number")
            setMineAttemptCount(data.attempt_count);
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
          if (typeof data.attempt_count === "number")
            setSynthAttemptCount(data.attempt_count);
        }
      } catch {}
    };
    es.addEventListener("job", onJob as any);
    return () => {
      es.removeEventListener("job", onJob as any);
      es.close();
    };
  }, [apiBase]);

  // Guardrails and processing count for non-blocking warning
  useEffect(() => {
    let cancelled = false;
    const fetchInfo = async () => {
      try {
        const [gRes, jRes] = await Promise.all([
          fetch(`${apiBase}/settings/guardrails`),
          fetch(`${apiBase}/jobs/recent?limit=50`),
        ]);
        if (!cancelled && gRes.ok) setGuardrails(await gRes.json());
        if (!cancelled && jRes.ok) {
          const data = await jRes.json();
          const processing = (
            Array.isArray(data.items) ? data.items : []
          ).filter((j: any) => j.status === "processing").length;
          setProcessingCount(processing);
        }
      } catch {}
    };
    void fetchInfo();
    const id = setInterval(fetchInfo, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
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

  const corpusFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return corpus;
    return corpus.filter((c) =>
      String(c.caption_or_transcript || "")
        .toLowerCase()
        .includes(q),
    );
  }, [search, corpus]);

  const synthFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = synth;
    if (synthAngleFilter !== "all") {
      rows = rows.filter(
        (h) => String(h.angle || "").toLowerCase() === synthAngleFilter,
      );
    }
    if (synthIcp.trim()) {
      rows = rows.filter(
        (h) =>
          String(h.icp || "").toLowerCase() === synthIcp.trim().toLowerCase(),
      );
    }
    if (q) {
      rows = rows.filter((h) =>
        String(h.edited_hook_text || h.hook_text || "")
          .toLowerCase()
          .includes(q),
      );
    }
    return rows;
  }, [search, synth, synthAngleFilter, synthIcp]);

  function planScenesFromHook(h: HookSynthRow) {
    const text = String(h.edited_hook_text || h.hook_text || "");
    const composition =
      text.length > 0 ? "tight mid on subject, text plate right" : "mid shot";
    const scene = {
      scene_id: `hook_${h.id}_s1`,
      duration_s: 2.0,
      composition,
      props: [],
      overlays: [],
      model: "ideogram-character",
      model_inputs: {
        prompt: text.slice(0, 180),
        character_reference_image: "",
        aspect_ratio: "9:16",
        rendering_speed: "Default",
      },
      audio: { dialogue: [], vo_prompt: "" },
    } as any;
    const payload = encodeURIComponent(JSON.stringify(scene));
    void router.push(`/scenes-plan?prefill=${payload}`);
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
      <div className="mx-auto max-w-5xl p-6 space-y-6">
        <PageHeader
          title="Hooks"
          description="Set up sources, mine and synthesize hooks. Approve or edit before planning scenes."
        />
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {lastMineId && (
            <Badge variant="info" className="flex items-center gap-1">
              <span>mine</span>
              <span className="font-mono">{lastMineId}</span>
              {mineProgress && <span>· {mineProgress}</span>}
              {mineAttemptCount ? (
                <span>· attempts {mineAttemptCount}</span>
              ) : null}
            </Badge>
          )}
          {lastSynthId && (
            <Badge variant="info" className="flex items-center gap-1">
              <span>synth</span>
              <span className="font-mono">{lastSynthId}</span>
              {synthProgress && <span>· {synthProgress}</span>}
              {synthAttemptCount ? (
                <span>· attempts {synthAttemptCount}</span>
              ) : null}
            </Badge>
          )}
          {guardrails &&
            processingCount >= Math.max(1, guardrails.max_concurrency - 1) && (
              <Badge variant="warning">Approaching concurrency cap</Badge>
            )}
        </div>
        <nav className="flex gap-4 text-sm">
          <Link href="/" className="text-blue-600 underline">
            Dashboard
          </Link>
          <Link href="/brand" className="text-blue-600 underline">
            Brand
          </Link>
        </nav>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Toolbar</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="rounded border px-2 py-1 text-sm"
                placeholder="Search caption or hook text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className="ml-2 flex items-center gap-2">
                <Chip
                  selected={corpusSort === "created_at:desc"}
                  onClick={() => setCorpusSort("created_at:desc")}
                >
                  Corpus newest
                </Chip>
                <Chip
                  selected={corpusSort === "created_at:asc"}
                  onClick={() => setCorpusSort("created_at:asc")}
                >
                  Corpus oldest
                </Chip>
                <Chip
                  selected={synthSort === "created_at:desc"}
                  onClick={() => setSynthSort("created_at:desc")}
                >
                  Synth newest
                </Chip>
                <Chip
                  selected={synthSort === "created_at:asc"}
                  onClick={() => setSynthSort("created_at:asc")}
                >
                  Synth oldest
                </Chip>
              </div>
              {/* Approved filter chips */}
              <div className="ml-2 flex items-center gap-1">
                <Chip
                  selected={synthApprovedFilter === "all"}
                  onClick={() => setSynthApprovedFilter("all")}
                >
                  All
                </Chip>
                <Chip
                  selected={synthApprovedFilter === "approved"}
                  onClick={() => setSynthApprovedFilter("approved")}
                >
                  Approved
                </Chip>
                <Chip
                  selected={synthApprovedFilter === "unapproved"}
                  onClick={() => setSynthApprovedFilter("unapproved")}
                >
                  Pending/Rejected
                </Chip>
              </div>
              {/* Angle/format chips */}
              <div className="ml-2 flex items-center gap-1">
                {(
                  [
                    "all",
                    "contrarian",
                    "pattern_interrupt",
                    "howto",
                    "general",
                    "insight",
                  ] as const
                ).map((k) => (
                  <Chip
                    key={k}
                    selected={synthAngleFilter === k}
                    onClick={() => setSynthAngleFilter(k)}
                  >
                    {k}
                  </Chip>
                ))}
              </div>
              {/* ICP chips (dynamic) */}
              {!!availableIcps.length && (
                <div className="ml-2 flex items-center gap-1">
                  <Chip selected={!synthIcp} onClick={() => setSynthIcp("")}>
                    ICP: all
                  </Chip>
                  {availableIcps.map((icp) => (
                    <Chip
                      key={icp}
                      selected={synthIcp.toLowerCase() === icp.toLowerCase()}
                      onClick={() => setSynthIcp(icp)}
                    >
                      {icp}
                    </Chip>
                  ))}
                </div>
              )}
              <div className="ml-auto flex items-center gap-2">
                <button
                  className="rounded border px-2 py-1 text-sm"
                  onClick={() => setMineDialogOpen(true)}
                >
                  Mine Hooks
                </button>
                <button
                  className="rounded border px-2 py-1 text-sm"
                  onClick={() => {
                    setSynthDialogIcp("");
                    setSynthDialogCorpusId(lastMineId || "");
                    setSynthDialogOpen(true);
                  }}
                >
                  Synthesize
                </button>
                <button
                  className="rounded border px-2 py-1 text-sm"
                  onClick={() => {
                    setSources([
                      {
                        platform: "tiktok",
                        handle_or_url: "@creator",
                        limit: 10,
                      },
                      {
                        platform: "youtube",
                        handle_or_url: "https://youtube.com/@channel",
                        limit: 10,
                      },
                    ]);
                    setMineDialogOpen(true);
                  }}
                >
                  Mine sample
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
        {synthDialogOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 pointer-events-none"
            role="presentation"
          >
            <div
              className="pointer-events-auto w-[520px] rounded border bg-white p-4 space-y-3 shadow-md"
              role="dialog"
              aria-modal="true"
              aria-label="Synthesize Hooks"
            >
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">Synthesize Hooks</div>
                <button
                  className="text-xs opacity-70 hover:opacity-100"
                  onClick={() => setSynthDialogOpen(false)}
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
              <div className="grid grid-cols-1 gap-3">
                <label className="text-sm">
                  <span className="text-gray-700">Corpus ID</span>
                  <input
                    className="mt-1 w-full rounded border px-2 py-1 text-sm font-mono"
                    placeholder="hooks_mine_..."
                    value={synthDialogCorpusId}
                    onChange={(e) => setSynthDialogCorpusId(e.target.value)}
                  />
                </label>
                <label className="text-sm">
                  <span className="text-gray-700">ICP (optional)</span>
                  <input
                    className="mt-1 w-full rounded border px-2 py-1 text-sm"
                    placeholder="e.g. DTC operators"
                    value={synthDialogIcp}
                    onChange={(e) => setSynthDialogIcp(e.target.value)}
                  />
                </label>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  className="rounded border px-3 py-1.5 text-sm"
                  onClick={() => setSynthDialogOpen(false)}
                >
                  Cancel
                </button>
                <button
                  data-testid="synth-start"
                  className="rounded bg-black px-3 py-1.5 text-white text-sm disabled:opacity-50"
                  disabled={!synthDialogCorpusId.trim()}
                  onClick={async () => {
                    const provisionalId = `hooks_synthesize_${Date.now()}`;
                    addJob({
                      id: provisionalId,
                      type: "hooks_synthesize",
                      status: "queued",
                      createdAt: Date.now(),
                    });
                    try {
                      const res = await fetchWithAuth(
                        `${apiBase}/hooks/synthesize`,
                        {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            corpus_id: synthDialogCorpusId.trim(),
                            icp: synthDialogIcp.trim() || undefined,
                          }),
                        },
                      );
                      const data = await res.json();
                      if (res.ok) {
                        setLastSynthId(String(data?.id || ""));
                        show({
                          title: "Synthesis started",
                          description: String(data?.id || ""),
                          variant: "success",
                        });
                        updateJob(provisionalId, {
                          status: "succeeded",
                          completedAt: Date.now(),
                          runId: data?.run_id,
                        });
                        setSynthDialogOpen(false);
                      } else {
                        updateJob(provisionalId, {
                          status: "failed",
                          completedAt: Date.now(),
                          error: String(data?.error || res.statusText),
                        });
                        show({
                          title: "Synthesize failed",
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
                        title: "Synthesize failed",
                        description: String(e?.message || e),
                        variant: "error",
                      });
                    }
                  }}
                  aria-label="Start"
                >
                  Start
                </button>
              </div>
            </div>
          </div>
        )}
        {mineDialogOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 pointer-events-none"
            role="presentation"
          >
            <div
              className="pointer-events-auto w-[640px] rounded border bg-white p-4 space-y-3 shadow-md"
              role="dialog"
              aria-modal="true"
              aria-label="Mine Hooks (sources)"
            >
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">Mine Hooks (sources)</div>
                <button
                  className="text-xs opacity-70 hover:opacity-100"
                  onClick={() => setMineDialogOpen(false)}
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
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
                  data-testid="mine-start"
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
                <Table>
                  <THead>
                    <TRow className="text-left text-gray-600">
                      <TH>Platform</TH>
                      <TH>Handle/URL</TH>
                      <TH>Limit</TH>
                      <TH>Notes</TH>
                      <TH>Actions</TH>
                    </TRow>
                  </THead>
                  <tbody>
                    {sources.map((s, idx) => (
                      <TRow
                        key={`${s.platform}-${s.handle_or_url}-${idx}`}
                        className="border-t"
                      >
                        <TD>{s.platform}</TD>
                        <TD className="font-mono">{s.handle_or_url}</TD>
                        <TD>{s.limit}</TD>
                        <TD className="text-gray-600">{s.notes || ""}</TD>
                        <TD>
                          <button
                            className="text-red-600 underline text-xs"
                            onClick={() =>
                              setSources((prev) =>
                                prev.filter((_, i) => i !== idx),
                              )
                            }
                            aria-label="Remove source"
                          >
                            remove
                          </button>
                        </TD>
                      </TRow>
                    ))}
                    {sources.length === 0 && (
                      <TRow>
                        <TD className="px-2 py-3 text-gray-500" colSpan={5}>
                          No sources added
                        </TD>
                      </TRow>
                    )}
                  </tbody>
                </Table>
              </div>
            </div>
          </div>
        )}

        <section className="rounded border bg-white p-4 space-y-3">
          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-600">
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
          {corpusFiltered.length === 0 ? (
            <EmptyState
              title="No corpus yet"
              description="Mine sources to build your corpus."
              actions={
                <button
                  className="rounded bg-black px-3 py-1.5 text-white text-sm"
                  onClick={() => setMineDialogOpen(true)}
                >
                  Mine Hooks
                </button>
              }
            />
          ) : (
            <div className="mt-3">
              <div className="text-sm font-medium mb-1">Corpus</div>
              <div className="overflow-auto">
                <Table className="text-xs">
                  <THead>
                    <TRow className="text-left text-gray-600">
                      <TH>Platform</TH>
                      <TH>Author</TH>
                      <TH>URL</TH>
                      <TH>Format</TH>
                      <TH>Latency (ms)</TH>
                      <TH>Caption/Transcript</TH>
                    </TRow>
                  </THead>
                  <tbody>
                    {corpusFiltered.map((c) => (
                      <TRow key={c.id} className="border-t align-top">
                        <TD>{c.platform || ""}</TD>
                        <TD>{c.author || ""}</TD>
                        <TD>
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
                        </TD>
                        <TD>{c.detected_format || ""}</TD>
                        <TD>{Number((c.scrape_meta || {}).latency_ms || 0)}</TD>
                        <TD>
                          <div className="line-clamp-2 max-w-[420px]">
                            {c.caption_or_transcript || ""}
                          </div>
                        </TD>
                      </TRow>
                    ))}
                  </tbody>
                </Table>
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
                  const res = await fetchWithAuth(
                    `${apiBase}/hooks/synthesize`,
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(parsed),
                    },
                  );
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
            {synthFiltered.length === 0 ? (
              <EmptyState
                title="No synthesized hooks yet"
                description="Run synthesis to generate candidate hooks."
                actions={
                  <button
                    className="rounded bg-black px-3 py-1.5 text-white text-sm"
                    onClick={() => setSynthDialogOpen(true)}
                  >
                    Synthesize
                  </button>
                }
              />
            ) : (
              <div className="mt-2">
                <div className="text-sm font-medium mb-1">
                  Synthesized hooks
                </div>
                <div className="overflow-auto">
                  <Table className="text-xs">
                    <THead>
                      <TRow className="text-left text-gray-600">
                        <TH>Hook</TH>
                        <TH>Angle</TH>
                        <TH>ICP</TH>
                        <TH>Risk</TH>
                        <TH>Inspo</TH>
                        <TH>Status</TH>
                        <TH>Actions</TH>
                      </TRow>
                    </THead>
                    <tbody>
                      {synthFiltered.map((h) => (
                        <TRow key={h.id} className="border-t align-top">
                          <TD className="max-w-[420px]">
                            <div
                              className="line-clamp-3"
                              title={h.hook_text || ""}
                            >
                              {h.edited_hook_text || h.hook_text || ""}
                            </div>
                            {h.edited_hook_text && (
                              <div className="mt-1 text-[10px] text-gray-500">
                                edited
                              </div>
                            )}
                          </TD>
                          <TD>{h.angle || ""}</TD>
                          <TD>{h.icp || ""}</TD>
                          <TD>{(h.risk_flags || [])?.join(", ")}</TD>
                          <TD>
                            {h.inspiration_url ? (
                              <a
                                className="text-blue-600 underline"
                                href={h.inspiration_url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                link
                              </a>
                            ) : (
                              ""
                            )}
                          </TD>
                          <TD>
                            {h.approved ? (
                              <Badge variant="success">Approved</Badge>
                            ) : (
                              <Badge>Pending</Badge>
                            )}
                          </TD>
                          <TD>
                            <div className="flex items-center gap-2">
                              <Tooltip label="Edit">
                                <button
                                  className="rounded border px-2 py-0.5"
                                  onClick={() =>
                                    setSynthEdit({ open: true, row: h })
                                  }
                                  aria-label="Edit hook"
                                >
                                  ✎
                                </button>
                              </Tooltip>
                              <Tooltip label="Plan Scenes">
                                <button
                                  className="rounded border px-2 py-0.5"
                                  onClick={() => planScenesFromHook(h)}
                                  aria-label="Plan scenes from hook"
                                >
                                  🎬
                                </button>
                              </Tooltip>
                              <label className="inline-flex items-center gap-1 text-[11px]">
                                <input
                                  type="checkbox"
                                  checked={!!h.approved}
                                  onChange={async (e) => {
                                    try {
                                      const res = await fetchWithAuth(
                                        `${apiBase}/hooks/synth/${h.id}`,
                                        {
                                          method: "PATCH",
                                          headers: {
                                            "Content-Type": "application/json",
                                          },
                                          body: JSON.stringify({
                                            approved: e.target.checked,
                                          }),
                                        },
                                      );
                                      if (!res.ok)
                                        throw new Error(String(res.statusText));
                                      show({
                                        title: e.target.checked
                                          ? "Approved"
                                          : "Unapproved",
                                        variant: "success",
                                      });
                                      await refreshSynth();
                                    } catch (e: any) {
                                      show({
                                        title: "Update failed",
                                        description: String(e?.message || e),
                                        variant: "error",
                                      });
                                    }
                                  }}
                                  aria-label="Toggle approved"
                                />
                                Approved
                              </label>
                            </div>
                          </TD>
                        </TRow>
                      ))}
                    </tbody>
                  </Table>
                </div>
              </div>
            )}
            {synthEdit.open && synthEdit.row && (
              <div className="fixed inset-0 z-50">
                <div
                  className="absolute inset-0 bg-black/30"
                  onClick={() => setSynthEdit({ open: false })}
                />
                <aside className="absolute right-0 top-0 h-full w-[420px] bg-white border-l shadow-md p-4 overflow-auto">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">Approve / Edit</div>
                    <button
                      className="text-xs opacity-70 hover:opacity-100"
                      onClick={() => setSynthEdit({ open: false })}
                      aria-label="Close drawer"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="mt-3 space-y-3 text-sm">
                    <label className="block">
                      <span className="text-gray-700">Hook text</span>
                      <textarea
                        className="mt-1 h-28 w-full rounded border p-2 text-sm"
                        value={
                          synthEdit.row.edited_hook_text ||
                          synthEdit.row.hook_text ||
                          ""
                        }
                        onChange={(e) =>
                          setSynthEdit((prev) => ({
                            ...prev,
                            row: {
                              ...prev.row!,
                              edited_hook_text: e.target.value,
                            },
                          }))
                        }
                      />
                    </label>
                    <label className="block">
                      <span className="text-gray-700">Angle</span>
                      <input
                        className="mt-1 w-full rounded border px-2 py-1"
                        value={synthEdit.row.angle || ""}
                        onChange={(e) =>
                          setSynthEdit((prev) => ({
                            ...prev,
                            row: { ...prev.row!, angle: e.target.value },
                          }))
                        }
                      />
                    </label>
                    <label className="block">
                      <span className="text-gray-700">ICP</span>
                      <input
                        className="mt-1 w-full rounded border px-2 py-1"
                        value={synthEdit.row.icp || ""}
                        onChange={(e) =>
                          setSynthEdit((prev) => ({
                            ...prev,
                            row: { ...prev.row!, icp: e.target.value },
                          }))
                        }
                      />
                    </label>
                    <label className="block">
                      <span className="text-gray-700">
                        Risk flags (comma-separated)
                      </span>
                      <input
                        className="mt-1 w-full rounded border px-2 py-1"
                        value={(synthEdit.row.risk_flags || []).join(", ")}
                        onChange={(e) =>
                          setSynthEdit((prev) => ({
                            ...prev,
                            row: {
                              ...prev.row!,
                              risk_flags: e.target.value
                                .split(",")
                                .map((s) => s.trim())
                                .filter(Boolean),
                            },
                          }))
                        }
                      />
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={!!synthEdit.row.approved}
                        onChange={(e) =>
                          setSynthEdit((prev) => ({
                            ...prev,
                            row: { ...prev.row!, approved: e.target.checked },
                          }))
                        }
                        aria-label="Approved"
                      />
                      Approved
                    </label>
                    <label className="block">
                      <span className="text-gray-700">Note (optional)</span>
                      <input
                        className="mt-1 w-full rounded border px-2 py-1"
                        placeholder="add a note (not saved)"
                      />
                    </label>
                    <div className="flex items-center justify-between gap-2 pt-2">
                      <button
                        className="rounded border px-2 py-1 text-sm"
                        onClick={() => planScenesFromHook(synthEdit.row!)}
                      >
                        Plan Scenes
                      </button>
                      <div className="flex items-center gap-2">
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
                              const body = {
                                edited_hook_text:
                                  synthEdit.row!.edited_hook_text ||
                                  synthEdit.row!.hook_text ||
                                  "",
                                angle: synthEdit.row!.angle,
                                icp: synthEdit.row!.icp,
                                risk_flags: synthEdit.row!.risk_flags || [],
                                approved: synthEdit.row!.approved,
                              };
                              const res = await fetchWithAuth(
                                `${apiBase}/hooks/synth/${synthEdit.row!.id}`,
                                {
                                  method: "PATCH",
                                  headers: {
                                    "Content-Type": "application/json",
                                  },
                                  body: JSON.stringify(body),
                                },
                              );
                              if (!res.ok)
                                throw new Error(String(res.statusText));
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
                </aside>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
