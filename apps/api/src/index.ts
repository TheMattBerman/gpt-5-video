import "dotenv/config";
import express, { Request, Response } from "express";
import cors from "cors";
import pino from "pino";
import pinoHttp from "pino-http";
import { randomUUID } from "crypto";
import { ajv } from "@gpt5video/shared";
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
    }
  })
);

app.get("/health", (_req: Request, res: Response) => res.json({ ok: true }));

// Stubs for Week 1 endpoints (schema validation to be added next)
const validateBrand = ajv.compile(brandProfileSchema as any);
const validateSceneSpec = ajv.compile(sceneSpecSchema as any);
const validateVideoManifest = ajv.compile(videoManifestSchema as any);

app.post("/ingest/brand", (req: Request, res: Response) => {
  if (!validateBrand(req.body)) {
    return res.status(400).json({ error: "Invalid brand_profile", details: validateBrand.errors });
  }
  res.json({ id: `brand_${Date.now()}`, data: req.body });
});

app.post("/hooks/mine", (req: Request, res: Response) => {
  res.json({ id: `corpus_${Date.now()}`, seed: req.body });
});

app.post("/hooks/synthesize", (req: Request, res: Response) => {
  res.json({ id: `hookset_${Date.now()}`, seed: req.body });
});

app.post("/character/profile", (req: Request, res: Response) => {
  res.json({ id: `character_${Date.now()}`, data: req.body });
});

app.post("/scenes/plan", (req: Request, res: Response) => {
  const data = req.body;
  const items = Array.isArray(data) ? data : [data];
  for (const item of items) {
    if (!validateSceneSpec(item)) {
      return res.status(400).json({ error: "Invalid scene spec", details: validateSceneSpec.errors });
    }
  }
  res.json({ id: `scenespecs_${Date.now()}`, data });
});

const MODEL_VERSIONS: Record<string, string> = {
  "ideogram-character": "ideogram-ai/ideogram-character",
  "imagen-4": "google/imagen-4",
  "veo-3": "google/veo-3"
};

async function createPrediction(version: string, input: Record<string, unknown>) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error("Missing REPLICATE_API_TOKEN");
  const res = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ version, input })
  });
  if (!res.ok) throw new Error(`Replicate create failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as { id: string };
}

async function getPrediction(id: string) {
  const token = process.env.REPLICATE_API_TOKEN;
  const res = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error(`Replicate get failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as any;
}

async function waitForPrediction(id: string, pollMs = 2000, timeoutMs = 10 * 60 * 1000) {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const pred = await getPrediction(id);
    if (["succeeded", "failed", "cancelled"].includes(pred.status)) return pred;
    if (Date.now() - start > timeoutMs) throw new Error("Replicate wait timeout");
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

app.post("/scenes/render", async (req: Request, res: Response) => {
  try {
    const scene = (req.body?.scene ?? req.body) as any;
    if (!validateSceneSpec(scene)) {
      return res.status(400).json({ error: "Invalid scene spec", details: validateSceneSpec.errors });
    }
    const modelKey = String((scene as any).model ?? "");
    const version = MODEL_VERSIONS[modelKey];
    if (!version) return res.status(400).json({ error: `Unsupported model: ${String((scene as any).model)}` });

    const pred = await createPrediction(version, (scene as any).model_inputs as Record<string, unknown>);
    const finalPred = await waitForPrediction(pred.id);
    res.json({ id: `sceneimages_${Date.now()}`, prediction: finalPred });
  } catch (err) {
    req.log?.error?.(err);
    res.status(500).json({ error: "render_failed" });
  }
});

app.post("/videos/assemble", async (req: Request, res: Response) => {
  try {
    const manifest = (req.body?.manifest ?? req.body) as any;
    if (!validateVideoManifest(manifest as any)) {
      return res.status(400).json({ error: "Invalid video manifest", details: validateVideoManifest.errors });
    }
    if (manifest.audio && manifest.audio.mode && manifest.audio.mode !== "none") {
      return res.status(400).json({ error: "Week 1: audio must be disabled (audio.mode=none)" });
    }
    const prompt = `Create a short dynamic video with ${manifest.motion}. Transitions: ${manifest.transitions}. Scenes: ${(manifest.order || []).join(", ")}.`;
    const pred = await createPrediction(MODEL_VERSIONS["veo-3"], { prompt });
    const finalPred = await waitForPrediction(pred.id);
    res.json({ id: `video_${Date.now()}`, prediction: finalPred });
  } catch (err) {
    req.log?.error?.(err);
    res.status(500).json({ error: "video_assemble_failed" });
  }
});

app.get("/jobs/stream", (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  const interval = setInterval(() => {
    res.write(`event: ping\n`);
    res.write(`data: {"ts": ${Date.now()}}\n\n`);
  }, 3000);
  req.on("close", () => clearInterval(interval));
});

const port = Number(process.env.PORT || 4000);
app.listen(port, () => logger.info({ port }, "API listening"));


