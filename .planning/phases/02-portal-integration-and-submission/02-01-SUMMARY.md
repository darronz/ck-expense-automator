---
phase: 02-portal-integration-and-submission
plan: 01
subsystem: portal-api
tags: [ck-api, datatable, suspense-items, portal-interaction, types]
dependency_graph:
  requires: [lib/types.ts (Phase 1)]
  provides: [lib/ck-api.ts — readSuspenseItems, parseDateToISO, parseAmount]
  affects: [entrypoints/ck-portal.content.ts, Phase 3 panel UI]
tech_stack:
  added: []
  patterns: [MutationObserver + timeout for DOM readiness, try/finally cleanup for DataTable iteration, window as any for MAIN world jQuery access]
key_files:
  created: [lib/ck-api.ts]
  modified: [lib/types.ts]
decisions:
  - "_claimId parameter accepted but unused in readSuspenseItems — API consistency with submitExpense (plan 02) and avoids breaking callers when submission is added"
  - "MutationObserver timeout set to 5000ms — DataTable loads synchronously from DOM manipulation (not AJAX), 5s is conservative and per research recommendation"
  - "Re-export SubmissionResult from ck-api.ts so callers import from one place; original still in types.ts for internal type-checking"
metrics:
  duration_seconds: 84
  completed_date: "2026-04-03"
  tasks_completed: 2
  files_created: 1
  files_modified: 1
---

# Phase 02 Plan 01: Portal Interaction Layer (readSuspenseItems) Summary

**One-liner:** MutationObserver-based DataTable reader with jQuery trigger sequence, try/finally cleanup, and typed CkApiError/SubmissionResult for portal integration layer.

## What Was Built

`lib/ck-api.ts` — the portal interaction layer for reading suspense items from the CK portal's jQuery DataTable. This is the data-reading half of the portal API (the submission half follows in plan 02).

`lib/types.ts` — extended with `CkApiError` union type and `SubmissionResult` interface, enabling typed error discrimination for both reading and submission operations.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Add SubmissionResult type to lib/types.ts | 30c6ab1 | lib/types.ts |
| 2 | Create lib/ck-api.ts with readSuspenseItems and pure helpers | c656e90 | lib/ck-api.ts |

## Key Exports

### lib/types.ts (additions)
- `CkApiError` — union type: `'SESSION_EXPIRED' | 'VALIDATION_ERROR' | 'NETWORK_ERROR' | 'TIMEOUT' | 'DATATABLE_NOT_FOUND'`
- `SubmissionResult` — `{ success: boolean; error?: CkApiError | string; validationMessages?: string[] }`

### lib/ck-api.ts (new file)
- `readSuspenseItems(claimId: string): Promise<SuspenseItem[]>` — primary export; orchestrates trigger + wait + iterate
- `parseDateToISO(ddmmyyyy: string): string` — converts `'13/03/2026'` → `'2026-03-13'`
- `parseAmount(text: string): number` — strips currency symbols, returns float

### Internal (not exported)
- `triggerPaymentTypeAndSuspenseItems()` — sets Payment Type=2 and ticks Map to Suspense Items via jQuery `.trigger('change')`
- `waitForDataTable(timeoutMs)` — MutationObserver-based promise, rejects after timeout with TIMEOUT error message

## Architecture Decisions

**_claimId parameter accepted but unused in readSuspenseItems:** Added for API surface consistency with `submitExpense()` coming in plan 02. Callers pass `claimId` now so the call site doesn't need to change when submission is added. Marked with leading underscore to satisfy TypeScript's unused-param rules.

**MutationObserver over polling:** Per research findings — fires on microtask queue when CK portal's jQuery handlers insert the DataTable. No polling interval lag. 5000ms timeout is conservative for what is a synchronous DOM manipulation (not AJAX).

**try/finally cleanup is the correctness invariant:** If any step in row iteration throws (e.g., `dt.row(rowIdx).node()` returns null, `parseAmount` throws, etc.), the form must not be left with `#MappedSuspenseItemIds` populated. The finally block guarantees `dt.rows().deselect()` and `$('#MappedSuspenseItemIds').val('')` run unconditionally.

**Re-export SubmissionResult from ck-api.ts:** Callers working with the portal API can import `SubmissionResult` from `./ck-api` instead of needing to know it lives in `./types`. The canonical definition remains in `types.ts`.

## Verification Results

- `./node_modules/.bin/tsc --noEmit` — exits 0 (no TypeScript errors)
- `npx vitest run` — 47/47 tests passing (3 test files)
- `npx wxt build` — extension builds successfully (6.4 kB output)
- `grep -c "deselect" lib/ck-api.ts` — returns 2 (loop body + finally block)
- No `browser.*` or `chrome.*` usage in ck-api.ts

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

Files confirmed:
- `lib/ck-api.ts` — exists with all required exports
- `lib/types.ts` — contains `SubmissionResult` and `CkApiError`

Commits confirmed:
- `30c6ab1` — feat(02-01): add SubmissionResult and CkApiError types to lib/types.ts
- `c656e90` — feat(02-01): create lib/ck-api.ts with readSuspenseItems and pure helpers
