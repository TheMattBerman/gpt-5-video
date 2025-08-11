# Build Plan: All-Replicate Content Engine (MVP)

Source: `prd.md` — Deliver an operator-driven pipeline: Hooks → Scenes → Video with optional audio using Replicate models (Ideogram Character, Imagen 4, Veo 3).

Status legend: [ ] not started, [~] in progress, [x] done, [!] blocked

## Milestones (3-week MVP)

### Week 1 — Foundations and first renders

- [~] Repo and project scaffolding (monorepo ready)
  - [x] Structure: `apps/api`, `apps/gui`, `packages/schemas`, `packages/clients`, `packages/shared`, `infra/`
  - [~] Tooling: TypeScript, ESLint/Prettier
  - [x] Husky + lint-staged
  - [x] Husky pre-commit for typecheck + lint
  - [~] Env: examples added as markdown (`apps/api/ENV_EXAMPLE.md`, `apps/gui/ENV_LOCAL_EXAMPLE.md`)
  - [x] CI: PR checks (typecheck, lint, build), trunk-based strategy
- [~] Data contracts (JSON Schemas)
  - [x] `brand_profile.schema.json`
  - [x] `hook_corpus_line.schema.json`
  - [x] `hook_set_line.schema.json`
  - [x] `character_profile.schema.json`
  - [x] `scene_specs_line.schema.json`
  - [x] `scene_images_line.schema.json`
  - [x] `video_manifest.schema.json` (audio.mode: none|voiceover|dialogue + conditional required fields)
- [~] Shared Types and Validators
  - [~] Generate TS types from schemas; package export in `packages/schemas` (generator wired)
  - [x] Runtime validation helpers (ajv) in `packages/shared`
- [~] Orchestrator API (minimal viable endpoints)
  - [x] POST `/ingest/brand` (schema validated)
  - [x] POST `/hooks/mine` (stub returns) and `/hooks/synthesize` (stub)
  - [x] POST `/scenes/plan` (schema validated for array or single item)
  - [x] POST `/scenes/render` (Replicate call; response includes prediction_id, model_version, seed, duration; persisted)
  - [x] POST `/videos/assemble` (Replicate call; audio.mode=none enforced; response includes prediction_id, model_version, duration; persisted)
  - [x] SSE `/jobs/stream` (ping event)
  - [~] Request/response validation, correlation IDs, structured logs (pinoHttp with req ids; schemas enforced on key routes; responses include run_id)
  - [x] GET `/jobs/recent` and GET `/kpis/today` (DB-backed)
  - [x] Persist artifacts for renders and videos (DB-backed; GUI previews)
  - [x] Cost ledger writes on render/assemble jobs (placeholder estimates)
  - [x] SSE `/jobs/stream` emits job updates (not just ping)
- [ ] Replicate client wrapper in `packages/clients/replicate`
  - [x] Prediction lifecycle, polling, error surface, seeds/model version capture
  - [ ] First model: Ideogram Character image render
  - [ ] Veo 3 video draft from manifest (images only; audio.mode="none")
- [ ] Minimal storage + object hosting
  - [x] Postgres via docker-compose
  - [x] S3-compatible dev (MinIO) + signed URL helper
  - [x] Asset registry tables (artifacts, costs, seeds, model versions)
- [~] Operator GUI — Phase 1
  - [x] Next.js app shell with Tailwind, React Query, SSE client
  - [x] SSE client basic page wiring to `/jobs/stream`
  - [x] Dashboard tiles + recent assets table (session) + nav links to Brand/Hooks
  - [x] Dashboard KPIs: In-progress, Failures (today), Avg render time (ms), Spend today (placeholder)
  - [x] Dashboard consumes SSE job events (minimal refresh)
  - [x] Brand Ingest wizard with schema validation
  - [x] Hooks page placeholder
  - [x] Hooks UI minimal forms with JSON checks; show API stub responses
  - [x] Scenes Plan UI with schema validation (submit to `/scenes/plan`)
  - [x] Renders page: grid from server `/jobs/recent` with seed/model_version/duration and previews
  - [x] Dashboard spend tile uses server KPIs only; shows unavailable state when missing
  - [x] Toast notifications for success and errors in Scenes/Video pages
  - [x] Preset button to insert Ideogram Character example in Scenes Plan/Render

  Impact: Jobs persisted in Postgres; Dashboard KPIs switch to server source with fallback; Renders page added; Hooks forms validate JSON and call API stubs; builds remain green.

