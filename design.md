## GUI Design and UX Polish Plan

Owner: FE/Design
Scope: Week 3 polish and hardening; make GUI usable by non-engineers.

### Objectives

- Establish a coherent visual system (tokens, layout, components) using Tailwind.
- Ship a consistent app shell (sidebar + topbar) and page headers so users know where they are and what to do.
- Improve onboarding (helper text, empty states, quick tour).
- Keep builds green, schema-first, and respect guardrails; do not change storage routes.

### Principles

- Clarity over novelty: readable type scales, sensible spacing, strong contrast.
- Consistency: a single accent color; repeated patterns for actions, validation, and statuses.
- Accessibility: keyboard reachable, focus-visible, semantic headings, ARIA where needed.
- Performance: minimal client JS for layout; debounce expensive DOM work (already done for filmstrips).

### Design Tokens (Tailwind)

- Colors
  - Accent: blue (500/600 primary, 700 hover, 50/100 soft backgrounds)
  - Neutral: gray scale (50–900) for backgrounds/borders/text
  - Semantic badges: yellow (estimates), blue (actual), red (errors), green (success)
- Typography
  - Font: Inter or system UI
  - Type scale: 12 (mono), 14 (caption), 14/16 (body), 18 (section), 24 (page title)
- Radii: sm 6px, md 8px
- Shadows: xs card, md drawer/modal
- Spacing: 4/6/8/12 grid; content max-widths: 3xl/4xl/5xl depending on page

Implementation: configure in `apps/gui/tailwind.config.ts` and global CSS. Prefer utility classes + small helpers.

### App Shell

Components:

- `components/Layout.tsx`
  - Sidebar: persistent on desktop; collapsible on mobile
  - Topbar: page title, SSE status pill, guardrails pill
  - Content: padded container with breadcrumbs + `PageHeader`
- `components/PageHeader.tsx`
  - Title, description (helper text), right-aligned primary actions slot

Navigation (icons via lucide-react): Dashboard, Brand, Hooks, Character, Scenes, Renders, Video, Review & Export, Settings

### UI Primitives (components/ui)

- `Button`, `Input`, `Select`, `Textarea`, `Checkbox`, `Badge`, `Chip`, `Tabs`, `Card`, `Table`, `Tooltip`, `Modal/Drawer`, `EmptyState`.
- Keep props minimal; align sizes/variants.
- Use existing `Toast` and `useToast`.

### Page-by-Page Upgrades

- Dashboard
  - Replace ad-hoc tiles with `Card` grid; status colors; iconography
  - Getting Started `Card` linking main flow: Brand → Hooks → Scenes → Renders → Video → Review
  - SSE status surfaced in topbar

- Hooks
  - Toolbar with filters as `Chip`s; search; actions grouped (Mine Hooks)
  - Approve/Edit in a `Drawer` with clearer controls

- Scenes Plan/Editor
  - Two-column layout: `Tabs` for JSON vs Form composers
  - Sticky validation panel; inline error highlighting; helper copy

- Scenes Render
  - Clear “what to do” helper; promote presets; status and toasts consolidated in header

- Renders
  - Larger preview cards; status `Badge`s; filmstrip thumbs as a slot
  - Compare mode in a `Tabs` section with clearer selection state

- Video Assemble
  - `Tabs`: Form vs JSON; preview panel below
  - Audio sub-tabs when enabled; persist last manifest; inline validation states

- Review & Export
  - Presets as first-class `ButtonGroup`; aspect label; safe-margin note
  - Copy/Open controls with toasts; preview area styled

### Onboarding & Help

- Quick tour (react-joyride) for: Settings token → Dashboard SSE → Scenes Plan → Scenes Render → Video Assemble → Review & Export.
- Per-page helper text in headers; tooltips for icon-only controls.

### Accessibility & Responsiveness

- Keyboard navigation for forms/drawers/modals; visible focus rings.
- ARIA labeling for toggles/menus; semantic headings (h1/h2/h3) per page.
- Responsive breakpoints: sidebar collapses < md; card grids reflow.

### Testing

- Playwright
  - Smoke: dashboard tiles, SSE ping changes, guardrails tile visible
  - Scenes Plan: invalid → error visible; valid → success toast
  - Scenes Render: queue render → toast; output section present
  - Renders compare: select two outputs; thumbnails appear
  - Review: copy key shows “Copied!” toast
  - Optional visual snapshots for key sections (`toHaveScreenshot`)
- Keep `npm run -ws typecheck && npm run -ws build` green

### Milestones (PRs)

1. Tokens + Layout + primitives; wrap all pages; Dashboard + Renders upgrades; quick helper text; initial Playwright tests
2. Scenes Plan/Render upgrades; validation UX; more tests
3. Hooks UX; approve/edit drawer; filters
4. Video Assemble Form/JSON tabs; Review & Export polish; Quick tour

### Acceptance

- Sidebar/topbar across all pages, with icons and breadcrumbs
- Page headers with helper text; consistent primary action placement
- Empty states + tooltips; quick tour available
- Playwright smoke covers primary journey; builds green

### Constraints

- Schema-first; do not change storage routes; respect guardrails; use `fetchWithAuth` for protected calls; keep `useToast`.
