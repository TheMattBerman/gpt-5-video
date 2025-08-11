@gpt5video/scrapecreators

Minimal adapter for ScrapeCreators used by the Hooks pipeline.

Features

- Pagination with a cursor
- Per-source rate-limit backoff with jitter
- Retries with exponential backoff
- Dedupe by platform_post_id and url

Usage

```ts
import { ScrapeCreatorsClient } from "@gpt5video/scrapecreators";

const client = new ScrapeCreatorsClient({
  apiKey: process.env.SCRAPECREATORS_API_KEY!,
});
const { items, errors, request_id, latency_ms } = await client.mine([
  { platform: "tiktok", handle: "@creator", limit: 50 },
]);
```

Notes

- This package ships a stubbed HTTP integration for local dev; replace fetchPage with real vendor calls.
- The adapter annotates items with scrape_meta.request_id and latency_ms for lineage.
