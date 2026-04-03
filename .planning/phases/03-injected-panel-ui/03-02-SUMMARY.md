---
phase: 03-injected-panel-ui
plan: 02
subsystem: ui
tags: [typescript, shadow-dom, chrome-extension, vitest, vanilla-dom, expense-panel]

# Dependency graph
requires:
  - phase: 03-injected-panel-ui/03-01
    provides: Shadow DOM entrypoint, panel-utils.ts pure utilities, panel.css base styles
  - phase: 02-portal-integration-and-submission
    provides: submitExpense(), buildPayload(), SubmissionResult types
  - phase: 01-foundation-and-data-layer
    provides: matchExpenses(), ExpenseRule, SuspenseItem, getRules(), recordRuleUsage()
provides:
  - ui/panel.ts: createPanel(), buildSubmissionForItem(), formatVatSummary(), formatAmount(), parseClaimContext(), submitAllWithDelay()
  - ui/panel.css: complete stylesheet for all panel visual states
  - 25 unit tests for all submission orchestration logic
affects:
  - 03-injected-panel-ui/03-03 (unmatched items inline form will extend this panel)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Injectable submit+delay functions in submitAllWithDelay() for deterministic unit testing
    - Targeted DOM mutation pattern (applySuccessState/applyErrorState) instead of full re-renders
    - PanelState plain object shared across event handlers for simple state management
    - TDD red-green cycle: 25 failing tests written first, then implementation to pass

key-files:
  created:
    - ui/panel.ts
  modified:
    - tests/panel.test.ts
    - ui/panel.css

key-decisions:
  - "submitAllWithDelay() accepts injectable submitFn and delayFn parameters — allows deterministic unit testing without fake timers for the submit logic itself; delayFn is the only timing-dependent piece"
  - "buildSubmissionForItem() exported as named function — pure, testable, reused by both submitOne() and submitAllWithDelay()"
  - "applySuccessState/applyErrorState/applyDryRunState as standalone DOM helpers — keeps submitOne() and bulk submit handler clean and consistent"
  - "Retry button re-runs submitOne() directly — simple and correct; no state machine needed for this scale"

patterns-established:
  - "Injectable function pattern for testing async orchestration: pass submitFn and delayFn as parameters instead of importing directly in the function"
  - "Row ID convention: id=ck-row-{item.id} for direct DOM lookup from bulk submit callback"
  - "CSS class-based state: ck-success, ck-error, ck-dryrun applied via classList; never inline styles for state"

requirements-completed:
  - PANEL-02
  - PANEL-03
  - PANEL-04
  - PANEL-05
  - PANEL-07

# Metrics
duration: 12min
completed: 2026-04-03
---

# Phase 03 Plan 02: Panel Submission Logic and Visual States Summary

**Panel UI with individual/bulk submit, 400ms sequential delays, success/error/retry/dry-run states, and 25 unit tests for all orchestration logic**

## Performance

- **Duration:** 12 min
- **Started:** 2026-04-03T11:31:00Z
- **Completed:** 2026-04-03T11:35:39Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Implemented `createPanel()` building full panel DOM: header with claim context, dry-run toggle, minimize/close buttons; matched/unmatched sections; footer with submission count
- `submitAllWithDelay()` with injectable `submitFn`/`delayFn` for deterministic testing, sequential 400ms delays, progress callbacks, and dry-run support
- Complete `panel.css` with 408 lines covering all visual states: success (green), error (red), dry-run (amber), expanded rows, progress bar, summary section, reload button
- 25 unit tests covering all pure exported functions with full edge case coverage

## Task Commits

1. **Task 1: panel.ts submission logic with tests** - `18312a6` (feat) — TDD: 25 failing tests first, then implementation
2. **Task 2: Complete panel.css with all visual states** - `b8e6630` (feat)

## Files Created/Modified

- `/Users/darron/Work/ck-expense-automator/ui/panel.ts` — Full panel module: PanelState interface, 6 exported pure functions, createPanel() DOM builder, submitOne()/submitAll() handlers
- `/Users/darron/Work/ck-expense-automator/tests/panel.test.ts` — 25 unit tests for buildSubmissionForItem, formatVatSummary, formatAmount, parseClaimContext, submitAllWithDelay
- `/Users/darron/Work/ck-expense-automator/ui/panel.css` — 408 lines: all required CSS class definitions, 17 flex containers, no all:initial override

## Decisions Made

- **Injectable functions pattern for submitAllWithDelay:** The function accepts `submitFn` and `delayFn` as parameters rather than importing them directly. This allows tests to pass `vi.fn()` mocks for the submit function and `vi.fn().mockResolvedValue(undefined)` for the delay, making assertions about call count and arguments straightforward without needing fake timer advancement for the main assertion path.
- **buildSubmissionForItem exported separately:** Plan specified it as an export, and it serves as the single place where item+rule→submission mapping logic lives. Both `submitOne()` and `submitAllWithDelay()` call it, avoiding duplication.
- **Retry handler re-runs submitOne directly:** Rather than rebuilding the submit button and re-registering a fresh listener, the retry closure captures `item`, `rule`, `claimId`, `dryRun`, and `rowEl` — all of which are stable — and directly calls `submitOne()`. Clean and avoids stale closure issues.

## Deviations from Plan

None — plan executed exactly as written. All acceptance criteria verified.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `createPanel()` is fully wired: header, matched items, unmatched placeholder, footer
- `submitOne()` and `submitAllWithDelay()` handle all submission flows including error/retry/dry-run
- Plan 03-03 (unmatched items inline form) can extend the existing unmatched section rows — the `ck-unmatched-section` div and per-item rows are already rendered by `createPanel()`
- All 127 tests pass; full test suite green

---
*Phase: 03-injected-panel-ui*
*Completed: 2026-04-03*
