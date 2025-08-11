### Phase 1 MVP Test Plan

#### 0) Prereqs and setup

- Install deps
  - In repo root: `npm install`
- Start infra
  - `docker compose -f infra/docker-compose.yml up -d`
  - MinIO: create bucket `gpt5video` (http://localhost:9001, user/pass: minioadmin)
- Configure API
  - Copy `apps/api/ENV_EXAMPLE.md` to `apps/api/.env`
  - Set `REPLICATE_API_TOKEN` (required for renders/videos)
  - Confirm Postgres and S3 settings target local docker
- Configure GUI
  - Copy `apps/gui/ENV_LOCAL_EXAMPLE.md` to `apps/gui/.env.local`
  - Optional: set `NEXT_PUBLIC_ASSET_BASE` if using a public bucket
- Run apps
  - API: `npm run -w apps/api dev` (port 4000)
  - GUI: `npm run -w apps/gui dev` (port 3000)

#### 1) API health

- Open `http://localhost:4000/health` → expect `{ ok: true }`.

#### 2) Dashboard smoke (SSE + tiles)

- Open `http://localhost:3000`
- SSE status shows “connecting…” then updates with ping JSON.
- Tiles
  - API tile: “ok”
  - KPIs (In-progress, Failures, Avg render time, Spend today) show numbers or “--” if server unavailable.

#### 3) Upload and asset preview (MinIO/R2)

- In Dashboard “Upload to R2 (dev)”:
  - Choose a small image; keep prefix `dev/`; click Upload
  - Expect “Uploaded ✅”; Preview displays
  - Recent assets table shows the new object
- Verify via API listing:
  - `GET http://localhost:4000/assets?prefix=dev/&limit=50` → shows object with optional `preview_url`

#### 4) Hooks page (stubs + basic validation)

- Open Hooks page
  - “Recent assets” table should list the `dev/` object
- “Mine Hooks (POST /hooks/mine)”
  - Valid body example:
    ```json
    { "sources": [{ "platform": "tiktok", "handle": "@creator" }] }
    ```
  - Click Send → expect { ok: true, id: hooks*mine*... } in response, success toast, and an in-session job added
- “Synthesize Hooks (POST /hooks/synthesize)”
  - Valid body example:
    ```json
    { "corpus_id": "corpus_1", "icp": "DTC operators" }
    ```
  - Click Send → expect { ok: true, id: hooks*synthesize*... } and toast

#### 5) Brand Ingest (schema validation)

- Open Brand page
  - Paste valid example; expect “Valid ✔︎”
  - Submit → expect ID response and success
  - Try an invalid JSON (e.g., remove `brand_id`) → expect validation errors and 400 on submit

Example:

```json
{
  "brand_id": "noteworthy-spirits",
  "voice": { "principles": ["energetic"], "banned_phrases": ["hangover-free"] },
  "icp_segments": [
    {
      "name": "DTC operators",
      "pains": ["rising CAC"],
      "gains": ["faster testing"]
    }
  ],
  "proof": ["3M impressions in 14 days"],
  "legal_constraints": ["no medical claims"],
  "objectives": ["lead gen"],
  "done_criteria": ["5 hooks ship with approved scenes and video drafts"]
}
```

#### 6) Scenes Plan (schema validation; single and array)

- Open Scenes Plan
  - Use “Insert Ideogram preset” if available; else example:
    ```json
    {
      "scene_id": "hook1_s1",
      "duration_s": 2.0,
      "composition": "tight mid on mascot, text plate right",
      "props": ["phone", "chart"],
      "overlays": [{ "type": "lower_third", "text": "Fix your loop" }],
      "model": "ideogram-character",
      "model_inputs": {
        "prompt": "mascot in startup office, confident expression",
        "character_reference_image": "https://example.com/mascot.png",
        "aspect_ratio": "9:16",
        "rendering_speed": "Default"
      }
    }
    ```
  - Validate → “Valid ✔︎”; Submit → expect ID response and success toast
  - Try an array of the same spec → also accepted
  - Introduce an invalid field (e.g., unknown `foo`) → validation errors and 400 on submit

#### 7) Scenes Render (Replicate call; artifacts + seed + duration)

- Pre-req: `REPLICATE_API_TOKEN` set; network access to Replicate
- Open Scenes Render
  - Use valid Ideogram example (Insert preset)
  - Click Render → response shows:
    - prediction_id, model_version, status, duration_ms, optional seed
  - Toast indicates success
- Renders page
  - Should show a new job card with metadata and any output previews
- DB
  - Confirm the job, artifacts, and placeholder cost rows exist:
    - `jobs` row with prediction_id, model_version, seed, duration_ms
    - `artifacts` rows for any output URLs (image/video)
    - `cost_ledger` row with provider “replicate”
- Error checks
  - Remove `character_reference_image` → expect 400 with validation errors
  - Unset `REPLICATE_API_TOKEN` and render → expect 500; GUI shows error toast

#### 8) Video Assemble (audio disabled in Week 1)

- Open Video Assemble
  - Valid manifest:
    ```json
    {
      "order": ["hook1_s1", "hook1_s2"],
      "transitions": "hard_cuts",
      "motion": "subtle parallax",
      "audio": { "mode": "none" }
    }
    ```
  - Click Assemble → response shows prediction_id, model_version, duration_ms; success toast
  - Renders page → job shows with metadata and any output previews
- Guardrail
  - Set `audio.mode` to `voiceover` (keep `vo_prompt` present) → expect 400: “audio must be disabled”

#### 9) Dashboard KPIs and SSE

- SSE status shows periodic `ping`
- Perform two renders and one assemble:
  - In-progress increases while calls run; Failures increase on forced error; Avg render time moves above 0; Spend shows a number if costs posted today
- Tiles reflect server KPIs (if server returns OK). If server temporarily unavailable, tiles show “--” in a yellow tile.

#### 10) SSE job stream (manual)

- Open in terminal:
  - `curl -N http://localhost:4000/jobs/stream | sed -n '1,10p'`
  - Expect `event: ping` and `event: job` lines when jobs are created/updated

#### 11) Storage endpoints

- Presign and upload test:
  - POST `http://localhost:4000/uploads/sign` with `{ "key": "dev/test.txt", "content_type": "text/plain" }`
  - PUT a short text body to returned URL
  - GET `http://localhost:4000/uploads/debug-get?key=dev/test.txt` → verify presigned read or public URL
- Listing
  - GET `/assets?prefix=dev/&limit=10` → verify recent objects

#### 12) Renders page (auto-refresh via SSE)

- Keep Renders page open and trigger a new render
- Without manual refresh, the grid should update within a few seconds

#### 13) Database verification (optional)

- Connect to Postgres (localhost:5432, postgres/postgres, db `gpt5video`)
- Verify:
  - `select * from jobs order by created_at desc limit 5;`
  - `select * from artifacts order by created_at desc limit 5;`
  - `select * from cost_ledger order by created_at desc limit 5;`

#### 14) Acceptance mapping (Week 1)

- Brand accepted (schema-checked)
- Scenes planned (single and array; validation enforced)
- At least 1 image render and 1 video draft produced (no audio)
- Seeds, model versions, duration visible in GUI and DB
- Renders visible in GUI; SSE job updates observable
- Spend tile shows server KPI or “--” when unavailable

#### 15) Troubleshooting

- API 500 on render/assemble
  - Check `REPLICATE_API_TOKEN` in `apps/api/.env`; restart API
- No artifacts showing
  - Some models return non-URL outputs; verify response `output` contains URLs; check DB `artifacts` table
- MinIO upload fails
  - Ensure bucket `gpt5video` exists; recheck `S3_*` envs in API `.env`
- GUI tiles show “--”
  - Check `GET /kpis/today`; if server down, restart API; otherwise OK to show unavailable

#### 16) For upcoming features (when merged)

- Character page
  - Upload 1–N images, preview; submit schema-validated profile; toast success/error
- Scenes (Monaco)
  - Editor renders; Format JSON; insert preset; validate errors list; POST `/scenes/plan`; toast feedback
- Hooks source form
  - Add sources with platform + handle; client validation; localStorage persists; “Mine Hooks” submits; toast feedback

#### 17) Close-out

- Update `to-do.md` checkboxes that match completed items
- Log any issues with repro steps and console/log snippets
