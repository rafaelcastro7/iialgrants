# Frontend V2 Redesign

Date: 2026-07-11

## Goal

Create a new visual version of IIAL Grants without deleting the existing
interface. V2 is the default authenticated experience; V1 remains available
from the visible V1/V2 switch and through `localStorage["iial.ui.version"]`.

## Research Inputs

- Instrumentl: grant work framed as an operating system for finding, writing,
  managing, and collaborating on grants.
  https://www.instrumentl.com/
- Fluxx: role-based dashboards and centralized visibility/accountability for
  grant workflows.
  https://www.fluxx.io/about-us
  https://www.fluxx.io/grantelligence-grants-management
- Foundant GLM: configurable full grant lifecycle manager.
  https://www.foundant.com/products/grant-management-software-for-foundations/
- Grants.gov: lifecycle framing across pre-award, award, and post-award phases.
  https://www.grants.gov/learn-grants/grants-101/the-grant-lifecycle

This implementation adapts information architecture and interaction patterns;
it does not copy proprietary visuals, assets, or page layouts.

## V2 Design Direction

- Position the app as an "Opportunity operating system", not a generic admin
  dashboard.
- Organize navigation by user workstream: Command, Prospect Intelligence,
  Pursuit Pipeline, Award Operations, Control Room, and Workspace.
- Keep the lifecycle visible: Discover, Fit, Draft, Submit, Award, Report.
- Prioritize next action, ranked opportunity queue, deadlines, and local-first
  trust posture.
- Use a restrained operational palette: light grid canvas, dark navigation
  rail, teal primary, amber/green/status accents, 8px radius.
- Reduce decorative surfaces and make data/workflow density the first signal.

## Implementation

- `src/components/v2/V2AuthenticatedShell.tsx`: new desktop/mobile shell,
  command search, lifecycle strip, local AI status, V2 navigation taxonomy.
- `src/components/v2/V2GrantDetail.tsx`: V2-native grant detail surface with
  decision brief, source quality, fit/evaluation, requirements, eligibility,
  sectors, official sources, lifecycle history, source retrieval health, and
  briefing tools.
- `src/components/v2/ui-version.ts`: V1/V2 context and persistence helpers.
- `src/components/v2/UiVersionProvider.tsx`: provider used by the authenticated
  layout.
- `src/components/v2/UiVersionToggle.tsx`: segmented V1/V2 toggle.
- `src/routes/_authenticated.tsx`: chooses V2 shell by default, V1 shell when
  requested.
- `src/components/AppSidebar.tsx`: keeps V1 shell and adds V1/V2 switch; its
  topbar is hidden inside V2 via `.v1-app-topbar`.
- `src/routes/_authenticated.dashboard.tsx`: V2 dashboard command center added
  as a separate presentation; old dashboard remains the V1 path.
- `src/routes/_authenticated.grants.$id.tsx`: renders `V2GrantDetail` when
  `iial.ui.version` is `v2`, while keeping the old Express/Advanced grant
  detail flow for V1.
- `src/styles.css`: V2-only tokens, radius, typography, shadows, and canvas.
- `vite.config.ts`: replaced deprecated `vite-tsconfig-paths` plugin usage with
  Vite 8 native `resolve.tsconfigPaths`.

## Local Model Attempt

The user requested local models. Three local Ollama prompts were attempted for
design critique:

- `opencode-fast:latest` timed out after about 184 seconds.
- `phi4-mini:latest` timed out after about 124 seconds.
- `deepseek-r1:1.5b` timed out after about 94 seconds.

`ollama ps` showed models loaded on GPU but no usable text returned. They were
stopped with `ollama stop`. No cloud LLM was used. Follow-up: investigate
Ollama interactive CLI/runtime health separately.

## Verification

- `bun run lint`: passed with no warnings.
- `bun run build`: passed. Remaining output is non-blocking TanStack plugin
  timing info plus the existing large client entry chunk warning.
- Playwright desktop demo Admin verification:
  `test-results/v2-dashboard-loaded.png`.
- Playwright mobile verification:
  `test-results/v2-dashboard-mobile.png`.
- Playwright grant detail verification on
  `/grants/7f00b146-7b75-483e-8613-da644a34d3e7`:
  `test-results/v2-grant-detail.png` and
  `test-results/v2-grant-detail-mobile.png`.
- Browser checks: V2 marker present, V1 topbar absent/hidden, no console/page
  errors, grants load, grant detail V2 has no Express/Advanced toggle, and
  dashboard/detail mobile views have no horizontal overflow.

## Follow-Up

- Rebuild remaining deep route interiors as V2-native work surfaces: Grants
  Index, Proposal Detail, Admin pages.
- Address the large entry chunk with real code-splitting, not by raising the
  warning limit.
- Fix or diagnose local Ollama prompt timeouts before relying on it for future
  UI design audits.