Acceptance (Week 1)

- [ ] Can ingest a brand profile, plan 1–2 scenes (schema-checked), render at least 1 image and 1 video draft (no audio), with seeds/version IDs stored and visible in GUI.

### Week 2 — Planning, synthesis, images, and review

- [~] Hook mining and synthesis
  - [x] ScrapeCreators adapter with rate limits, pagination, retries, dedupe
  - [x] Clustering/synthesis endpoint implemented with heuristic clustering, SSE steps (clustering → generating → persist → completed), lineage persisted, filters (approved, icp), server sort
  - [x] Corpus and synthesized hooks persisted with lineage
- [~] Character & Scenes
  - [x] Character upload + profile persist; stability test (3 prompts) API; GUI compare and local seed lock
  - [x] Scenes page: Monaco JSON editor with schema autocomplete and diff
  - [x] Audio panel per scene (dialogue or VO fields present)
- [x] Renders workflow
- [~] Scene image generation queue; grid view with compare (DB-backed queue + in-process worker added; SSE reflects status); cancel for queued jobs; batch queue action to queue 15 renders
- [x] Approve/reject, re-run with same/new seed
- [x] Cost meter (estimate + actual) for images
- [~] Telemetry & reliability
  - [x] Cost ledger for GPT + Replicate per asset (GPT placeholder added for synth; provider splits and run meta captured)
  - [x] Retry/backoff with jitter, error categorization, idempotency keys; KPIs include processing vs queued and avg queue wait
  - [x] Added avg cost per render today metric (Dashboard tile)

Acceptance (Week 2)

- [ ] 5+ hooks, 15+ images produced; stability verified across 3 prompts; cost and seeds visible; JSON editor blocks invalid fields.

### Week 3 — Videos, audio modes, export, and hardening

- [ ] Videos assembly with audio controls
- [ ] Manifest builder (drag scenes, transitions, motion)
- [x] Manifest builder increment: simple Up/Down reorder controls for `order`
- [x] Audio tab: mode selector (none|voiceover|dialogue), style, pace, language, volume
- [x] Veo 3 voiceover support (audio.mode=voiceover; require vo_prompt) — API accepts audio modes per schema; SSE steps visible
- [x] Dialogue mode support with `dialogue_timing` mapping — API accepts and validates; GUI form supports timing fields
- [x] Status and cost badges on Video Assemble via job detail polling (estimate + actual)
- [ ] 720p/1080p preview with transport controls and thumbnails
- [x] SSE UI: Scenes Render/Video Assemble show step feed + attempt_count; Renders shows latest step
- [ ] Review & Export
- [~] Checklist: tone/claims/assets (stub page added)
- [~] Export presets: 9:16, 1:1, 16:9; S3 handoff or download (stubs + S3 preview wired)
- [x] CSV report (costs + basic performance placeholders)
- [ ] Security & access
  - [ ] JWT auth with roles; signed URLs for uploads/downloads
  - [x] Guardrails: max cost per batch, concurrency caps (numeric range validation; optimistic UI updates; dashboard reflects changes without reload)
- [ ] Observability and QA
  - [ ] Logs/metrics/traces; alerting on error spikes
  - [ ] E2E happy-path test; seed-lock rerun test; failure recovery test

Acceptance (Week 3)

- [ ] 5 video drafts created with audio in both voiceover and dialogue modes when enabled; export flows work; GUI reflects job state changes within 3s.

