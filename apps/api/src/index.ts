import "dotenv/config";
import express, { Request, Response } from "express";
import cors from "cors";
import pino from "pino";
import pinoHttp from "pino-http";
import { randomUUID } from "crypto";
import { ajv } from "@gpt5video/shared";
import {
  ensureTables,
  insertJob,
  updateJob,
  getRecentJobs,
  getKpisToday,
  insertArtifact,
  insertCost,
  countQueuedJobs,
} from "./db";
import {
  createS3Client,
  createPresignedPutUrl,
  createPresignedGetUrl,
  putObjectDirect,
  headObject,
  listObjects,
} from "@gpt5video/storage";
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

// Stubs for Week 1 endpoints (schema validation to be added next)
const validateBrand = ajv.compile(brandProfileSchema as any);
const validateSceneSpec = ajv.compile(sceneSpecSchema as any);
const validateVideoManifest = ajv.compile(videoManifestSchema as any);
const validateCharacter = ajv.compile(characterProfileSchema as any);

app.post("/ingest/brand", (req: Request, res: Response) => {
  if (!validateBrand(req.body)) {
    return res
      .status(400)
      .json({ error: "Invalid brand_profile", details: validateBrand.errors });
  }
  req.log?.info?.({ run_id: (req as any).id }, "ingest.brand.received");
  res.json({
    id: `brand_${Date.now()}`,
    run_id: (req as any).id || undefined,
    data: req.body,
  });
});

app.post("/hooks/mine", async (req: Request, res: Response) => {
  const body = req.body || {};
  const jobId = `hooks_mine_${Date.now()}`;
  await insertJob({
    id: jobId,
    type: "hooks_mine",
    status: "queued",
    startedAt: new Date(),
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
    runId: (req as any).id || undefined,
  });
  // Week 1: stub succeeds immediately
  await updateJob({ id: jobId, status: "succeeded", completedAt: new Date() });
  req.log?.info?.(
    { run_id: (req as any).id, job_id: jobId },
    "hooks.mine.succeeded",
  );
  broadcastJobEvent({
    id: jobId,
    type: "hooks_mine",
    status: "succeeded",
    runId: (req as any).id || undefined,
  });
  res.json({
    id: jobId,
    run_id: (req as any).id || undefined,
    request: body,
    status: "queued",
  });
});

app.post("/hooks/synthesize", async (req: Request, res: Response) => {
  const body = req.body || {};
  const jobId = `hooks_synthesize_${Date.now()}`;
  await insertJob({
    id: jobId,
    type: "hooks_synthesize",
    status: "queued",
    startedAt: new Date(),
  });
  await updateJob({ id: jobId, runId: (req as any).id || null });
  req.log?.info?.(
    { run_id: (req as any).id, job_id: jobId },
    "hooks.synthesize.queued",
  );
  broadcastJobEvent({
    id: jobId,
    type: "hooks_synthesize",
    status: "queued",
    runId: (req as any).id || undefined,
  });
  // Week 1: stub succeeds immediately
  await updateJob({ id: jobId, status: "succeeded", completedAt: new Date() });
  req.log?.info?.(
    { run_id: (req as any).id, job_id: jobId },
    "hooks.synthesize.succeeded",
  );
  broadcastJobEvent({
    id: jobId,
    type: "hooks_synthesize",
    status: "succeeded",
    runId: (req as any).id || undefined,
  });
  res.json({
    id: jobId,
    run_id: (req as any).id || undefined,
    request: body,
    status: "queued",
  });
});

app.post("/character/profile", (req: Request, res: Response) => {
  const data = req.body;
  if (!validateCharacter(data)) {
    return res.status(400).json({
      error: "Invalid character_profile",
      details: validateCharacter.errors,
    });
  }
  res.json({
    id: `character_${Date.now()}`,
    run_id: (req as any).id || undefined,
    data,
  });
});

app.post("/scenes/plan", (req: Request, res: Response) => {
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
  res.json({
    id: `scenespecs_${Date.now()}`,
    run_id: (req as any).id || undefined,
    data,
  });
});

const MODEL_VERSIONS: Record<string, string> = {
  "ideogram-character": "ideogram-ai/ideogram-character",
  "imagen-4": "google/imagen-4",
  "veo-3": "google/veo-3",
};

import { ReplicateClient } from "@gpt5video/replicate-client";
import { buildModelInputs } from "./models";

async function createPrediction(
  version: string,
  input: Record<string, unknown>,
) {
  const token = process.env.REPLICATE_API_TOKEN || "";
  const client = new ReplicateClient(token);
  const pred = await client.createPrediction(version, input);
  return { id: pred.id };
}

async function getPrediction(id: string) {
  const token = process.env.REPLICATE_API_TOKEN || "";
  const client = new ReplicateClient(token);
  return client.getPrediction(id);
}

