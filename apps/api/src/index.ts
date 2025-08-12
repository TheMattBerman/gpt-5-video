import "dotenv/config";
import express, { Request, Response } from "express";
import cors from "cors";
import pino from "pino";
import pinoHttp from "pino-http";
import { randomUUID } from "crypto";
import { ajv } from "@gpt5video/shared";
import type { BrandProfile } from "@gpt5video/schemas";
import {
  ensureTables,
  insertJob,
  updateJob,
  getRecentJobs,
  getKpisToday,
  insertArtifact,
  insertCost,
  countQueuedJobs,
  insertHookCorpusItems,
  insertHookSynthItems,
  listHookCorpus,
  listHookSynth,
  updateHookSynth,
  getJobDetail,
  findJobByIdemKey,
  enqueueJob,
  claimNextQueuedJob,
  getJobPayload,
  cancelJob,
  countProcessingJobs,
  insertCharacterProfile,
  insertCharacterSeeds,
  pool,
  getJobAttemptCount,
  sumEstimatedCostsForActiveJobs,
  insertBrandProfile,
  getNextBrandVersion,
  getLatestBrandProfile,
  getBrandProfileById,
  insertSceneSpecs,
  listSceneSpecs,
  insertSceneImageLine,
  insertVideoManifest,
} from "./db";
import {
  createS3Client,
  createPresignedPutUrl,
  createPresignedGetUrl,
  putObjectDirect,
  headObject,
  listObjects,
} from "@gpt5video/storage";
import {
  ScrapeCreatorsClient,
  scGetTiktokProfileVideos,
  scGetTiktokVideo,
  scGetInstagramUserReelsSimple,
  scGetInstagramMediaTranscript,
} from "@gpt5video/scrapecreators";
import {
  ReplicateClient,
  extractSeedFromOutput,
} from "@gpt5video/replicate-client";
// For Week 1, import schemas directly
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import brandProfileSchema from "../../../packages/schemas/schemas/brand_profile.schema.json";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import sceneSpecSchema from "../../../packages/schemas/schemas/scene_specs_line.schema.json";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import videoManifestSchema from "../../../packages/schemas/schemas/video_manifest.schema.json";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import characterProfileSchema from "../../../packages/schemas/schemas/character_profile.schema.json";

const logger = pino({ level: process.env.LOG_LEVEL || "info" });
const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(
  pinoHttp({
    logger,
    genReqId: () => randomUUID(),
    customLogLevel: (_req, res, err) => {
      if (res.statusCode >= 500 || err) return "error";
      if (res.statusCode >= 400) return "warn";
      return "info";
    },
  }),
);

app.get("/health", (_req: Request, res: Response) => res.json({ ok: true }));
// --- JWT auth scaffold (non-dev) ---
function isProtectedRoute(req: Request): boolean {
  const path = req.path || req.url;
  const method = (req.method || "GET").toUpperCase();
  // Exclusions for dev usability
  if (
    path.startsWith("/health") ||
    path.startsWith("/jobs/stream") ||
    path.startsWith("/jobs/recent") ||
    path.startsWith("/kpis/today") ||
    path.startsWith("/assets") ||
    path.startsWith("/uploads/")
  )
    return false;
  // Mutating routes under /scenes, /videos, /jobs
  if (
    /^\/scenes\b|^\/videos\b|^\/jobs\b/.test(path) &&
    ["POST", "PUT", "PATCH"].includes(method)
  )
    return true;
  return false;
}

app.use((req, res, next) => {
  if (process.env.NODE_ENV === "development") return next();
  if (!isProtectedRoute(req)) return next();
  const auth = req.header("authorization") || req.header("Authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m || !m[1] || !m[1].trim()) {
    return res.status(401).json({ error: "unauthorized" });
  }
  // Accept any non-empty token for now; subject logging can be added later
  (req as any).subject = "unknown";
  return next();
});

// Stubs for Week 1 endpoints (schema validation to be added next)
const validateBrand = ajv.compile(brandProfileSchema as any);
const validateSceneSpec = ajv.compile(sceneSpecSchema as any);
const validateVideoManifest = ajv.compile(videoManifestSchema as any);
// Strip $id to avoid duplicate schema registration in dev reloads
const validateCharacter = (() => {
  const schema = JSON.parse(JSON.stringify(characterProfileSchema as any));
  if (schema && typeof schema === "object" && "$id" in schema)
    delete schema.$id;
  return ajv.compile(schema as any);
})();

// --- Feature flags / guard toggles ---
const BRAND_LOCK_ENABLED = String(process.env.ENFORCE_BRAND_LOCK || "false")
  .toLowerCase()
  .startsWith("t");

async function requireBrandLocked(
  req: Request,
  res: Response,
): Promise<boolean> {
  if (!BRAND_LOCK_ENABLED) return true;
  try {
    const latest = await getLatestBrandProfile();
    if (!latest) {
      res.status(409).json({ error: "brand_profile_required" });
      return false;
    }
    return true;
  } catch (err) {
    req.log?.error?.(err);
    res.status(500).json({ error: "brand_check_failed" });
    return false;
  }
}

