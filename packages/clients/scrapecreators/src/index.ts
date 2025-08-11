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
    // For MVP: this adapter is a stub that simulates fetch results.
    // Replace with real HTTP integration if vendor docs are available.
    // We simulate 5 items per page and 2 pages.
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
    const next = cursor ? undefined : "1"; // two pages: undefined means last
    return new Promise((resolve) =>
      setTimeout(() => resolve({ items: sample, next_cursor: next }), 200),
    );
  }
}

function categorizeError(err: unknown) {
  const msg = String((err as any)?.message || err || "");
  if (/rate limit|429/i.test(msg)) return "rate_limit";
  if (/timeout/i.test(msg)) return "timeout";
  if (/network|ENOTFOUND|ECONN|fetch failed/i.test(msg)) return "network";
  return "api_error";
}
