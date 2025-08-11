export type ReplicatePrediction<
  TInput extends Record<string, unknown> = Record<string, unknown>,
> = {
  id: string;
  version: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "cancelled";
  input: TInput;
  output?: unknown;
  error?: string;
  logs?: string;
  started_at?: string;
  completed_at?: string;
};

export class ReplicateClient {
  private readonly baseUrl = "https://api.replicate.com/v1";
  constructor(private readonly apiToken: string) {
    if (!apiToken) throw new Error("Missing REPLICATE_API_TOKEN");
  }

  async createPrediction<TInput extends Record<string, unknown>>(
    version: string,
    input: TInput,
  ) {
    const res = await fetch(`${this.baseUrl}/predictions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ version, input }),
    });
    if (!res.ok)
      throw new Error(
        `Replicate create failed: ${res.status} ${await res.text()}`,
      );
    const data = (await res.json()) as ReplicatePrediction<TInput>;
    return data;
  }

  async getPrediction<TInput extends Record<string, unknown>>(id: string) {
    const res = await fetch(`${this.baseUrl}/predictions/${id}`, {
      headers: { Authorization: `Bearer ${this.apiToken}` },
    });
    if (!res.ok)
      throw new Error(
        `Replicate get failed: ${res.status} ${await res.text()}`,
      );
    const data = (await res.json()) as ReplicatePrediction<TInput>;
    return data;
  }

  async waitForPrediction<TInput extends Record<string, unknown>>(
    id: string,
    pollMs = 2000,
    timeoutMs = 10 * 60 * 1000,
  ) {
    const start = Date.now();
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const pred = await this.getPrediction<TInput>(id);
      if (
        pred.status === "succeeded" ||
        pred.status === "failed" ||
        pred.status === "cancelled"
      )
        return pred;
      if (Date.now() - start > timeoutMs)
        throw new Error("Replicate wait timeout");
      await new Promise((r) => setTimeout(r, pollMs));
    }
  }

  // Convenience helpers for common models (version strings can be overridden by caller if needed)
  static defaultVersions = {
    // Pinned versions for reproducibility
    // NOTE: Replace these with stable, known-good version IDs before prod.
    // As of dev, we keep placeholders but non-garbage format to avoid build breaks.
    ideogramCharacter: "ideogram-ai/ideogram-character@b7e4c4c1a1f2",
    imagen4: "google/imagen-4@9a0f0e0d1c2b",
    veo3: "google/veo-3@7f1a2b3c4d5e",
  } as const;

  async runIdeogramCharacter(
    input: Record<string, unknown>,
    version = ReplicateClient.defaultVersions.ideogramCharacter,
  ) {
    const pred = await this.createPrediction(version, input);
    return this.waitForPrediction(pred.id);
  }

  async runVeo3(
    input: Record<string, unknown>,
    version = ReplicateClient.defaultVersions.veo3,
  ) {
    const pred = await this.createPrediction(version, input);
    return this.waitForPrediction(pred.id);
  }
}

// Helpers to extract common metadata consistently
export function extractSeedFromOutput(
  pred: ReplicatePrediction,
): number | undefined {
  const out = pred?.output as any;
  if (!out) return undefined;
  if (Array.isArray(out)) {
    for (const item of out) {
      if (item && typeof item === "object" && typeof item.seed === "number")
        return item.seed;
    }
  } else if (typeof out === "object" && out && typeof out.seed === "number") {
    return out.seed;
  }
  return undefined;
}

export function getPredictionSurface<TInput extends Record<string, unknown>>(
  pred: ReplicatePrediction<TInput>,
) {
  return {
    id: pred.id,
    version: pred.version,
    status: pred.status,
    startedAt: pred.started_at,
    completedAt: pred.completed_at,
    seed: extractSeedFromOutput(pred),
    output: pred.output,
    error: pred.error,
  } as const;
}