// --- Simple heuristic classifier for hook formats/angles ---
function detectFormatFromText(text: string): string {
  const t = String(text || "").trim();
  if (!t) return "general";
  if (/^how to\b|here(?:'|’)s how|\b(\d+\s*steps?)\b|framework/i.test(t))
    return "howto";
  if (
    /\b(?:not|isn'?t|aren'?t)\b|\bwrong\b|\bmyth\b|^everyone|^nobody|^no one/i.test(
      t,
    )
  )
    return "contrarian";
  if (/^stop\b|^wait\b|^listen\b|^hold up\b|^everyone|^nobody|^no one/i.test(t))
    return "pattern_interrupt";
  return "insight";
}

function detectMemeMarkers(text: string): string[] {
  const markers: string[] = [];
  const t = String(text || "").toLowerCase();
  if (/greenscreen|green screen/.test(t)) markers.push("green_screen");
  if (/duet|stitch/.test(t)) markers.push("remix");
  if (/storytime|story time/.test(t)) markers.push("storytime");
  if (/pov\b/.test(t)) markers.push("pov");
  if (/hook|stop scrolling|don't scroll|wait/.test(t))
    markers.push("scroll_stop");
  if (/capcut|template/.test(t)) markers.push("template");
  return markers;
}

app.post("/ingest/brand", (req: Request, res: Response) => {
  if (!validateBrand(req.body)) {
    return res
      .status(400)
      .json({ error: "Invalid brand_profile", details: validateBrand.errors });
  }
  const data = req.body as BrandProfile;
  const brandKey = String(data?.brand_id || "").trim() || "default";
  const id = `brand_${Date.now()}`;
  (async () => {
    try {
      const version = await getNextBrandVersion(brandKey);
      await insertBrandProfile({ id, brandKey, version, data });
    } catch (e) {
      req.log?.warn?.(e as any, "brand.persist.failed");
    }
  })();
  req.log?.info?.(
    { run_id: (req as any).id, brand_key: brandKey },
    "ingest.brand.received",
  );
  res.json({
    id,
    brand_key: brandKey,
    run_id: (req as any).id || undefined,
    data,
  });
});

// Accept a free-form brief and synthesize a brand_profile via LLM, then persist
app.post("/ingest/brief", async (req: Request, res: Response) => {
  try {
    const brief = String(req.body?.brief_text || req.body?.brief || "").trim();
    const brandKey = String(req.body?.brand_key || "").trim() || "default";
    if (!brief) return res.status(400).json({ error: "brief_text_required" });
    const openai = process.env.OPENAI_API_KEY || "";
    if (!openai)
      return res.status(400).json({ error: "openai_api_key_required" });
    const reqBody: any = {
      model: process.env.OPENAI_LLM_MODEL || "gpt-5",
      messages: [
        {
          role: "system",
          content:
            "You are a brand strategist. Read the brief and output ONLY a valid JSON object matching brand_profile.schema.json. No comments or prose.",
        },
        {
          role: "user",
          content: JSON.stringify({
            brief,
            schema_contract:
              "BrandProfile: { brand_id:string, voice:{principles[],banned_phrases[]}, icp_segments:[{name,pains[],gains[]}], proof[], legal_constraints[], objectives[], done_criteria[] }",
            instructions:
              "Infer brand_id slug; extract voice principles, banned phrases, ICP segments, legal constraints, proof points, objectives, and done criteria. Keep arrays concise.",
          }),
        },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
    };
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openai}`,
      },
      body: JSON.stringify(reqBody),
    });
    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content || "{}";
    let parsed: any = {};
    try {
      parsed = JSON.parse(content);
    } catch {}
    if (!validateBrand(parsed)) {
      return res.status(422).json({
        error: "llm_brand_profile_invalid",
        details: validateBrand.errors,
        raw: parsed,
      });
    }
    const id = `brand_${Date.now()}`;
    const version = await getNextBrandVersion(brandKey);
    await insertBrandProfile({ id, brandKey, version, data: parsed });
    res.json({ id, brand_key: brandKey, version, data: parsed });
  } catch (err) {
    req.log?.error?.(err);
    res.status(500).json({ error: "ingest_brief_failed" });
  }
});

// Retrieve latest brand profile (optionally by brand_key)
app.get("/ingest/brand/latest", async (req: Request, res: Response) => {
  try {
    const brandKey = String(req.query.brand_key || "").trim() || undefined;
    const row = await getLatestBrandProfile(brandKey);
    if (!row) return res.status(404).json({ error: "not_found" });
    res.json({
      id: row.id,
      brand_key: row.brand_key,
      version: row.version,
      created_at: row.created_at,
      data: row.data,
    });
  } catch (err) {
    req.log?.error?.(err);
    res.status(500).json({ error: "brand_latest_failed" });
  }
});

// Retrieve brand profile by id
app.get("/ingest/brand/:id", async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const row = await getBrandProfileById(id);
    if (!row) return res.status(404).json({ error: "not_found" });
    res.json({
      id: row.id,
      brand_key: row.brand_key,
      version: row.version,
      created_at: row.created_at,
      data: row.data,
    });
  } catch (err) {
    req.log?.error?.(err);
    res.status(500).json({ error: "brand_get_failed" });
  }
});

app.post("/hooks/mine", async (req: Request, res: Response) => {
  try {
    const body = (req.body || {}) as any;
    const jobId = `hooks_mine_${Date.now()}`;
    await insertJob({
      id: jobId,
      type: "hooks_mine",
      status: "queued",
      startedAt: new Date(),
      payload: { request: body },
    });
    await updateJob({ id: jobId, runId: (req as any).id || null });
    req.log?.info?.(
      { run_id: (req as any).id, job_id: jobId },
      "hooks.mine.queued",
    );
    broadcastJobEvent({
      id: jobId,
      type: "hooks_mine",
      status: "queued",
      progress: { step: "queued", pct: 0 },
    });

    setImmediate(async () => {
      try {
        broadcastJobEvent({
          id: jobId,
          type: "hooks_mine",
          status: "processing",
          progress: { step: "source_fetch", pct: 10 },
        });
        const scApiKey = process.env.SCRAPECREATORS_API_KEY || "";
        const sources = Array.isArray(body?.sources) ? body.sources : [];
        let mined: {
          items: any[];
          errors: any[];
          request_id: string;
          latency_ms: number;
        } = {
          items: [],
          errors: [],
          request_id: String((req as any).id || "sc_dev"),
          latency_ms: 0,
        };
        const t0 = Date.now();
        if (!scApiKey) {
          // Fall back to stub client for local dev without key
          const client = new ScrapeCreatorsClient({
            apiKey: "dev",
            baseUrl: process.env.SCRAPECREATORS_BASE_URL,
            userAgent: `gpt5video/api (+hooks-miner)`,
            requestId: (req as any).id || undefined,
          });
          mined = await client.mine(sources);
        } else {
          // Real calls per source using v3 profile-videos
          const all: any[] = [];
          const errors: any[] = [];
          for (const src of sources) {
            try {
              if (String(src.platform).toLowerCase() === "tiktok") {
                const vids = await scGetTiktokProfileVideos({
                  apiKey: scApiKey,
                  handle: src.handle,
                  user_id: undefined,
                  amount: Math.max(1, Math.min(Number(src.limit || 20), 100)),
                  trim: true,
                  baseUrl: process.env.SCRAPECREATORS_BASE_URL || undefined,
                });
                for (const v of vids) {
                  const shareUrl = String(
                    v?.share_url || v?.share_info?.share_url || v?.url || "",
                  );
                  const author = String(
                    v?.author?.unique_id ||
                      v?.author?.nickname ||
                      src.handle ||
                      "",
                  );
                  const caption = String(
                    v?.desc || v?.content_desc || v?.title || "",
                  );
                  // Try to fetch transcript for a stronger first-line hook seed
                  let firstTransLine: string | undefined;
                  let onImageText: string | undefined;
                  let keyFrameUrl: string | undefined;
                  try {
                    if (shareUrl) {
                      const info = await scGetTiktokVideo({
                        apiKey: scApiKey,
                        url: shareUrl,
                        get_transcript: true,
                        trim: true,
                        baseUrl:
                          process.env.SCRAPECREATORS_BASE_URL || undefined,
                      });
                      const transcript = String(info?.transcript || "").trim();
                      if (transcript) {
                        const head =
                          transcript.split(/\n|[.!?]/)[0] || transcript;
                        firstTransLine = head.slice(0, 140).trim();
                      }
                      // OCR: try to extract on-image text from the first frame URL if present
                      const frameUrl = String(
                        (info as any)?.aweme_detail?.video?.cover
                          ?.url_list?.[0] ||
                          (info as any)?.aweme_detail?.video?.origin_cover
                            ?.url_list?.[0] ||
                          "",
                      );
                      keyFrameUrl = frameUrl || undefined;
                      if (frameUrl && process.env.REPLICATE_API_TOKEN) {
                        try {
                          const rep = new ReplicateClient(
                            process.env.REPLICATE_API_TOKEN,
                          );
                          const pred = await rep.runPaddleOCR({
                            image: frameUrl,
                          });
                          const out = (pred?.output as any) || [];
                          if (Array.isArray(out)) {
                            const joined = out
                              .map((o: any) =>
                                typeof o?.text === "string" ? o.text : "",
                              )
                              .filter(Boolean)
                              .join(" ")
                              .trim();
                            if (joined) onImageText = joined.slice(0, 140);
                          } else if (typeof out === "string" && out.trim()) {
                            onImageText = String(out).slice(0, 140);
                          }
                        } catch {}
                      }
                    }
                  } catch {}
                  const views = Number(v?.statistics?.play_count || 0);
                  const primaryText = (
                    onImageText ||
                    firstTransLine ||
                    caption ||
                    ""
                  ).slice(0, 200);
                  const keyFrame =
                    typeof keyFrameUrl === "string" ? keyFrameUrl : "";
                  all.push({
                    platform: src.platform,
                    author,
                    url: shareUrl,
                    caption_or_transcript: primaryText,
                    detected_format: detectFormatFromText(primaryText),
                    metrics: {
                      views,
                      likes: Number(v?.statistics?.digg_count || 0),
                      comments: Number(v?.statistics?.comment_count || 0),
                    },
                    scraper: "scrapecreators",
                    scrape_meta: {
                      request_id: (req as any).id || "",
                      page: 0,
                      first_transcript_line: firstTransLine || null,
                      on_image_text: onImageText || null,
                      key_frame_url: keyFrame || null,
                      meme_markers: detectMemeMarkers(primaryText),
                    },
                    platform_post_id: String(
                      v?.aweme_id || v?.id || v?.id_str || "",
                    ),
                  });
                  if (all.length >= Math.max(1, Number(src.limit || 20))) break;
                }
              } else if (String(src.platform).toLowerCase() === "instagram") {
                const reels = await scGetInstagramUserReelsSimple({
                  apiKey: scApiKey,
                  handle: src.handle,
                  amount: Math.max(1, Math.min(Number(src.limit || 20), 100)),
                  trim: true,
                  baseUrl: process.env.SCRAPECREATORS_BASE_URL || undefined,
                });
                for (const r of reels) {
                  // Best-effort mapping
                  const shareUrl = String(
                    r?.permalink || r?.url || r?.shortcode_url || "",
                  );
                  const author = String(
                    r?.username || r?.owner || src.handle || "",
                  );
                  const caption = String(r?.caption || r?.title || "");
                  const keyThumb = String(
                    r?.thumbnail_url || r?.thumbnail || r?.cover || "",
                  );
                  // Try transcript endpoint for IG media
                  let firstTransLine: string | undefined;
                  try {
                    if (shareUrl) {
                      const tr = await scGetInstagramMediaTranscript({
                        apiKey: scApiKey,
                        url: shareUrl,
                        baseUrl:
                          process.env.SCRAPECREATORS_BASE_URL || undefined,
                      });
                      const text = Array.isArray(tr?.transcripts)
                        ? String(tr.transcripts[0]?.text || "")
                        : "";
                      if (text) {
                        firstTransLine = text
                          .split(/[.!?\n]/)[0]
                          ?.slice(0, 140);
                      }
                    }
                  } catch {}
                  const views = Number(r?.play_count || r?.views || 0);
                  const primaryText = (firstTransLine || caption || "").slice(
                    0,
                    200,
                  );
                  all.push({
                    platform: src.platform,
                    author,
                    url: shareUrl,
                    caption_or_transcript: primaryText,
                    detected_format: detectFormatFromText(primaryText),
                    metrics: {
                      views,
                      likes: Number(r?.like_count || r?.likes || 0),
                      comments: Number(r?.comment_count || r?.comments || 0),
                    },
                    scraper: "scrapecreators",
                    scrape_meta: {
                      request_id: (req as any).id || "",
                      page: 0,
                      first_transcript_line: firstTransLine || null,
                      key_frame_url: keyThumb || null,
                      meme_markers: detectMemeMarkers(primaryText),
                    },
                    platform_post_id: String(r?.id || r?.shortcode || ""),
                  });
                  if (all.length >= Math.max(1, Number(src.limit || 20))) break;
                }
              } else {
                // Unsupported platform in this run; mark as error but continue
                throw new Error(`unsupported_platform ${src.platform}`);
              }
            } catch (e: any) {
              errors.push({
                source: src,
                category: categorizeError(e),
                message: String(e?.message || e),
              });
            }
          }
          mined = {
            items: all,
            errors,
            request_id: (req as any).id || "",
            latency_ms: Date.now() - t0,
          };
        }
        broadcastJobEvent({
          id: jobId,
          type: "hooks_mine",
          status: "processing",
          progress: { step: "dedupe", pct: 55 },
        });
        await insertHookCorpusItems(jobId, mined.items);
        broadcastJobEvent({
          id: jobId,
          type: "hooks_mine",
          status: "processing",
          progress: { step: "persist", pct: 85 },
        });
        await updateJob({
          id: jobId,
          status: "succeeded",
          completedAt: new Date(),
          jobMeta: {
            scrape: {
              request_id: mined.request_id,
              latency_ms: mined.latency_ms,
              errors: mined.errors,
            },
          },
        });
        broadcastJobEvent({
          id: jobId,
          type: "hooks_mine",
          status: "succeeded",
          progress: { step: "completed", pct: 100 },
        });
      } catch (e: any) {
        const cat = categorizeError(e);
        await updateJob({
          id: jobId,
          status: "failed",
          error: (e as any)?.message || String(e),
          errorCategory: cat,
        });
        broadcastJobEvent({
          id: jobId,
          type: "hooks_mine",
          status: "failed",
          error_category: cat,
        });
      }
    });

    res.json({
      id: jobId,
      run_id: (req as any).id || undefined,
      status: "queued",
    });
  } catch (err) {
    req.log?.error?.(err, "hooks.mine.failed");
    res.status(500).json({ error: "hooks_mine_failed" });
  }
});

app.post("/hooks/synthesize", async (req: Request, res: Response) => {
  try {
    if (!(await requireBrandLocked(req, res))) return;
    const body = (req.body || {}) as any;
    const jobId = `hooks_synthesize_${Date.now()}`;
    await insertJob({
      id: jobId,
      type: "hooks_synthesize",
      status: "queued",
      startedAt: new Date(),
    });
    await updateJob({
      id: jobId,
      runId: (req as any).id || null,
      jobMeta: { request: body },
    });
    req.log?.info?.(
      { run_id: (req as any).id, job_id: jobId },
      "hooks.synthesize.queued",
    );
    broadcastJobEvent({
      id: jobId,
      type: "hooks_synthesize",
      status: "queued",
      progress: { step: "queued", pct: 0 },
    });

    // Perform clustering/synthesis asynchronously with SSE progress
    setImmediate(async () => {
      try {
        broadcastJobEvent({
          id: jobId,
          type: "hooks_synthesize",
          status: "processing",
          progress: { step: "clustering", pct: 15 },
        });
        const mineId = String(body?.corpus_id || "");
        const icpFilter = typeof body?.icp === "string" ? String(body.icp) : "";
        // Fetch a sample of corpus rows for heuristic synthesis
        const corpusRows = await listHookCorpus({
          mineId: mineId || undefined,
          limit: 200,
          offset: 0,
          sort: "created_at:desc",
        });
        // Simple heuristic clustering by detected_format or text signals
        const clusters: Record<string, any[]> = {};
        for (const row of corpusRows) {
          // Prefer on-image text or first transcript line if available; fallback to caption
          const meta = (row as any).scrape_meta || {};
          const text = String(
            meta.on_image_text ||
              meta.first_transcript_line ||
              row.caption_or_transcript ||
              "",
          );
          let label = String(row.detected_format || "").trim() || "general";
          if (/^everyone|nobody|no one|stop/i.test(text))
            label = "pattern_interrupt";
          if (/\bnot\b|wrong|myth/i.test(text)) label = "contrarian";
          if (/^how to|here's how|3 steps|framework/i.test(text))
            label = "howto";
          clusters[label] = clusters[label] || [];
          clusters[label].push(row);
        }

        broadcastJobEvent({
          id: jobId,
          type: "hooks_synthesize",
          status: "processing",
          progress: { step: "generating", pct: 50 },
        });
        // Legacy pushHook removed; out will be constructed by LLM or fallback
        const byCluster = Object.entries(clusters)
          .sort((a, b) => b[1].length - a[1].length)
          .slice(0, 4);
        // LLM brand-aware rewrite (preferred)
        const openai = process.env.OPENAI_API_KEY || "";
        let out: Array<{
          hook_text: string;
          angle: string;
          icp: string;
          risk_flags: string[];
          inspiration_url?: string;
        }> = [];
        if (openai) {
          try {
            const brandLatest = await getLatestBrandProfile();
            const icp = icpFilter || "DTC operators";
            const candidates: Array<{
              text: string;
              angle: string;
              url?: string;
            }> = [];
            for (const [label, rows] of byCluster) {
              for (const r of rows.slice(0, 10)) {
                const meta = (r as any).scrape_meta || {};
                const base = String(
                  meta.on_image_text ||
                    meta.first_transcript_line ||
                    r.caption_or_transcript ||
                    "",
                );
                const short =
                  base.split(/[.!?]/)[0]?.slice(0, 120) || base.slice(0, 120);
                const angle =
                  label === "contrarian"
                    ? "contrarian"
                    : label === "howto"
                      ? "howto"
                      : label === "pattern_interrupt"
                        ? "pattern_interrupt"
                        : "insight";
                if (short.trim())
                  candidates.push({
                    text: short.trim(),
                    angle,
                    url: (r as any).url,
                  });
                if (candidates.length >= 40) break;
              }
              if (candidates.length >= 40) break;
            }
            const reqBody: any = {
              model: process.env.OPENAI_LLM_MODEL || "gpt-5",
              messages: [
                {
                  role: "system",
                  content:
                    "You are a creative strategist. Output strictly valid JSON only, no prose.",
                },
                {
                  role: "user",
                  content: JSON.stringify({
                    brand: brandLatest?.data || {},
                    icp,
                    candidates,
                    instructions:
                      "Rewrite each candidate into a short-video hook in brand voice. 1-2 clauses, <= 110 chars, punchy, no emojis unless on-brand. Maintain or infer angle. Return JSON { items: [{ hook_text, angle, icp }] }",
                  }),
                },
              ],
              temperature: 0.7,
              response_format: { type: "json_object" },
            };
            const resp = await fetch(
              "https://api.openai.com/v1/chat/completions",
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${openai}`,
                },
                body: JSON.stringify(reqBody),
              },
            );
            const data = await resp.json();
            const content = data?.choices?.[0]?.message?.content || "{}";
            const parsed = (() => {
              try {
                return JSON.parse(content);
              } catch {
                return {};
              }
            })();
            const items = Array.isArray(parsed?.items)
              ? parsed.items
              : Array.isArray(parsed)
                ? parsed
                : [];
            for (const it of items) {
              const text = String(it?.hook_text || "").trim();
              if (!text) continue;
              out.push({
                hook_text: text,
                angle: String(it?.angle || "insight"),
                icp,
                risk_flags: [],
              });
              if (out.length >= 40) break;
            }
          } catch (e) {
            // fall back below
            out = [];
          }
        }

        if (out.length === 0) {
          // Heuristic fallback: sample from clusters
          const icp = icpFilter || "DTC operators";
          for (const [label, rows] of byCluster) {
            const top = rows.slice(0, 10);
            for (const r of top) {
              const base = String(
                (r as any).on_image_text ||
                  (r as any).first_transcript_line ||
                  r.caption_or_transcript ||
                  "",
              );
              const short =
                base.split(/[.!?]/)[0]?.slice(0, 80) || base.slice(0, 80);
              const angle =
                label === "contrarian"
                  ? "contrarian"
                  : label === "howto"
                    ? "howto"
                    : label === "pattern_interrupt"
                      ? "pattern_interrupt"
                      : "insight";
              out.push({
                hook_text: short,
                angle,
                icp,
                risk_flags: [],
                inspiration_url: (r as any).url,
              });
              if (out.length >= 40) break;
            }
            if (out.length >= 40) break;
          }
        }

        broadcastJobEvent({
          id: jobId,
          type: "hooks_synthesize",
          status: "processing",
          progress: { step: "persist", pct: 85 },
        });
        // Risk flagging based on brand banned phrases and simple heuristics
        try {
          const brand = await getLatestBrandProfile();
          const banned: string[] =
            (brand?.data?.voice?.banned_phrases as string[]) || [];
          const legal: string[] =
            (brand?.data?.legal_constraints as string[]) || [];
          const mkFlags = (text: string) => {
            const flags = new Set<string>();
            const lower = text.toLowerCase();
            for (const p of banned)
              if (p && lower.includes(p.toLowerCase()))
                flags.add("banned_phrase");
            for (const l of legal)
              if (l && lower.includes(l.toLowerCase()))
                flags.add("legal_constraint_match");
            if (
              /(guarantee|always|never fail|will (?:double|triple)|instant results)/i.test(
                text,
              )
            )
              flags.add("implied_guarantee");
            return Array.from(flags);
          };
          out = out.map((o) => ({
            ...o,
            risk_flags: Array.from(
              new Set([...(o.risk_flags || []), ...mkFlags(o.hook_text)]),
            ),
          }));
        } catch {}

        await insertHookSynthItems(jobId, mineId || null, out);
        await insertCost({
          jobId,
          provider: "gpt",
          amountUsd: Math.max(0.01, out.length * 0.001),
          meta: {
            route: "hooks.synthesize",
            icp: icpFilter || "DTC operators",
            count: out.length,
          },
        });
        await updateJob({
          id: jobId,
          status: "succeeded",
          completedAt: new Date(),
        });
        broadcastJobEvent({
          id: jobId,
          type: "hooks_synthesize",
          status: "succeeded",
          progress: { step: "completed", pct: 100 },
        });
      } catch (e: any) {
        const cat = categorizeError(e);
        await updateJob({
          id: jobId,
          status: "failed",
          error: e?.message || String(e),
          errorCategory: cat,
        });
        broadcastJobEvent({
          id: jobId,
          type: "hooks_synthesize",
          status: "failed",
          error_category: cat,
        });
      }
    });

    res.json({
      id: jobId,
      run_id: (req as any).id || undefined,
      status: "queued",
    });
  } catch (err) {
    req.log?.error?.(err, "hooks.synthesize.failed");
    res.status(500).json({ error: "hooks_synthesize_failed" });
  }
});

