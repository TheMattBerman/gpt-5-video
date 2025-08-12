export type ScrapeCreatorsSource = {
  platform: "tiktok" | "instagram" | "youtube";
  handle: string; // or URL
  limit?: number;
  notes?: string;
};

export type ScrapeCreatorsItem = {
  platform: string;
  author: string;
  url: string;
  caption_or_transcript?: string;
  metrics?: { views?: number; likes?: number; comments?: number };
  detected_format?: string;
  scraper?: string;
  scrape_meta?: {
    request_id?: string;
    latency_ms?: number;
    page?: number;
  } & Record<string, unknown>;
  // Required for dedupe
  platform_post_id?: string;
};

export type ScrapeCreatorsOptions = {
  apiKey: string;
  baseUrl?: string;
  userAgent?: string;
  requestId?: string;
  perSourceRateLimitMs?: number; // minimal delay between pages per source
  maxRetries?: number;
};

export type MineResult = {
  items: ScrapeCreatorsItem[];
  errors: Array<{
    source: ScrapeCreatorsSource;
    category: string;
    message: string;
  }>;
  latency_ms: number;
  request_id: string;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function jitter(baseMs: number) {
  const j = Math.floor(Math.random() * Math.min(250, baseMs * 0.2));
  return baseMs + j;
}

export class ScrapeCreatorsClient {
  private readonly options: Required<
    Omit<
      ScrapeCreatorsOptions,
      | "requestId"
      | "baseUrl"
      | "userAgent"
      | "perSourceRateLimitMs"
      | "maxRetries"
    >
  > &
    Pick<
      ScrapeCreatorsOptions,
      | "requestId"
      | "baseUrl"
      | "userAgent"
      | "perSourceRateLimitMs"
      | "maxRetries"
    >;
  constructor(opts: ScrapeCreatorsOptions) {
    if (!opts.apiKey) throw new Error("ScrapeCreators API key required");
    this.options = {
      apiKey: opts.apiKey,
      baseUrl: opts.baseUrl || "https://api.scrapecreators.example", // placeholder
      userAgent: opts.userAgent || "gpt5video/0.1 (+hooks-miner)",
      requestId:
        opts.requestId || `sc_${Math.random().toString(36).slice(2, 10)}`,
      perSourceRateLimitMs:
        typeof opts.perSourceRateLimitMs === "number"
          ? opts.perSourceRateLimitMs
          : 600,
      maxRetries: typeof opts.maxRetries === "number" ? opts.maxRetries : 3,
    };
  }

  // Minimal adapter with cursor pagination, retries/backoff, and per-source delay
  async mine(sources: ScrapeCreatorsSource[]): Promise<MineResult> {
    const start = Date.now();
    const dedupe = new Set<string>(); // by platform_post_id or URL
    const items: ScrapeCreatorsItem[] = [];
    const errors: MineResult["errors"] = [];

    for (const source of sources) {
      let cursor: string | undefined = undefined;
      const max = Math.max(1, Math.min(1000, Number(source.limit || 50)));
      let collected = 0;
      let page = 0;
      // Cap pages to avoid infinite loops
      while (collected < max && page < 50) {
        page += 1;
        const pageStart = Date.now();
        try {
          const pageItems = await this.fetchPage(source, cursor);
          for (const it of pageItems.items) {
            const pid = String(it.platform_post_id || "").trim();
            const url = String(it.url || "").trim();
            const key = pid || url;
            if (!key) continue;
            if (dedupe.has(key)) continue;
            dedupe.add(key);
            items.push({
              ...it,
              scraper: it.scraper || "scrapecreators",
              scrape_meta: {
                ...it.scrape_meta,
                request_id: this.options.requestId,
                latency_ms: Date.now() - pageStart,
                page,
              },
            });
            collected += 1;
            if (collected >= max) break;
          }
          cursor = pageItems.next_cursor;
          if (!cursor) break; // no more pages
          await sleep(jitter(this.options.perSourceRateLimitMs || 600));
        } catch (err: any) {
          const cat = categorizeError(err);
          errors.push({
            source,
            category: cat,
            message: String(err?.message || err),
          });
          // retry/backoff then continue to next page if cursor exists
          await sleep(jitter(500 * Math.min(page, 5)));
          if (!cursor) break; // nothing to continue
        }
      }
    }

    return {
      items,
      errors,
      latency_ms: Date.now() - start,
      request_id:
        this.options.requestId ||
        `sc_${Math.random().toString(36).slice(2, 10)}`,
    };
  }

  private async fetchPage(
    source: ScrapeCreatorsSource,
    cursor?: string,
  ): Promise<{ items: ScrapeCreatorsItem[]; next_cursor?: string }> {
    // If no real API key provided, return stubbed sample data
    if (!this.options.apiKey || this.options.apiKey === "dev") {
      const sample: ScrapeCreatorsItem[] = Array.from({ length: 5 }).map(
        (_, i) => {
          const idx = (cursor ? Number(cursor) : 0) * 5 + i + 1;
          return {
            platform: source.platform,
            author: source.handle.startsWith("@") ? source.handle : "@creator",
            url: `https://example.com/${source.platform}/${encodeURIComponent(source.handle)}/${idx}`,
            caption_or_transcript: `Sample caption ${idx}`,
            metrics: {
              views: Math.floor(Math.random() * 100000),
              likes: Math.floor(Math.random() * 1000),
              comments: Math.floor(Math.random() * 100),
            },
            detected_format: "pattern_interrupt",
            platform_post_id: `${source.platform}_${encodeURIComponent(source.handle)}_${idx}`,
          };
        },
      );
      const next = cursor ? undefined : "1";
      return new Promise((resolve) =>
        setTimeout(() => resolve({ items: sample, next_cursor: next }), 200),
      );
    }

    // Real integration: call ScrapeCreators HTTP API
    const base = this.options.baseUrl?.replace(/\/$/, "");
    const url = new URL(`${base}/v1/mine`);
    url.searchParams.set("platform", source.platform);
    url.searchParams.set(
      "handle",
      source.handle.startsWith("@") ? source.handle.slice(1) : source.handle,
    );
    url.searchParams.set("limit", String(Math.max(1, source.limit || 50)));
    if (cursor) url.searchParams.set("cursor", cursor);

    const resp = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,
        "User-Agent": this.options.userAgent || "gpt5video/0.1 (+hooks-miner)",
      },
    });
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`scrapecreators_failed ${resp.status} ${body}`);
    }
    const data = (await resp.json()) as {
      items: any[];
      next_cursor?: string;
    };
    const mapped: ScrapeCreatorsItem[] = (data.items || []).map((it: any) => ({
      platform: String(it.platform || source.platform),
      author: String(it.author || it.handle || source.handle),
      url: String(it.url || it.permalink || ""),
      caption_or_transcript: String(
        it.caption || it.transcript || it.text || "",
      ),
      metrics: it.metrics || undefined,
      detected_format: String(it.detected_format || it.format || ""),
      scraper: "scrapecreators",
      scrape_meta: {
        request_id: this.options.requestId,
        latency_ms: 0,
      },
      platform_post_id: String(
        it.platform_post_id || it.post_id || it.id || "",
      ),
    }));
    return { items: mapped, next_cursor: data.next_cursor };
  }
}

