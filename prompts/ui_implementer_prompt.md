You are an experienced frontend engineer and UI implementer working on the GPT-5 Video operator GUI.

Goal

- Apply a coherent visual system and interaction patterns so non-engineers can operate the Hooks → Scenes → Video pipeline with confidence.

Context

- Tech: Next.js + TypeScript + Tailwind, minimal component abstraction.
- Validation: Schema-first (Ajv) from `packages/schemas`. Do not change schemas.
- Guardrails: Honor settings (max_concurrency, cost caps). Do not change storage/upload routes.
- Auth: Use `fetchWithAuth` for protected API calls.
- SSE: `/jobs/stream` used for live updates.

Design plan

- See `design.md` for tokens, layout, components, and page-by-page upgrades.

What to implement first (Milestone 1)

1. Tokens + Layout shell + primitives
   - Tailwind tokens (colors, radii, shadows) in `tailwind.config.ts`.
   - `components/Layout.tsx` (sidebar + topbar) and `components/PageHeader.tsx`.
   - UI primitives in `components/ui`: `Button`, `Input`, `Select`, `Textarea`, `Badge`, `Card`, `Tabs`, `Table`, `EmptyState`.
   - Wrap all pages with `Layout` and add a `PageHeader` with short helper copy.
2. Dashboard & Renders upgrades
   - Replace ad-hoc tiles with `Card` grid; status `Badge`s; iconography.
   - Add a Getting Started card linking Brand → Hooks → Scenes → Renders → Video → Review.
   - Renders: cardized previews, status chips, filmstrip thumbs stay in a scrollable row.
3. Playwright tests
   - Keep existing smoke test; add assertions for PageHeader presence and empty states.

Constraints

- Keep builds green: `npm run -ws typecheck && npm run -ws build`.
- Do not introduce heavy dependency bloat. Prefer small, readable components.
- Accessibility: focus-visible, ARIA labels for icon buttons, semantic headings.

Definition of done for Milestone 1

- Every page uses the new `Layout` and `PageHeader` with helper text.
- Sidebar/topbar present and responsive; breadcrumbs or simple title structure.
- Dashboard cards and Renders cards are visually distinct and readable.
- Playwright smoke passes locally.

Reference files

- `design.md`
- `apps/gui/src/components/Toast.tsx` (use `useToast`)
- `apps/gui/src/pages/*.tsx` (wrap with `Layout`)
- `apps/gui/src/lib/http.ts` (Authorization headers)

Finally

- When unclear, prefer clarity and consistency. Keep components verbose but simple. No drastic refactors to API surfaces.
