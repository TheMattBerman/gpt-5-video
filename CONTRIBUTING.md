# Contributing to GPT-5 Video

Thanks for your interest in contributing!

## Project rules to follow

- Align work to `prd.md` and keep `to-do.md` as the single source of truth.
- Schema-first: update JSON Schemas in `packages/schemas`, regenerate types, and validate API requests/responses.
- Persist and surface seeds, model versions, run IDs, durations, and costs for each asset.
- Enforce audio mode rules: `none`, `voiceover` (require `vo_prompt`), `dialogue` (require `dialogue_timing`).
- Keep builds green (typecheck, lint, test) before merging.

## Getting started

1. Install dependencies:
   ```bash
   npm install
   ```
2. Build all workspaces:
   ```bash
   npm run build
   ```
3. Start services (separate terminals):
   ```bash
   npm run dev -w @gpt5video/api
   npm run dev -w @gpt5video/gui
   ```

## Development workflow

- Create a feature branch.
- Update `to-do.md` for any scoped change. Mark items as `[~]` or `[x]` with a short note.
- Add or update schemas and generated types when changing data contracts.
- Run checks locally:
  ```bash
  npm run -ws typecheck && npm run -ws lint && npm run -ws build
  ```
- Open a Pull Request using the PR template. Link the exact checklist items changed in `to-do.md` and include a one-line impact summary.

## Commit style

- Prefer clear, conventional commit subjects (e.g., `feat(gui): drag-and-drop order in manifest builder`).

## Code of Conduct

By participating, you agree to uphold our `CODE_OF_CONDUCT.md`.

## Security

Please report security issues privately. See `SECURITY.md`.