function categorizeError(err: unknown) {
  const msg = String((err as any)?.message || err || "");
  if (/rate limit|429/i.test(msg)) return "rate_limit";
  if (/timeout/i.test(msg)) return "timeout";
  if (/network|ENOTFOUND|ECONN|fetch failed/i.test(msg)) return "network";
  return "api_error";
}

// ---------- Direct TikTok endpoints (v3 profile videos, v1 transcript) ----------

async function fetchJson<T>(
  url: string,
  init: RequestInit,
  timeoutMs = 15000,
): Promise<T> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ac.signal });
    if (!res.ok) {
      let body: any = await res.text().catch(() => "");
      try {
        body = JSON.parse(body);
      } catch {}
      const details = typeof body === "string" ? body : JSON.stringify(body);
      throw new Error(`HTTP ${res.status} ${res.statusText}: ${details}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

function buildUrl(base: string, path: string, params: Record<string, unknown>) {
  const url = new URL(
    path.replace(/^\//, ""),
    base.endsWith("/") ? base : base + "/",
  );
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    url.searchParams.set(k, String(v));
  }
  return url.toString();
}

export async function scGetTiktokProfileVideos(opts: {
  apiKey: string;
  handle?: string;
  user_id?: string;
  amount?: number;
  trim?: boolean;
  baseUrl?: string;
}): Promise<any[]> {
  const {
    apiKey,
    handle,
    user_id,
    amount,
    trim,
    baseUrl = "https://api.scrapecreators.com",
  } = opts;
  if (!apiKey) throw new Error("apiKey required");
  if (!handle && !user_id) throw new Error("handle or user_id is required");
  const url = buildUrl(baseUrl, "/v3/tiktok/profile-videos", {
    handle,
    user_id,
    amount,
    trim,
  });
  const data = await fetchJson<any[]>(url, {
    method: "GET",
    headers: { "x-api-key": apiKey, Accept: "application/json" },
  });
  return Array.isArray(data) ? data : [];
}

export async function scGetTiktokTranscript(opts: {
  apiKey: string;
  videoUrl: string;
  language?: string;
  baseUrl?: string;
}): Promise<{ id: string; url: string; transcript: string }> {
  const {
    apiKey,
    videoUrl,
    language,
    baseUrl = "https://api.scrapecreators.com",
  } = opts;
  if (!apiKey) throw new Error("apiKey required");
  if (!videoUrl) throw new Error("videoUrl required");
  const url = buildUrl(baseUrl, "/v1/tiktok/video/transcript", {
    url: videoUrl,
    language,
  });
  return fetchJson(url, {
    method: "GET",
    headers: { "x-api-key": apiKey, Accept: "application/json" },
  });
}

// GET /v2/tiktok/video — full video info (optionally transcript, trim)
export type ScTiktokVideoInfo = {
  aweme_detail?: any;
  transcript?: string;
  status_code?: number;
  status_msg?: string;
  [k: string]: unknown;
};

export async function scGetTiktokVideo(opts: {
  apiKey: string;
  url: string; // TikTok video URL
  get_transcript?: boolean;
  trim?: boolean;
  baseUrl?: string;
}): Promise<ScTiktokVideoInfo> {
  const {
    apiKey,
    url: videoUrl,
    get_transcript,
    trim,
    baseUrl = "https://api.scrapecreators.com",
  } = opts;
  if (!apiKey) throw new Error("apiKey required");
  if (!videoUrl) throw new Error("url required");
  const url = buildUrl(baseUrl, "/v2/tiktok/video", {
    url: videoUrl,
    get_transcript,
    trim,
  });
  return fetchJson<ScTiktokVideoInfo>(url, {
    method: "GET",
    headers: { "x-api-key": apiKey, Accept: "application/json" },
  });
}