app.get("/hooks/corpus", async (req: Request, res: Response) => {
  try {
    const mineId = String(req.query.mine_id || "").trim() || undefined;
    const limit = Number(req.query.limit || 50);
    const offset = Number(req.query.offset || 0);
    const sort = String(req.query.sort || "").trim() || undefined;
    const rows = await listHookCorpus({ mineId, limit, offset, sort });
    res.json({ items: rows });
  } catch (err) {
    req.log?.error?.(err);
    res.status(500).json({ error: "hooks_corpus_list_failed" });
  }
});

app.get("/hooks/synth", async (req: Request, res: Response) => {
  try {
    const mineId = String(req.query.mine_id || "").trim() || undefined;
    const synthId = String(req.query.synth_id || "").trim() || undefined;
    const limit = Number(req.query.limit || 50);
    const offset = Number(req.query.offset || 0);
    const approved =
      typeof req.query.approved === "string"
        ? req.query.approved === "true"
        : undefined;
    const icp = String(req.query.icp || "").trim() || undefined;
    const sort = String(req.query.sort || "").trim() || undefined;
    const rows = await listHookSynth({
      mineId,
      synthId,
      limit,
      offset,
      approved,
      icp,
      sort,
    });
    res.json({ items: rows });
  } catch (err) {
    req.log?.error?.(err);
    res.status(500).json({ error: "hooks_synth_list_failed" });
  }
});

