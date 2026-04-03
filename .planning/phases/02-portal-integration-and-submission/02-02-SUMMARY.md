---
phase: 02-portal-integration-and-submission
plan: "02"
subsystem: api
tags: [fetch, asp-net, validation-parsing, session-expiry, dom-parser, jsdom, vitest, tdd]

# Dependency graph
requires:
  - phase: 02-01
    provides: readSuspenseItems, parseDateToISO, parseAmount in lib/ck-api.ts
  - phase: 01-02
    provides: buildPayload, ExpenseSubmission, SubmissionResult types in lib/expense-engine.ts and lib/types.ts

provides:
  - submitExpense() — fetch() POST with credentials:same-origin to /ExpenseItems/Create
  - parseValidationErrors() — DOMParser-based ASP.NET MVC validation error extractor
  - detectSessionExpiry() — response.redirected + URL pattern session expiry check
  - Content script wired to call readSuspenseItems() after jQuery confirmed
  - tests/ck-api.test.ts with 18 unit tests covering all pure functions

affects:
  - 03-panel-ui — imports submitExpense and readSuspenseItems from lib/ck-api.ts
  - 04-packaging — ck-api.ts is core submission module

# Tech tracking
tech-stack:
  added: [jsdom (devDependency for DOMParser in vitest)]
  patterns:
    - TDD red-green: failing tests committed before implementation
    - "@vitest-environment jsdom" file-level annotation for browser API tests
    - DOMParser for HTML response parsing (not regex)
    - fetch() with credentials:same-origin for portal session reuse
    - ASP.NET PRG pattern detection via response.redirected + response.url

key-files:
  created:
    - tests/ck-api.test.ts — 18 unit tests for parseDateToISO, parseAmount, parseValidationErrors, detectSessionExpiry
  modified:
    - lib/ck-api.ts — added parseValidationErrors, detectSessionExpiry, parseSubmissionResponse (internal), submitExpense
    - entrypoints/ck-portal.content.ts — import readSuspenseItems, call after jQuery confirmed with claimId from URL

key-decisions:
  - "Use @vitest-environment jsdom file annotation rather than global environment change — avoids affecting existing tests"
  - "install jsdom as devDependency (not happy-dom) — standard, mature, DOMParser support confirmed"
  - "parseSubmissionResponse is internal (not exported) — only submitExpense is the public API surface"

patterns-established:
  - "Pattern: DOMParser-based validation parsing — use DOMParser + querySelector rather than string regex for HTML parsing"
  - "Pattern: fetch PRG detection — check response.redirected first, then URL pattern for session expiry, then body for validation errors"
  - "Pattern: TDD with @vitest-environment jsdom — browser APIs in unit tests via file-level annotation"

requirements-completed: [PORT-04, PORT-05, PORT-06]

# Metrics
duration: 3min
completed: 2026-04-03
---

# Phase 02 Plan 02: Submit Expense Layer Summary

**fetch() POST submission with ASP.NET PRG response parsing, DOMParser validation error extraction, and content script wired to call readSuspenseItems on page load**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-04-03T09:55:03Z
- **Completed:** 2026-04-03T09:57:31Z
- **Tasks:** 3 (TDD: RED commit + GREEN commit + content script wiring)
- **Files modified:** 3

## Accomplishments
- Wrote 18 failing tests first (RED state) covering all pure functions — parseDateToISO, parseAmount, parseValidationErrors, detectSessionExpiry
- Implemented parseValidationErrors (DOMParser), detectSessionExpiry (response.redirected + URL), and submitExpense (fetch POST) to make all tests GREEN
- Wired content script to extract claimId from URL and call readSuspenseItems() after jQuery confirmed, enabling Phase 3 panel to read items on load

## Task Commits

Each task was committed atomically:

1. **Task 1: Write failing tests (RED phase)** - `ff42822` (test)
2. **Task 2: Add parseValidationErrors, detectSessionExpiry, submitExpense (GREEN phase)** - `ab1e929` (feat)
3. **Task 3: Wire readSuspenseItems into content script** - `f260a25` (feat)

_TDD: RED commit before GREEN is intentional — RED state confirmed before implementation_

## Files Created/Modified
- `tests/ck-api.test.ts` — 18 unit tests; @vitest-environment jsdom annotation; covers all pure functions
- `lib/ck-api.ts` — added parseValidationErrors, detectSessionExpiry, parseSubmissionResponse (internal), submitExpense; added ExpenseSubmission import and buildPayload import
- `entrypoints/ck-portal.content.ts` — import readSuspenseItems; extract claimId from URL; call readSuspenseItems after jQuery ready with error handling

## Decisions Made
- Used `@vitest-environment jsdom` file-level annotation rather than a global environment change to avoid affecting the 47 existing tests that run fine in the Node default environment
- Installed `jsdom` (not `happy-dom`) as devDependency — jsdom is the standard, DOMParser support is confirmed
- `parseSubmissionResponse` left as internal function (not exported) — only `submitExpense` is the public API surface; callers don't need the parsing internals

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] DOMParser not available in Node.js test environment**
- **Found during:** Task 2 (GREEN phase — first test run after implementing parseValidationErrors)
- **Issue:** `DOMParser is not defined` in the Node.js vitest environment; parseValidationErrors uses DOMParser which is a browser API
- **Fix:** Installed `jsdom` devDependency and added `// @vitest-environment jsdom` annotation to tests/ck-api.test.ts to opt into the jsdom DOM environment for that test file
- **Files modified:** package.json, package-lock.json, tests/ck-api.test.ts
- **Verification:** All 65 tests pass after fix; DOMParser resolves correctly
- **Committed in:** ab1e929 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Required fix for test suite to function. No scope creep — jsdom is the standard solution for browser API testing.

## Issues Encountered
None beyond the DOMParser environment fix documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 3 (panel UI) has all necessary APIs: `readSuspenseItems()` to populate item list, `submitExpense()` to submit items
- Content script already calls `readSuspenseItems()` on page load and logs results — Phase 3 replaces the `console.log` with panel rendering
- All 65 unit tests pass; extension builds cleanly; TypeScript clean

## Self-Check: PASSED

All created files exist. All task commits verified in git log.

| Item | Status |
|------|--------|
| tests/ck-api.test.ts | FOUND |
| lib/ck-api.ts | FOUND |
| entrypoints/ck-portal.content.ts | FOUND |
| 02-02-SUMMARY.md | FOUND |
| commit ff42822 (RED tests) | FOUND |
| commit ab1e929 (GREEN implementation) | FOUND |
| commit f260a25 (content script wiring) | FOUND |

---
*Phase: 02-portal-integration-and-submission*
*Completed: 2026-04-03*
