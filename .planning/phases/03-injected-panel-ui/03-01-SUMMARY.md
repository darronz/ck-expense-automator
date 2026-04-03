---
phase: 03-injected-panel-ui
plan: 01
subsystem: ui
tags: [wxt, shadow-dom, content-script, typescript, vitest]

# Dependency graph
requires:
  - phase: 02-portal-integration-and-submission
    provides: SuspenseItem type, readSuspenseItems, submitExpense, lib/types.ts

provides:
  - Two-entrypoint world split: MAIN world fires ck:items-ready event, isolated world mounts Shadow DOM panel
  - panel-utils.ts pure utility module with CATEGORIES, extractForeignCurrency, isLikelyVatInclusive, sortCategoriesByUsage, getCategoryLabel, deriveMatchPattern
  - panel.css shadow-root stylesheet scaffold with all: initial reset overrides
  - window.__ckExpenseData fallback for late-subscriber race condition handling

affects:
  - 03-injected-panel-ui/03-02 (panel DOM implementation depends on createPanel stub and utility functions)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two-entrypoint world split: MAIN world for jQuery/DataTables, ISOLATED world for Shadow DOM + browser.storage"
    - "Custom DOM event bridge (ck:items-ready) + window.__ckExpenseData fallback for cross-world data transfer"
    - "createShadowRootUi with cssInjectionMode: ui for CSS injection into shadow root"
    - "Late-subscriber pattern: check window.__ckExpenseData on mount before registering event listener"

key-files:
  created:
    - entrypoints/ck-panel.content.ts
    - ui/panel-utils.ts
    - ui/panel.css
    - tests/panel-utils.test.ts
    - tests/panel.test.ts
  modified:
    - entrypoints/ck-portal.content.ts

key-decisions:
  - "panel-utils.ts is pure (no browser APIs) — safe to unit test in Node/jsdom without mocking WXT"
  - "ck-panel.content.ts omits world declaration (defaults to ISOLATED) — required for createShadowRootUi which calls browser.runtime.getURL()"
  - "window.__ckExpenseData set before dispatching ck:items-ready event — handles race where isolated world registers listener after MAIN world has already fired"
  - "sortCategoriesByUsage: zero-usage items fall back to DEFAULT_TOP_CATEGORIES order (top-5) then alphabetical — clean first-run experience"

patterns-established:
  - "Panel 02 onward: use createPanel(container, ctx) stub pattern — Plan 02 replaces stub with full DOM implementation"
  - "Shadow host styled from onMount callback (outside shadow root for fixed positioning); container styled inside"

requirements-completed: [PANEL-01, PANEL-06, PANEL-08, UNMT-03, UNMT-04, UNMT-05]

# Metrics
duration: 3min
completed: 2026-04-03
---

# Phase 3 Plan 1: Injected Panel UI — World Split and Utility Layer Summary

**Two-entrypoint world split with Shadow DOM panel scaffold and panel-utils.ts utility module (37 unit tests passing)**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-04-03T10:25:26Z
- **Completed:** 2026-04-03T10:28:10Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Created panel-utils.ts with 7 pure exported functions (CATEGORIES, DEFAULT_TOP_CATEGORIES, extractForeignCurrency, isLikelyVatInclusive, sortCategoriesByUsage, getCategoryLabel, deriveMatchPattern) and 37 unit tests — all passing
- Extended ck-portal.content.ts (MAIN world) to fire ck:items-ready custom event and set window.__ckExpenseData after reading suspense items
- Created ck-panel.content.ts (ISOLATED world) using createShadowRootUi with fixed 400px right sidebar positioning and late-subscriber fallback pattern
- Created panel.css scaffold with full CSS reset overrides (display: flex, box-sizing, font-family, etc.) for header/body/footer sections
- Created panel.test.ts placeholder scaffold for Plan 02 integration tests

## Task Commits

Each task was committed atomically:

1. **Task 1: panel-utils.ts pure utility functions with tests** - `21ac936` (feat + test, TDD)
2. **Task 2: ck-panel.content.ts + portal extension + panel.css + panel.test.ts** - `cf56705` (feat)

**Plan metadata:** (docs commit — see below)

_Note: Task 1 used TDD (RED: tests written first, GREEN: implementation made them pass)_

## Files Created/Modified

- `ui/panel-utils.ts` — Pure utility functions for panel rendering: category map, foreign currency extraction, VAT divisibility check, category usage sorting, match pattern derivation
- `tests/panel-utils.test.ts` — 37 unit tests for all panel-utils.ts exports, covering all specified behavior cases and edge cases
- `entrypoints/ck-panel.content.ts` — New isolated-world Shadow DOM panel entrypoint using createShadowRootUi, with late-subscriber pattern for cross-world data receipt
- `entrypoints/ck-portal.content.ts` — Extended to set window.__ckExpenseData and dispatch ck:items-ready custom event after reading suspense items
- `ui/panel.css` — Shadow root stylesheet scaffold with all: initial reset overrides; header/body/footer sections with flex layout
- `tests/panel.test.ts` — Placeholder scaffold for Plan 02 integration tests

## Decisions Made

- **panel-utils.ts is pure (no browser APIs):** Enables unit testing in Node/jsdom without WXT mocks. All browser-dependent logic stays in ck-panel.content.ts.
- **ck-panel.content.ts omits `world:` declaration:** Defaults to ISOLATED world, which is required for createShadowRootUi (calls browser.runtime.getURL() internally). Adding explicit `world: 'MAIN'` would break CSS injection.
- **window.__ckExpenseData set before event dispatch:** Handles the race condition where document_idle order between MAIN and ISOLATED world is non-deterministic. Panel checks for existing data on mount before registering the event listener.
- **sortCategoriesByUsage fallback order:** Zero-usage items sort by DEFAULT_TOP_CATEGORIES membership (top-5 first) then alphabetical by label. Ensures clean first-run UX with familiar categories at top.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Two-entrypoint architecture is established and wired; Plan 02 can focus entirely on panel DOM implementation
- panel-utils.ts utility functions are fully tested and ready for Plan 02 to import
- createPanel() stub in ck-panel.content.ts is the primary extension point for Plan 02
- handleItemsReady() stub is the secondary extension point — Plan 02 will pass items to the panel state
- All 103 existing tests continue to pass

---
*Phase: 03-injected-panel-ui*
*Completed: 2026-04-03*