async function waitForPrediction(
  id: string,
  pollMs = 2000,
  timeoutMs = 10 * 60 * 1000,
) {
  const token = process.env.REPLICATE_API_TOKEN || "";
  const client = new ReplicateClient(token);
  return client.waitForPrediction(id, pollMs, timeoutMs);
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
    // Simple concurrency guardrail
    const queued = await countQueuedJobs();
    if (queued >= guardrails.max_concurrency)
      return res.status(429).json({ error: "concurrency_limit" });
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

    const jobId = `sceneimages_${Date.now()}`;
    await insertJob({
      id: jobId,
      type: "scene_render",
      status: "queued",
      startedAt: new Date(),
    });
    broadcastJobEvent({ id: jobId, type: "scene_render", status: "queued" });

    const mapped = buildModelInputs(
      modelKey as any,
      (scene as any).model_inputs as Record<string, unknown>,
    );
    const pred = await createPrediction(
      version,
      mapped as Record<string, unknown>,
    );
    const finalPred = await waitForPrediction(pred.id);
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
    const seed = extractSeed(finalPred);
    req.log?.info?.(
      { prediction_id: finalPred.id, version: finalPred.version, seed },
      "scenes.render.complete",
    );
    await updateJob({
      id: jobId,
      status: "succeeded",
      predictionId: finalPred.id,
      modelVersion: finalPred.version,
      runId: (req as any).id || undefined,
      seed: seed ?? null,
      completedAt: completedAt ? new Date(completedAt) : new Date(),
      durationMs: durationMs ?? null,
    });
    broadcastJobEvent({
      id: jobId,
      type: "scene_render",
      status: "succeeded",
      predictionId: finalPred.id,
      modelVersion: finalPred.version,
    });
    // Persist artifacts (image URLs) if present
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
      // Placeholder cost entry
      await insertCost({
        jobId,
        provider: "replicate",
        amountUsd: 0.02,
        meta: { route: "scenes.render", version: finalPred.version },
      });
    } catch (e) {
      req.log?.warn?.(e, "artifact_persist_failed");
    }
    res.json({
      id: jobId,
      run_id: (req as any).id || undefined,
      prediction_id: finalPred.id,
      model_version: finalPred.version,
      status: finalPred.status,
      started_at: startedAt,
      completed_at: completedAt,
      duration_ms: durationMs,
      seed: seed ?? null,
      output: finalPred.output,
    });
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
    const queued = await countQueuedJobs();
    if (queued >= guardrails.max_concurrency)
      return res.status(429).json({ error: "concurrency_limit" });
    const manifest = (req.body?.manifest ?? req.body) as any;
    if (!validateVideoManifest(manifest as any)) {
      return res.status(400).json({
        error: "Invalid video manifest",
        details: validateVideoManifest.errors,
      });
    }
    if (
      manifest.audio &&
      manifest.audio.mode &&
      manifest.audio.mode !== "none"
    ) {
      return res
        .status(400)
        .json({ error: "Week 1: audio must be disabled (audio.mode=none)" });
    }
    const jobId = `video_${Date.now()}`;
    await insertJob({
      id: jobId,
      type: "video_assemble",
      status: "queued",
      startedAt: new Date(),
    });
    broadcastJobEvent({ id: jobId, type: "video_assemble", status: "queued" });
    const prompt = `Create a short dynamic video with ${manifest.motion}. Transitions: ${manifest.transitions}. Scenes: ${(manifest.order || []).join(", ")}.`;
    const pred = await createPrediction(MODEL_VERSIONS["veo-3"], { prompt });
    const finalPred = await waitForPrediction(pred.id);
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
    req.log?.info?.(
      { prediction_id: finalPred.id, version: finalPred.version },
      "videos.assemble.complete",
    );
    await updateJob({
      id: jobId,
      status: "succeeded",
      predictionId: finalPred.id,
      modelVersion: finalPred.version,
      runId: (req as any).id || undefined,
      completedAt: completedAt ? new Date(completedAt) : new Date(),
      durationMs: durationMs ?? null,
    });
    broadcastJobEvent({
      id: jobId,
      type: "video_assemble",
      status: "succeeded",
      predictionId: finalPred.id,
      modelVersion: finalPred.version,
    });
    // Persist artifacts (video or image URLs) if present and cost
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
      await insertCost({
        jobId,
        provider: "replicate",
        amountUsd: 0.05,
        meta: { route: "videos.assemble", version: finalPred.version },
      });
    } catch (e) {
      req.log?.warn?.(e, "artifact_persist_failed");
    }
    res.json({
      id: jobId,
      run_id: (req as any).id || undefined,
      prediction_id: finalPred.id,
      model_version: finalPred.version,
      status: finalPred.status,
      started_at: startedAt,
      completed_at: completedAt,
      duration_ms: durationMs,
      output: finalPred.output,
    });
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

app.get("/jobs/stream", (req: Request, res: Response) => {
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
    return res.status(400).json({ error: "invalid_settings" });
  guardrails = { max_cost_per_batch_usd, max_concurrency };
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
    const { key, content, content_type } = req.body || {};
    if (!key || content === undefined)
      return res.status(400).json({ error: "key_and_content_required" });
    const s3 = createS3Client({
      endpoint: process.env.S3_ENDPOINT || "http://localhost:9000",
      region: process.env.S3_REGION || "auto",
      accessKeyId: process.env.S3_ACCESS_KEY || "",
      secretAccessKey: process.env.S3_SECRET_KEY || "",
      bucket: process.env.S3_BUCKET || "gpt5video",
      forcePathStyle: true,
    });
    await putObjectDirect(
      s3 as any,
      process.env.S3_BUCKET || "gpt5video",
      key,
      typeof content === "string" ? content : JSON.stringify(content),
      content_type || "text/plain",
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

const port = Number(process.env.PORT || 4000);
ensureTables().then(() =>
  app.listen(port, () => logger.info({ port }, "API listening")),
);
