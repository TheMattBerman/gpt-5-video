# API .env example

Copy these into `apps/api/.env` and fill in secrets.

```ini
# Server
PORT=4000
LOG_LEVEL=info

# Replicate (required for /scenes/render and /videos/assemble)
REPLICATE_API_TOKEN=
# Model versions (override defaults)
REPLICATE_IDEOGRAM_CHARACTER_VERSION=
REPLICATE_IMAGEN4_VERSION=
REPLICATE_VEO3_VERSION=
REPLICATE_PADDLEOCR_VERSION=

# OpenAI (LLM synth)
OPENAI_API_KEY=
OPENAI_LLM_MODEL=gpt-5

# ScrapeCreators (optional, Week 2+)
SCRAPECREATORS_API_KEY=

# Postgres (docker-compose default)
POSTGRES_URL=postgres://postgres:postgres@localhost:5432/gpt5video

# MinIO / S3 (docker-compose defaults)
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_REGION=us-east-1
S3_BUCKET=gpt5video
# Public dev access URL (for constructing display links if needed)
PUBLIC_ASSET_BASE=
```

Cloudflare R2 (dev) example

```ini
# Override MinIO with R2
S3_ENDPOINT=https://d44adae75a37403b2a91d867491c2a95.r2.cloudflarestorage.com
S3_REGION=auto
S3_ACCESS_KEY=c63bc51dbb7447fab1a275173461f3b5
S3_SECRET_KEY=1a397744ded96a3397fa8990492c97dcbc3d122ad1c78a123d9ca8b77febc527
S3_BUCKET=gpt-video
# Public dev access URL (for constructing display links if needed)
PUBLIC_ASSET_BASE=https://pub-6368b8cc613f4f3e865e13428136c41f.r2.dev
```

Notes

- Start infra first: `docker compose -f infra/docker-compose.yml up -d` (if using MinIO).
- Create the bucket in your storage provider (MinIO: `gpt5video`, R2: `gpt-video`).