---

## Detailed Task Breakdown

### 1) Repo, Infra, and Tooling

- [ ] Initialize monorepo (pnpm or npm workspaces)
- [ ] `infra/docker-compose.yml` for Postgres + MinIO
- [ ] GitHub Actions: typecheck, lint, build, basic tests
- [ ] Conventional commits + semantic release (optional)

### 2) Schemas and Types (`packages/schemas`, `packages/shared`)

- [ ] Author JSON Schemas per PRD (section 7, 17)
- [ ] Add enums and conditional requirements (audio.mode logic)
- [ ] Generate and export TS types
- [ ] Validation middleware for API

### 3) Orchestrator API (`apps/api`)

- [ ] Fastify/Express setup with pino logs and request IDs
- [ ] Routes:
  - [ ] `/ingest/brand`
  - [ ] `/hooks/mine`
  - [ ] `/hooks/synthesize`
  - [ ] `/character/profile`
  - [ ] `/scenes/plan`
  - [ ] `/scenes/render`
  - [ ] `/videos/assemble`
  - [ ] `/jobs/stream` (SSE)
- [ ] Cost ledger tables and middleware
- [ ] Circuit breakers/backoff policies for external calls

### 4) External Clients (`packages/clients`)

- [ ] Replicate wrapper: predictions, polling, seeds/model version capture
- [ ] ScrapeCreators adapter: pagination, rate-limit, retries, dedupe
- [ ] S3 client: signed URL generation

Notes:

- [~] Replicate default model versions parameterized; placeholders replaced with env-overridable pinned IDs. Final stable IDs to be set in env for prod.
  - [x] Warn once when default placeholder versions are used (no env overrides)

### 5) Workers

- [ ] Image render worker for Ideogram Character
- [ ] Video assembly worker for Veo 3 (audio: none → voiceover → dialogue)
- [ ] Job queue (BullMQ or simple DB queue) + status pub via SSE

### 6) Operator GUI (`apps/gui`)

- [ ] App shell with auth, nav, and theming
- [ ] Dashboard: KPI tiles + recent assets table (live)
- [ ] Brand Ingest: wizard with live schema validation
- [x] Hooks: source setup, mining progress, corpus table, synthesis review
- [x] Character: upload, model, aspect ratio, mask rules, stability test, seed lock
- [x] Scenes: Monaco editor with schema autocomplete + diff; audio panel
- [x] Renders: grid, compare, approve/reject, re-run with seed controls
- [~] Videos: manifest builder; audio tab; render + preview player
  - [x] Manifest builder stub UI populates JSON; validation and submit (audio disabled)
- [ ] Review & Export: checklist, presets, S3/download, CSV report

### 7) Security, Telemetry, and QA

- [ ] JWT auth with roles; scoped APIs
- [ ] Signed URLs for upload/download; secrets in vault
- [ ] Structured logs, metrics, traces; alerts on error spikes
- [ ] E2E tests covering MVP acceptance criteria

---

## Decisions to Confirm (early)

- [ ] Runtime: Node/TypeScript for services and GUI (aligns with Next.js)
- [ ] Queue: BullMQ (Redis) vs DB-backed job table; start with DB for simplicity
- [ ] Validation: Ajv + JSON Schema as source of truth; types generated to TS
- [ ] Storage: MinIO locally; AWS S3 in prod

---

## Definition of Done (MVP)

- End-to-end batch produces ≥5 hooks, ≥15 images, and ≥5 video drafts
- Each asset has seeds, model version IDs, manifest, and cost entries
- Operator can approve, edit JSON, re-run, and export assets
- Audio modes work (voiceover and dialogue) when enabled
- Dashboard updates reflect job state changes within 3 seconds

---

## Working Agreements

- Keep this `to-do.md` updated in every PR touching roadmap areas
- Use clear, scoped PRs; reference tasks with checklist updates
- Prefer schema-first development (APIs and GUI validate against schemas)