app.patch("/hooks/synth/:id", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { approved, hook_text, angle, icp, risk_flags, edited_hook_text } =
      req.body || {};
    await updateHookSynth(id, {
      approved,
      hook_text,
      angle,
      icp,
      risk_flags,
      edited_hook_text,
    });
    res.json({ ok: true });
  } catch (err) {
    req.log?.error?.(err);
    res.status(500).json({ error: "hooks_synth_update_failed" });
  }
});

app.post("/character/profile", async (req: Request, res: Response) => {
  const data = req.body;
  if (!validateCharacter(data)) {
    return res.status(400).json({
      error: "Invalid character_profile",
      details: validateCharacter.errors,
    });
  }
  const rawName = String((data as any)?.name || "").trim();
  const slug = rawName
    ? rawName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
    : "";
  const characterId = slug ? `character_${slug}` : `character_${Date.now()}`;
  await insertCharacterProfile(characterId, data);
  res.json({
    character_id: characterId,
    run_id: (req as any).id || undefined,
    data,
  });
});

// List characters (latest 50)
app.get("/character", async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      `select id, data, created_at from characters order by created_at desc limit 50`,
    );
    res.json({ items: rows });
  } catch (err) {
    res.status(500).json({ error: "characters_list_failed" });
  }
});

// Get a character by id
app.get("/character/:id", async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const { rows } = await pool.query(
      `select id, data, created_at from characters where id = $1`,
      [id],
    );
    if (!rows[0]) return res.status(404).json({ error: "not_found" });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: "character_get_failed" });
  }
});

app.post("/character/stability-test", async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const characterId =
      typeof body.character_id === "string" ? String(body.character_id) : null;
    const reference = String(body.reference_image || "").trim();
    if (!reference)
      return res.status(400).json({ error: "reference_image_required" });
    const prompts: string[] =
      Array.isArray(body.prompts) && body.prompts.length
        ? body.prompts.map((s: any) => String(s))
        : [
            "mascot at a standing desk, soft key light",
            "mascot in startup office, confident expression",
            "mascot close-up, clean typography background",
          ];
    const aspect = String(body.aspect_ratio || "9:16");
    const speed = String(body.rendering_speed || "Default");
    const results: Array<{
      prompt: string;
      output?: string;
      seed?: number | null;
      model_version?: string;
      status: string;
    }> = [];
    for (const p of prompts) {
      try {
        const input = buildModelInputs(
          "ideogram-character" as any,
          {
            prompt: p,
            character_reference_image: reference,
            aspect_ratio: aspect,
            rendering_speed: speed,
          } as any,
        );
        const pred = await createPrediction(
          MODEL_VERSIONS["ideogram-character"],
          input as any,
        );
        broadcastJobEvent({
          type: "character_stability",
          status: "processing",
          progress: { step: "polling", pct: 50 },
        });
        const finalPred: any = await waitForPrediction(pred.id);
        const out = finalPred?.output;
        const url: string | undefined = Array.isArray(out)
          ? out.find((u: any) => typeof u === "string")
          : typeof out === "string"
            ? out
            : undefined;
        const seed = extractSeedFromOutput(finalPred as any);
        const version = finalPred?.version;
        results.push({
          prompt: p,
          output: url,
          seed: seed ?? null,
          model_version: version,
          status: "succeeded",
        });
        await insertCharacterSeeds(characterId, [
          {
            prompt: p,
            seed: seed ?? null,
            model_version: version || null,
            image_url: url || null,
          },
        ]);
        await insertCost({
          jobId: `char_stability_${Date.now()}`,
          provider: "replicate",
          amountUsd: 0.02,
          meta: { route: "character.stability_test", version },
        });
      } catch (e) {
        results.push({ prompt: p, status: "failed" });
      }
    }
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: "stability_test_failed" });
  }
});

app.post("/scenes/plan", async (req: Request, res: Response) => {
  try {
    if (!(await requireBrandLocked(req, res))) return;
    const data = req.body;
    const items = Array.isArray(data) ? data : [data];
    for (const item of items) {
      if (!validateSceneSpec(item)) {
        return res.status(400).json({
          error: "Invalid scene spec",
          details: validateSceneSpec.errors,
        });
      }
    }
    const batchId = `scenespecs_${Date.now()}`;
    await insertSceneSpecs(batchId, items as any[]);
    res.json({
      id: batchId,
      run_id: (req as any).id || undefined,
      count: items.length,
    });
  } catch (err) {
    req.log?.error?.(err);
    res.status(500).json({ error: "scenes_plan_failed" });
  }
});

app.get("/scenes/plan", async (req: Request, res: Response) => {
  try {
    const batchId = String(req.query.batch_id || "").trim() || undefined;
    const sceneId = String(req.query.scene_id || "").trim() || undefined;
    const limit = Number(req.query.limit || 50);
    const offset = Number(req.query.offset || 0);
    const rows = await listSceneSpecs({ batchId, sceneId, limit, offset });
    res.json({ items: rows });
  } catch (err) {
    req.log?.error?.(err);
    res.status(500).json({ error: "scenes_plan_list_failed" });
  }
});

