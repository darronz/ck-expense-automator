---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: planning
stopped_at: Completed 03-injected-panel-ui/03-02-PLAN.md
last_updated: "2026-04-03T10:37:01.215Z"
last_activity: 2026-04-03 — Roadmap created, phases derived from requirements
progress:
  total_phases: 4
  completed_phases: 2
  total_plans: 7
  completed_plans: 6
  percent: 50
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-03)

**Core value:** Recurring monthly expenses submitted in a single click instead of 8+ form interactions each
**Current focus:** Phase 1 — Foundation and Data Layer

## Current Position

Phase: 1 of 4 (Foundation and Data Layer)
Plan: 0 of 2 in current phase
Status: Ready to plan
Last activity: 2026-04-03 — Roadmap created, phases derived from requirements

Progress: [█████░░░░░] 50%

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: —
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**
- Last 5 plans: —
- Trend: —

*Updated after each plan completion*
| Phase 01-foundation-and-data-layer P01 | 45 | 3 tasks | 13 files |
| Phase 01-foundation-and-data-layer P02 | 8 | 3 tasks | 8 files |
| Phase 02-portal-integration-and-submission P01 | 84 | 2 tasks | 2 files |
| Phase 02-portal-integration-and-submission P02 | 3 | 3 tasks | 3 files |
| Phase 03-injected-panel-ui P01 | 3 | 2 tasks | 6 files |
| Phase 03-injected-panel-ui P02 | 12 | 2 tasks | 3 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Phase 1: Use WXT 0.20.x as build framework (replaces manual MV3 wiring, provides HMR)
- Phase 1: MAIN world injection is a hard blocker — must verify `$('#DataTables_Table_1').DataTable()` works before any other code is written
- Phase 2: Validate POST body against a real captured DevTools network request before automated submission
- [Phase 01-foundation-and-data-layer]: Inline tsconfig.json compiler options instead of extends .wxt/tsconfig.json — TypeScript 5.7/5.9 dot-directory relative extends fails in this environment; inlining is semantically identical
- [Phase 01-foundation-and-data-layer]: Commit .wxt/ directory to git for portability — tsconfig.json includes .wxt/wxt.d.ts directly so developers need types after clone
- [Phase 01-foundation-and-data-layer]: Add passWithNoTests to vitest.config.ts — vitest 4.x exits 1 with no test files, passWithNoTests makes it exit 0
- [Phase 01-foundation-and-data-layer]: recordRuleUsage writes to browser.storage.local (not sync) — stats change on every match, don't need cross-device sync
- [Phase 01-foundation-and-data-layer]: saveRules byte-count guard: warn at 25 rules, throw at 35 rules approaching 8192 per-item limit
- [Phase 01-foundation-and-data-layer]: calculateVatFromPercentage uses inclusive reverse formula net=gross/(1+pct/100) matching CK portal validation rule
- [Phase 02-portal-integration-and-submission]: _claimId parameter accepted but unused in readSuspenseItems — API surface consistency with submitExpense (plan 02)
- [Phase 02-portal-integration-and-submission]: MutationObserver timeout set to 5000ms for DataTable readiness — synchronous DOM manipulation, 5s is conservative
- [Phase 02-portal-integration-and-submission]: try/finally cleanup is the correctness invariant for DataTable iteration — MappedSuspenseItemIds always cleared even on throw
- [Phase 02-portal-integration-and-submission]: Use @vitest-environment jsdom file annotation rather than global environment change for DOMParser support in browser API tests
- [Phase 02-portal-integration-and-submission]: parseSubmissionResponse left internal (not exported) — submitExpense is the only public submission API surface
- [Phase 03-injected-panel-ui]: panel-utils.ts is pure (no browser APIs) — safe to unit test in Node/jsdom without WXT mocks
- [Phase 03-injected-panel-ui]: ck-panel.content.ts omits world declaration (defaults ISOLATED) — required for createShadowRootUi which calls browser.runtime.getURL()
- [Phase 03-injected-panel-ui]: window.__ckExpenseData set before ck:items-ready dispatch — handles non-deterministic document_idle ordering between MAIN and ISOLATED worlds
- [Phase 03-injected-panel-ui]: submitAllWithDelay accepts injectable submitFn and delayFn parameters for deterministic unit testing without fake timers
- [Phase 03-injected-panel-ui]: Row ID convention ck-row-{item.id} for direct DOM lookup in bulk submit callbacks

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 3 (DataTable trigger timing): Empirical validation of MutationObserver timeout values needed on live portal — spike this first in Phase 2
- Phase 4 (Response validation): Capture a real failed submission response to identify exact ASP.NET error markers before writing the parser

## Session Continuity

Last session: 2026-04-03T10:37:01.213Z
Stopped at: Completed 03-injected-panel-ui/03-02-PLAN.md
Resume file: None