// Auto plan scenes from hooks using brand voice and schema guardrails
app.post("/scenes/auto-plan", async (req: Request, res: Response) => {
  try {
    if (!(await requireBrandLocked(req, res))) return;
    const body = req.body || {};
    const openai = process.env.OPENAI_API_KEY || "";
    if (!openai)
      return res.status(400).json({ error: "openai_api_key_required" });
    const hooks: string[] = Array.isArray(body?.hooks)
      ? body.hooks.map((h: any) => String(h)).filter((s: string) => s.trim())
      : typeof body?.hook === "string"
        ? [String(body.hook)]
        : [];
    const perHook = Math.max(1, Math.min(Number(body?.count_per_hook || 3), 6));
    if (hooks.length === 0)
      return res.status(400).json({ error: "hooks_required" });

    const brandLatest = await getLatestBrandProfile();
    const reqBody: any = {
      model: process.env.OPENAI_LLM_MODEL || "gpt-5",
      messages: [
        {
          role: "system",
          content:
            "You write production-ready scene blueprints. Output only JSON (no prose). Each scene follows the SceneSpecLine schema.",
        },
        {
          role: "user",
          content: JSON.stringify({
            brand: brandLatest?.data || {},
            hooks,
            count_per_hook: perHook,
            schema_contract:
              "SceneSpecLine: { scene_id:string, duration_s:number (<= 5), composition:string, props:string[], overlays:[{type:string,text?:string,time?:number}], model:'ideogram-character'|'imagen-4', model_inputs:object, audio?:{dialogue?:[{character,line}], vo_prompt?:string} }",
            instructions:
              "For each hook, emit 3-5 short scenes (<= 2.5s each). Prefer model='ideogram-character' with character_reference_image left as a placeholder. Use aspect_ratio '9:16' and rendering_speed 'Default'. For audio, include EITHER dialogue lines OR empty vo_prompt (do not include both). Return JSON { items: SceneSpecLine[] }.",
          }),
        },
      ],
      temperature: 0.4,
      response_format: { type: "json_object" },
    };
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openai}`,
      },
      body: JSON.stringify(reqBody),
    });
    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content || "{}";
    let parsed: any = {};
    try {
      parsed = JSON.parse(content);
    } catch {}
    const items = Array.isArray(parsed?.items) ? parsed.items : [];
    const validItems: any[] = [];
    for (const it of items) {
      const ok = validateSceneSpec(it);
      if (ok) validItems.push(it);
    }
    if (validItems.length === 0) {
      return res.status(422).json({ error: "no_valid_scenes" });
    }
    const batchId = `scenespecs_${Date.now()}`;
    await insertSceneSpecs(batchId, validItems as any[]);
    res.json({
      id: batchId,
      count: validItems.length,
      invalid: items.length - validItems.length,
      items: validItems,
    });
  } catch (err) {
    req.log?.error?.(err);
    res.status(500).json({ error: "auto_plan_failed" });
  }
});

const MODEL_VERSIONS: Record<string, string> = {
  "ideogram-character":
    process.env.REPLICATE_IDEOGRAM_CHARACTER_VERSION ||
    ReplicateClient.defaultVersions.ideogramCharacter,
  "imagen-4":
    process.env.REPLICATE_IMAGEN4_VERSION ||
    ReplicateClient.defaultVersions.imagen4,
  "veo-3":
    process.env.REPLICATE_VEO3_VERSION ||
    (ReplicateClient.defaultVersions as any).veo3Standard ||
    ReplicateClient.defaultVersions.veo3,
  "veo-3-fast":
    process.env.REPLICATE_VEO3_FAST_VERSION ||
    (ReplicateClient.defaultVersions as any).veo3Fast ||
    ReplicateClient.defaultVersions.veo3,
};

import { buildModelInputs } from "./models";

async function createPrediction(
  version: string,
  input: Record<string, unknown>,
) {
  const token = process.env.REPLICATE_API_TOKEN || "";
  const client = new ReplicateClient(token);
  return retryWithBackoff(async () => {
    const pred = await client.createPrediction(version, input);
    return { id: pred.id };
  });
}

async function getPrediction(id: string) {
  const token = process.env.REPLICATE_API_TOKEN || "";
  const client = new ReplicateClient(token);
  return retryWithBackoff(async () => client.getPrediction(id));
}

async function waitForPrediction(
  id: string,
  pollMs = 2000,
  timeoutMs = 10 * 60 * 1000,
) {
  const token = process.env.REPLICATE_API_TOKEN || "";
  const client = new ReplicateClient(token);
  return retryWithBackoff(async () =>
    client.waitForPrediction(id, pollMs, timeoutMs),
  );
}

async function retryWithBackoff<T>(fn: () => Promise<T>, retries = 3) {
  let lastErr: any;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      const ms = Math.min(1000 * Math.pow(2, i) + Math.random() * 200, 8000);
      await new Promise((r) => setTimeout(r, ms));
    }
  }
  throw lastErr;
}

function categorizeError(err: any): string {
  const msg = String(err?.message || err || "");
  if (/rate limit|429/i.test(msg)) return "rate_limit";
  if (/timeout/i.test(msg)) return "timeout";
  if (/network|fetch failed|ENOTFOUND|ECONN/i.test(msg)) return "network";
  return "api_error";
}

function extractSeed(pred: any): number | undefined {
  const out = pred?.output;
  if (!out) return undefined;
  if (typeof out === "object") {
    if (Array.isArray(out)) {
      for (const item of out) {
        if (
          item &&
          typeof item === "object" &&
          typeof (item as any).seed === "number"
        )
          return (item as any).seed;
      }
    } else {
      if (typeof (out as any).seed === "number") return (out as any).seed;
    }
  }
  const metrics = pred?.metrics;
  if (metrics && typeof metrics.seed === "number") return metrics.seed;
  return undefined;
}

app.post("/scenes/render", async (req: Request, res: Response) => {
  try {
    if (!(await requireBrandLocked(req, res))) return;
    const reqStart = Date.now();
    // Async mode via queue
    const idemKey =
      String(
        req.header("Idempotency-Key") || req.body?.idem_key || "",
      ).trim() || null;
    if (idemKey) {
      const existing = await findJobByIdemKey("scene_render", idemKey);
      if (existing) {
        return res.json({
          id: existing.id,
          status: existing.status,
          prediction_id: existing.prediction_id,
          model_version: existing.model_version,
          duration_ms: existing.duration_ms,
          seed: existing.seed ?? null,
        });
      }
    }
    const scene = (req.body?.scene ?? req.body) as any;
    if (!validateSceneSpec(scene)) {
      return res.status(400).json({
        error: "Invalid scene spec",
        details: validateSceneSpec.errors,
      });
    }
    const modelKey = String((scene as any).model ?? "");
    const version = MODEL_VERSIONS[modelKey];
    if (!version)
      return res
        .status(400)
        .json({ error: `Unsupported model: ${String((scene as any).model)}` });

    // Guardrail: cost cap before enqueue
    const estimate = estimateImageCost(
      modelKey,
      (scene as any).model_inputs || {},
    );
    const activeSum = await sumEstimatedCostsForActiveJobs();
    if (activeSum + estimate > guardrails.max_cost_per_batch_usd) {
      const jobId = `sceneimages_${Date.now()}`;
      await insertJob({
        id: jobId,
        type: "scene_render",
        status: "failed",
        startedAt: new Date(),
        payload: { request: scene },
      });
      await updateJob({
        id: jobId,
        error: "max_cost_exceeded",
        errorCategory: "guardrail",
        jobMeta: { rejected_by: "cost_cap", estimate },
        completedAt: new Date(),
      });
      broadcastJobEvent({
        id: jobId,
        type: "scene_render",
        status: "failed",
        progress: { step: "rejected_guardrail", pct: 0 },
      });
      return res.status(409).json({ error: "max_cost_exceeded" });
    }

    const jobId = `sceneimages_${Date.now()}`;
    await enqueueJob({
      id: jobId,
      type: "scene_render",
      payload: { scene },
      idemKey: idemKey || undefined,
      jobMeta: { request: scene },
    });
    // Cost estimate for image render
    try {
      await insertCost({
        jobId: jobId,
        provider: "replicate",
        amountUsd: estimate,
        meta: { route: "scenes.render", kind: "estimate" },
      });
    } catch {}
    broadcastJobEvent({ id: jobId, type: "scene_render", status: "queued" });
    res.status(202).json({ id: jobId, status: "queued" });
    const duration = Date.now() - reqStart;
    req.log?.info?.(
      { duration_ms: duration, job_id: jobId },
      "scenes.render.queued",
    );
  } catch (err) {
    req.log?.error?.(err);
    try {
      // Best-effort: if jobId exists in closure, mark as failed
      const lastJobId = (req as any).last_scene_job_id || undefined;
      if (lastJobId) {
        await updateJob({
          id: lastJobId,
          status: "failed",
          error: (err as any)?.message || "render_failed",
        });
        broadcastJobEvent({
          id: lastJobId,
          type: "scene_render",
          status: "failed",
        });
      }
    } catch {}
    res.status(500).json({ error: "render_failed" });
  }
});

app.post("/videos/assemble", async (req: Request, res: Response) => {
  try {
    if (!(await requireBrandLocked(req, res))) return;
    const reqStart = Date.now();
    // Async via queue
    const idemKey =
      String(
        req.header("Idempotency-Key") || req.body?.idem_key || "",
      ).trim() || null;
    if (idemKey) {
      const existing = await findJobByIdemKey("video_assemble", idemKey);
      if (existing) {
        return res.json({
          id: existing.id,
          status: existing.status,
          prediction_id: existing.prediction_id,
          model_version: existing.model_version,
          duration_ms: existing.duration_ms,
        });
      }
    }
    const manifest = (req.body?.manifest ?? req.body) as any;
    if (!validateVideoManifest(manifest as any)) {
      return res.status(400).json({
        error: "Invalid video manifest",
        details: validateVideoManifest.errors,
      });
    }
    const estimate = estimateVideoCost(manifest);
    const activeSum = await sumEstimatedCostsForActiveJobs();
    if (activeSum + estimate > guardrails.max_cost_per_batch_usd) {
      const jobId = `video_${Date.now()}`;
      await insertJob({
        id: jobId,
        type: "video_assemble",
        status: "failed",
        startedAt: new Date(),
        payload: { request: manifest },
      });
      await updateJob({
        id: jobId,
        error: "max_cost_exceeded",
        errorCategory: "guardrail",
        jobMeta: { rejected_by: "cost_cap", estimate },
        completedAt: new Date(),
      });
      broadcastJobEvent({
        id: jobId,
        type: "video_assemble",
        status: "failed",
        progress: { step: "rejected_guardrail", pct: 0 },
      });
      return res.status(409).json({ error: "max_cost_exceeded" });
    }

    const jobId = `video_${Date.now()}`;
    await enqueueJob({
      id: jobId,
      type: "video_assemble",
      payload: { manifest, model: manifest?.model },
      idemKey: idemKey || undefined,
      jobMeta: { request: manifest },
    });
    // Cost estimate (no-op math OK): base estimate for video assembly
    try {
      await insertCost({
        jobId,
        provider: "replicate",
        amountUsd: estimate,
        meta: { route: "videos.assemble", kind: "estimate" },
      });
    } catch {}
    broadcastJobEvent({ id: jobId, type: "video_assemble", status: "queued" });
    res.status(202).json({ id: jobId, status: "queued" });
    const duration = Date.now() - reqStart;
    req.log?.info?.(
      { duration_ms: duration, job_id: jobId },
      "videos.assemble.queued",
    );
  } catch (err) {
    req.log?.error?.(err);
    try {
      const lastJobId = (req as any).last_video_job_id || undefined;
      if (lastJobId) {
        await updateJob({
          id: lastJobId,
          status: "failed",
          error: (err as any)?.message || "video_assemble_failed",
        });
        broadcastJobEvent({
          id: lastJobId,
          type: "video_assemble",
          status: "failed",
        });
      }
    } catch {}
    res.status(500).json({ error: "video_assemble_failed" });
  }
});

// CSV export for today's renders and videos
app.get("/export/report.csv", async (_req: Request, res: Response) => {
  try {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const { rows } = await pool.query(
      `select j.id as job_id,
              j.type,
              j.status,
              j.model_version,
              j.seed,
              j.duration_ms,
              j.created_at,
              coalesce(sum(c.amount_usd) filter (where (c.meta->>'kind') = 'estimate'), 0) as cost_estimate_usd,
              coalesce(sum(c.amount_usd) filter (where (c.meta->>'kind') = 'actual'), 0) as cost_actual_usd
       from jobs j
       left join cost_ledger c on c.job_id = j.id
       where j.created_at >= $1 and j.type in ('scene_render','video_assemble')
       group by j.id
       order by j.created_at desc`,
      [start.toISOString()],
    );
    const header = [
      "job_id",
      "type",
      "status",
      "model_version",
      "seed",
      "duration_ms",
      "cost_estimate_usd",
      "cost_actual_usd",
      "created_at",
    ];
    const lines = [header.join(",")];
    for (const r of rows) {
      const vals = [
        r.job_id,
        r.type,
        r.status,
        r.model_version || "",
        r.seed != null ? String(r.seed) : "",
        r.duration_ms != null ? String(r.duration_ms) : "",
        Number(r.cost_estimate_usd || 0).toFixed(2),
        Number(r.cost_actual_usd || 0).toFixed(2),
        new Date(r.created_at).toISOString(),
      ];
      // rudimentary CSV escaping for commas/quotes
      const escaped = vals.map((v) =>
        /[",\n]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : String(v),
      );
      lines.push(escaped.join(","));
    }
    const csv = lines.join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.status(200).send(csv);
  } catch (err) {
    res.status(500).json({ error: "report_failed" });
  }
});

// Simple in-memory fan-out for job events (Week 1)
type SseClient = { write: (chunk: string) => void };
const sseClients: Set<SseClient> = new Set();

function broadcastJobEvent(evt: any) {
  const payload = JSON.stringify(evt);
  for (const c of sseClients) {
    try {
      c.write(`event: job\n`);
      c.write(`data: ${payload}\n\n`);
    } catch {}
  }
}

// In-memory stores for hooks (Week 2 stubs)
const hookCorpusStore = new Map<string, any[]>();
const hookSynthStore = new Map<string, any[]>();

app.get("/jobs/stream", (req: Request, res: Response) => {
  const started = Date.now();
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  sseClients.add(res as any);
  const interval = setInterval(() => {
    res.write(`event: ping\n`);
    res.write(`data: {"ts": ${Date.now()}}\n\n`);
  }, 3000);
  req.on("close", () => {
    clearInterval(interval);
    sseClients.delete(res as any);
    const durationMs = Date.now() - started;
    req.log?.info?.({ duration_ms: durationMs }, "sse.client.disconnected");
  });
});

// Recent jobs and KPIs
app.get("/jobs/recent", async (req: Request, res: Response) => {
  try {
    const limit = Number(req.query.limit || 50);
    const jobs = await getRecentJobs(Math.min(Math.max(1, limit), 200));
    res.json({ items: jobs });
  } catch (err) {
    req.log?.error?.(err);
    res.status(500).json({ error: "jobs_recent_failed" });
  }
});

// Job detail (artifacts + costs + meta)
app.get("/jobs/:id", async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const job = await getJobDetail(id);
    if (!job) return res.status(404).json({ error: "job_not_found" });
    res.json(job);
  } catch (err) {
    req.log?.error?.(err);
    res.status(500).json({ error: "job_detail_failed" });
  }
});

// Approve/Reject and rerun endpoints for basic review flow (Week 1+)
app.post("/jobs/:id/decision", async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const { decision, note } = req.body || {};
    if (!decision || !["approved", "rejected"].includes(decision))
      return res.status(400).json({ error: "decision_required" });
    await updateJob({ id, status: "succeeded" });
    // Store decision fields
    await (async () => {
      try {
        await (
          await import("./db")
        ).pool.query(
          `update jobs set decision = $2, decision_note = $3 where id = $1`,
          [id, decision, note || null],
        );
      } catch {}
    })();
    broadcastJobEvent({ id, type: "job_decision", status: decision });
    res.json({ ok: true });
  } catch (err) {
    req.log?.error?.(err);
    res.status(500).json({ error: "decision_failed" });
  }
});

app.post("/jobs/:id/rerun", async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const job = (
      await (
        await import("./db")
      ).pool.query(`select * from jobs where id = $1`, [id])
    ).rows[0];
    if (!job) return res.status(404).json({ error: "job_not_found" });
    const type = String(job.type || "");
    if (type !== "scene_render" && type !== "video_assemble")
      return res.status(400).json({ error: "unsupported_rerun" });
    // For simplicity, require client to provide payload again
    const payload = req.body?.payload || null;
    if (!payload) return res.status(400).json({ error: "payload_required" });
    // Map to existing endpoints
    if (type === "scene_render") {
      (req as any).body = { scene: payload };
      return app._router.handle(req, res, () => undefined);
    }
    if (type === "video_assemble") {
      (req as any).body = { manifest: payload };
      return app._router.handle(req, res, () => undefined);
    }
  } catch (err) {
    req.log?.error?.(err);
    res.status(500).json({ error: "rerun_failed" });
  }
});

app.get("/kpis/today", async (_req: Request, res: Response) => {
  try {
    const kpis = await getKpisToday();
    res.json(kpis);
  } catch (err) {
    res.status(500).json({ error: "kpis_failed" });
  }
});

// Guardrails config (Week 1+ minimal): in-memory with env defaults
let guardrails = {
  max_cost_per_batch_usd: Number(process.env.MAX_COST_PER_BATCH || 10),
  max_concurrency: Number(process.env.MAX_CONCURRENCY || 3),
};

app.get("/settings/guardrails", (_req: Request, res: Response) => {
  res.json(guardrails);
});

app.post("/settings/guardrails", (req: Request, res: Response) => {
  const { max_cost_per_batch_usd, max_concurrency } = req.body || {};
  if (
    typeof max_cost_per_batch_usd !== "number" ||
    typeof max_concurrency !== "number"
  )
    return res
      .status(400)
      .json({ error: "invalid_settings", details: "numbers_required" });
  if (max_concurrency < 1 || max_concurrency > 20)
    return res
      .status(400)
      .json({ error: "invalid_settings", details: "max_concurrency_range" });
  if (max_cost_per_batch_usd < 0 || max_cost_per_batch_usd > 10000)
    return res
      .status(400)
      .json({ error: "invalid_settings", details: "max_cost_range" });
  const prev = guardrails;
  guardrails = { max_cost_per_batch_usd, max_concurrency };
  req.log?.info?.({ prev, next: guardrails }, "guardrails.updated");
  res.json({ ok: true, guardrails });
});

// Presigned upload URL for assets (R2/MinIO compatible)
app.post("/uploads/sign", async (req: Request, res: Response) => {
  try {
    const { key, content_type } = req.body || {};
    if (!key || !content_type)
      return res.status(400).json({ error: "key_and_content_type_required" });
    const s3 = createS3Client({
      endpoint: process.env.S3_ENDPOINT || "http://localhost:9000",
      region: process.env.S3_REGION || "auto",
      accessKeyId: process.env.S3_ACCESS_KEY || "",
      secretAccessKey: process.env.S3_SECRET_KEY || "",
      bucket: process.env.S3_BUCKET || "gpt5video",
      forcePathStyle: true,
    });
    const url = await createPresignedPutUrl(
      s3 as any,
      process.env.S3_BUCKET || "gpt5video",
      key,
      content_type,
      900,
    );
    res.json({ url, key });
  } catch (err) {
    req.log?.error?.(err);
    res.status(500).json({ error: "sign_failed" });
  }
});

// Presigned GET for debugging object availability
app.get("/uploads/debug-get", async (req: Request, res: Response) => {
  try {
    const key = String(req.query.key || "");
    if (!key) return res.status(400).json({ error: "key_required" });
    const s3 = createS3Client({
      endpoint: process.env.S3_ENDPOINT || "http://localhost:9000",
      region: process.env.S3_REGION || "auto",
      accessKeyId: process.env.S3_ACCESS_KEY || "",
      secretAccessKey: process.env.S3_SECRET_KEY || "",
      bucket: process.env.S3_BUCKET || "gpt5video",
      forcePathStyle: true,
    });
    const url = await createPresignedGetUrl(
      s3 as any,
      process.env.S3_BUCKET || "gpt5video",
      key,
      300,
    );
    const base = process.env.PUBLIC_ASSET_BASE;
    const public_url = base ? `${base.replace(/\/$/, "")}/${key}` : undefined;
    res.json({ url, public_url });
  } catch (err) {
    req.log?.error?.(err);
    res.status(500).json({ error: "debug_get_failed" });
  }
});

// Direct upload for debugging write path without presign
app.post("/uploads/debug-put", async (req: Request, res: Response) => {
  try {
    const { key, content, content_base64, content_type, is_data_url } =
      (req.body || {}) as any;
    if (!key || (content === undefined && !content_base64))
      return res.status(400).json({ error: "key_and_content_required" });
    const s3 = createS3Client({
      endpoint: process.env.S3_ENDPOINT || "http://localhost:9000",
      region: process.env.S3_REGION || "auto",
      accessKeyId: process.env.S3_ACCESS_KEY || "",
      secretAccessKey: process.env.S3_SECRET_KEY || "",
      bucket: process.env.S3_BUCKET || "gpt5video",
      forcePathStyle: true,
    });
    let body: any;
    if (typeof content_base64 === "string" && content_base64.length > 0) {
      let b64 = content_base64;
      if (is_data_url && /^data:/i.test(b64)) {
        const m = b64.match(/^data:[^;]+;base64,(.*)$/);
        b64 = m ? m[1] : b64;
      }
      body = Buffer.from(b64, "base64");
    } else if (typeof content === "string") {
      body = content;
    } else {
      body = JSON.stringify(content);
    }
    await putObjectDirect(
      s3 as any,
      process.env.S3_BUCKET || "gpt5video",
      key,
      body,
      content_type || "application/octet-stream",
    );
    try {
      const head = await headObject(
        s3 as any,
        process.env.S3_BUCKET || "gpt5video",
        key,
      );
      return res.json({ ok: true, head });
    } catch {
      return res.json({ ok: true, head: null });
    }
  } catch (err) {
    req.log?.error?.(err);
    res.status(500).json({ error: "debug_put_failed" });
  }
});

// List recent assets for dashboard
app.get("/assets", async (req: Request, res: Response) => {
  try {
    const prefix = String(req.query.prefix || "");
    const limit = Number(req.query.limit || 50);
    const s3 = createS3Client({
      endpoint: process.env.S3_ENDPOINT || "http://localhost:9000",
      region: process.env.S3_REGION || "auto",
      accessKeyId: process.env.S3_ACCESS_KEY || "",
      secretAccessKey: process.env.S3_SECRET_KEY || "",
      bucket: process.env.S3_BUCKET || "gpt5video",
      forcePathStyle: true,
    });
    const objects = await listObjects(
      s3 as any,
      process.env.S3_BUCKET || "gpt5video",
      prefix,
      limit,
    );
    const base = process.env.PUBLIC_ASSET_BASE?.replace(/\/$/, "");
    const items = objects.map((o: any) => ({
      key: o.key,
      last_modified: o.lastModified?.toISOString?.() ?? null,
      size: o.size ?? null,
      preview_url: base ? `${base}/${o.key}` : undefined,
    }));
    res.json({ items });
  } catch (err) {
    req.log?.error?.(err);
    res.status(500).json({ error: "assets_list_failed" });
  }
});

// Scene images listing (archive access)
app.get("/scenes/images", async (req: Request, res: Response) => {
  try {
    const sceneId = String(req.query.scene_id || "").trim();
    if (!sceneId) return res.status(400).json({ error: "scene_id_required" });
    const { rows } = await pool.query(
      `select scene_id, image_url, seed, model_version, params, job_id, created_at from scene_images where scene_id = $1 order by created_at desc`,
      [sceneId],
    );
    res.json({ items: rows });
  } catch (err) {
    req.log?.error?.(err);
    res.status(500).json({ error: "scene_images_list_failed" });
  }
});

// Retrieve persisted video manifest for a given job
app.get("/videos/:job_id/manifest", async (req: Request, res: Response) => {
  try {
    const jobId = String(req.params.job_id);
    const { rows } = await pool.query(
      `select job_id, manifest, created_at from video_manifests where job_id = $1 order by created_at desc limit 1`,
      [jobId],
    );
    if (!rows[0]) return res.status(404).json({ error: "not_found" });
    res.json(rows[0]);
  } catch (err) {
    req.log?.error?.(err);
    res.status(500).json({ error: "video_manifest_get_failed" });
  }
});

const port = Number(process.env.PORT || 4000);
ensureTables().then(() => {
  startWorkerLoop();
  app.listen(port, () => logger.info({ port }, "API listening"));
});

// Cancel queued job (best-effort)
app.post("/jobs/:id/cancel", async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const row = await cancelJob(id);
    if (!row) return res.status(409).json({ error: "not_cancellable" });
    broadcastJobEvent({ id, type: row.type, status: "cancelled" });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "cancel_failed" });
  }
});

// Minimal in-process worker loop with concurrency guardrail
async function startWorkerLoop() {
  const workerId = `worker_${process.pid}_${Math.random().toString(36).slice(2, 6)}`;
  async function tick() {
    try {
      const processing = await countProcessingJobs();
      if (processing >= guardrails.max_concurrency) return;
      const job = await claimNextQueuedJob(
        ["scene_render", "video_assemble"],
        workerId,
      );
      if (!job) return;
      const child = logger.child({ worker_id: workerId, job_id: job.id });
      broadcastJobEvent({
        id: job.id,
        type: job.type,
        status: "processing",
        progress: { step: "claimed", pct: 5 },
        attempt_count: Number((job as any).attempt_count || 0),
      });
      const payload = await getJobPayload(job.id);
      if (!payload) return;
      const t0 = Date.now();
      if (job.type === "scene_render")
        await handleSceneRenderJob(job.id, payload.scene, child, t0);
      else if (job.type === "video_assemble")
        await handleVideoAssembleJob(job.id, payload.manifest, child, t0);
    } catch (e) {
      logger.warn({ err: e }, "worker.tick.error");
    }
  }
  setInterval(tick, 750);
}

async function handleSceneRenderJob(
  jobId: string,
  scene: any,
  log = logger,
  t0 = Date.now(),
) {
  try {
    broadcastJobEvent({
      id: jobId,
      type: "scene_render",
      status: "processing",
      progress: { step: "creating_prediction", pct: 10 },
      attempt_count: await getJobAttemptCount(jobId),
    });
    log.info({ step: "creating_prediction" }, "scene_render.start");
    const modelKey = String((scene as any).model ?? "");
    const version = MODEL_VERSIONS[modelKey];
    const mapped = buildModelInputs(
      modelKey as any,
      (scene as any).model_inputs as Record<string, unknown>,
    );
    let pred: any;
    try {
      pred = await createPrediction(version, mapped as Record<string, unknown>);
    } catch (e) {
      await scheduleRetry(jobId, e);
      return;
    }
    broadcastJobEvent({
      id: jobId,
      type: "scene_render",
      status: "processing",
      progress: { step: "polling", pct: 40 },
      prediction_id: pred.id,
      attempt_count: await getJobAttemptCount(jobId),
    });
    log.info({ step: "polling", prediction_id: pred.id }, "scene_render.poll");
    let finalPred: any;
    try {
      finalPred = await waitForPrediction(pred.id);
    } catch (e) {
      await scheduleRetry(jobId, e);
      return;
    }
    const startedAt =
      (finalPred as any).created_at ||
      (finalPred as any).createdAt ||
      undefined;
    const completedAt =
      (finalPred as any).completed_at ||
      (finalPred as any).completedAt ||
      undefined;
    const durationMs =
      startedAt && completedAt
        ? Date.parse(completedAt) - Date.parse(startedAt)
        : undefined;
    const seed = extractSeedFromOutput(finalPred as any);
    await updateJob({
      id: jobId,
      status: "succeeded",
      predictionId: finalPred.id,
      modelVersion: finalPred.version,
      seed: seed ?? null,
      completedAt: completedAt ? new Date(completedAt) : new Date(),
      durationMs: durationMs ?? null,
      jobMeta: { response: finalPred },
    });
    const duration = Date.now() - t0;
    log.info(
      { duration_ms: duration, run_id: finalPred?.id },
      "scene_render.done",
    );
    broadcastJobEvent({
      id: jobId,
      type: "scene_render",
      status: "succeeded",
      predictionId: finalPred.id,
      modelVersion: finalPred.version,
      progress: { step: "succeeded", pct: 100 },
      attempt_count: await getJobAttemptCount(jobId),
    });
    try {
      const out = (finalPred as any).output;
      const urls: string[] = Array.isArray(out)
        ? out.filter((u: any) => typeof u === "string")
        : typeof out === "string"
          ? [out]
          : [];
      for (const url of urls) {
        const type = /\.mp4|\.webm/i.test(url)
          ? "video"
          : /\.png|\.jpg|\.jpeg|\.gif/i.test(url)
            ? "image"
            : null;
        await insertArtifact({
          jobId,
          type: type || undefined,
          url,
          key: null,
        });
        // Persist scene_images line if image
        if (type === "image") {
          await insertSceneImageLine({
            scene_id: String((scene as any)?.scene_id || "unknown"),
            image_url: url,
            seed: seed ?? null,
            model_version: finalPred.version || null,
            params: (scene as any)?.model_inputs || null,
            job_id: jobId,
          });
        }
      }
      await insertCost({
        jobId,
        provider: "replicate",
        amountUsd:
          computeActualImageCost(finalPred) ??
          estimateImageCost(modelKey, (scene as any).model_inputs),
        meta: {
          route: "scenes.render",
          version: finalPred.version,
          kind: "actual",
        },
      });
    } catch (e) {
      logger.warn({ err: e }, "artifact_persist_failed");
    }
  } catch (e) {
    logger.error({ err: e }, "scene_render.worker_failed");
  }
}

async function handleVideoAssembleJob(
  jobId: string,
  manifest: any,
  log = logger,
  t0 = Date.now(),
) {
  try {
    broadcastJobEvent({
      id: jobId,
      type: "video_assemble",
      status: "processing",
      progress: { step: "creating_prediction", pct: 10 },
      attempt_count: await getJobAttemptCount(jobId),
    });
    log.info({ step: "creating_prediction" }, "video_assemble.start");
    const prompt = buildVideoPrompt(manifest);
    const requestedModel = String((manifest as any)?.model || "").trim();
    const modelKey =
      requestedModel === "veo-3" || requestedModel === "veo-3-fast"
        ? requestedModel
        : "veo-3";
    let pred: any;
    try {
      const input: any = { prompt };
      // If refs provided, send the first reference as an input image for identity anchoring
      try {
        const refs = manifest?.refs || {};
        const firstRef = Array.isArray(manifest?.order)
          ? refs[manifest.order[0]]
          : undefined;
        if (typeof firstRef === "string" && firstRef) {
          input.image = firstRef;
        }
      } catch {}
      pred = await createPrediction(MODEL_VERSIONS[modelKey], input);
    } catch (e) {
      await scheduleRetry(jobId, e);
      return;
    }
    let finalPred: any;
    try {
      broadcastJobEvent({
        id: jobId,
        type: "video_assemble",
        status: "processing",
        progress: { step: "polling", pct: 40 },
        prediction_id: pred.id,
        attempt_count: await getJobAttemptCount(jobId),
      });
      log.info(
        { step: "polling", prediction_id: pred.id },
        "video_assemble.poll",
      );
      finalPred = await waitForPrediction(pred.id);
    } catch (e) {
      await scheduleRetry(jobId, e);
      return;
    }
    const startedAt =
      (finalPred as any).created_at ||
      (finalPred as any).createdAt ||
      undefined;
    const completedAt =
      (finalPred as any).completed_at ||
      (finalPred as any).completedAt ||
      undefined;
    const durationMs =
      startedAt && completedAt
        ? Date.parse(completedAt) - Date.parse(startedAt)
        : undefined;
    await updateJob({
      id: jobId,
      status: "succeeded",
      predictionId: finalPred.id,
      modelVersion: finalPred.version,
      completedAt: completedAt ? new Date(completedAt) : new Date(),
      durationMs: durationMs ?? null,
      jobMeta: { response: finalPred },
    });
    const duration = Date.now() - t0;
    log.info(
      { duration_ms: duration, run_id: finalPred?.id },
      "video_assemble.done",
    );
    broadcastJobEvent({
      id: jobId,
      type: "video_assemble",
      status: "succeeded",
      predictionId: finalPred.id,
      modelVersion: finalPred.version,
      progress: { step: "succeeded", pct: 100 },
      attempt_count: await getJobAttemptCount(jobId),
    });
    try {
      const out = (finalPred as any).output;
      const urls: string[] = Array.isArray(out)
        ? out.filter((u: any) => typeof u === "string")
        : typeof out === "string"
          ? [out]
          : [];
      for (const url of urls) {
        const type = /\.mp4|\.webm/i.test(url)
          ? "video"
          : /\.png|\.jpg|\.jpeg|\.gif/i.test(url)
            ? "image"
            : null;
        await insertArtifact({
          jobId,
          type: type || undefined,
          url,
          key: null,
        });
      }
      // Persist video_manifest used for this job
      await insertVideoManifest({ job_id: jobId, manifest });
      await insertCost({
        jobId,
        provider: "replicate",
        amountUsd:
          computeActualVideoCost(finalPred) ?? estimateVideoCost(manifest),
        meta: {
          route: "videos.assemble",
          version: finalPred.version,
          kind: "actual",
        },
      });
    } catch (e) {
      logger.warn({ err: e }, "artifact_persist_failed");
    }
  } catch (e) {
    logger.error({ err: e }, "video_assemble.worker_failed");
  }
}

async function scheduleRetry(jobId: string, err: any) {
  try {
    const { rows } = await pool.query(
      `select attempt_count from jobs where id = $1`,
      [jobId],
    );
    const attempt = Number(rows[0]?.attempt_count || 0) + 1;
    const maxAttempts = 3;
    const category = categorizeError(err);
    if (attempt > maxAttempts) {
      await updateJob({
        id: jobId,
        status: "failed",
        error: (err as any)?.message || String(err),
        errorCategory: category,
      });
      broadcastJobEvent({
        id: jobId,
        type: "job",
        status: "failed",
        error_category: category,
        attempt_count: attempt,
      });
      return;
    }
    const backoffMs = Math.min(
      1000 * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 250),
      8000,
    );
    const next = new Date(Date.now() + backoffMs);
    await updateJob({
      id: jobId,
      status: "queued",
      lockedAt: null,
      lockedBy: null,
      attemptCount: attempt,
      nextRunAt: next,
      error: (err as any)?.message || String(err),
      errorCategory: category,
    });
    broadcastJobEvent({
      id: jobId,
      type: "job",
      status: "queued",
      progress: { step: "retry_scheduled", pct: 0 },
      attempt_count: attempt,
    });
  } catch (e) {
    logger.warn({ err: e }, "schedule_retry_failed");
  }
}

// --- Cost estimation helpers (simple heuristics; schema-first ensures inputs) ---
function estimateImageCost(
  modelKey: string,
  modelInputs: Record<string, unknown>,
): number {
  const base = modelKey === "imagen-4" ? 0.03 : 0.02;
  const speed = String((modelInputs as any)?.rendering_speed || "Default");
  const speedFactor = speed === "Fast" ? 0.8 : speed === "Slow" ? 1.2 : 1.0;
  return Number((base * speedFactor).toFixed(2));
}

function computeActualImageCost(finalPred: any): number | undefined {
  // Placeholder: Replicate price not in API response; fall back to estimate
  return undefined;
}

function estimateVideoCost(manifest: any): number {
  const scenes = Array.isArray(manifest?.order) ? manifest.order.length : 1;
  const audioMode = manifest?.audio?.mode || "none";
  const audioFactor =
    audioMode === "voiceover" ? 1.15 : audioMode === "dialogue" ? 1.3 : 1.0;
  const base = 0.05 + (scenes - 1) * 0.01;
  return Number((base * audioFactor).toFixed(2));
}

function computeActualVideoCost(finalPred: any): number | undefined {
  // Placeholder until provider returns billing info; fall back to estimate in worker
  return undefined;
}

function buildVideoPrompt(manifest: any): string {
  const scenes: string[] = Array.isArray(manifest.order) ? manifest.order : [];
  const motion = manifest.motion;
  const transitions = manifest.transitions;
  const audio = manifest.audio;
  const refs: Record<string, string> = manifest.refs || {};
  let audioText = "";
  if (audio && audio.mode && audio.mode !== "none") {
    if (audio.mode === "voiceover") {
      audioText = ` Voiceover style=${audio.voice_style || ""} lang=${audio.language || ""} pace=${audio.pace || ""} volume=${audio.volume || ""}. Script: ${audio.vo_prompt || ""}`;
    } else if (audio.mode === "dialogue") {
      audioText = ` Dialogue is enabled with provided timings.`;
    }
  }
  // Build per-scene lines that mention a reference when provided
  const lines = scenes.map((id, idx) => {
    const ref = refs[id] ? ` Start with reference image: ${refs[id]}.` : "";
    return `${idx + 1}. Scene ${id}.${ref}`;
  });
  return `Create a short dynamic video with ${motion}. Transitions: ${transitions}. Scenes in order:\n${lines.join("\n")}\n${audioText}`;
}
