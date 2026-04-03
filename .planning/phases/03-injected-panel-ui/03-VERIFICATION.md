---
phase: 03-injected-panel-ui
verified: 2026-04-03T11:46:00Z
status: gaps_found
score: 4/5 success criteria verified
re_verification: false
gaps:
  - truth: "A floating Shadow DOM panel appears on the CK ExpenseItems page showing matched items and unmatched items separately"
    status: failed
    reason: "ck-panel.content.ts never imports createPanel from ui/panel.ts. The entrypoint defines its own stub createPanel() that inserts 'CK Expense Automator loading...' and a stub handleItemsReady() that only logs — the full panel DOM is never mounted."
    artifacts:
      - path: "entrypoints/ck-panel.content.ts"
        issue: "createPanel stub (line 76-80) inserts placeholder text only; real createPanel from ui/panel.ts is never imported or called"
      - path: "entrypoints/ck-panel.content.ts"
        issue: "handleItemsReady stub (line 66-70) only logs; never calls the real createPanel which handles items-ready data"
    missing:
      - "Add `import { createPanel } from '../ui/panel';` to entrypoints/ck-panel.content.ts"
      - "Remove the stub createPanel function (lines 76-80) from ck-panel.content.ts"
      - "Remove the stub handleItemsReady function (lines 66-70) from ck-panel.content.ts"
      - "The real createPanel in ui/panel.ts already registers its own ck:items-ready listener internally — the outer handleItemsReady/event listener in ck-panel.content.ts should either call createPanel(container, ctx) which handles it, or pass the ctx event setup to createPanel"
human_verification:
  - test: "Load extension on CK ExpenseItems page and verify floating panel appears in top-right"
    expected: "Shadow DOM panel appears at right side of page showing matched/unmatched suspense items with submit controls"
    why_human: "Cannot verify Shadow DOM rendering programmatically without running the extension in a real browser on the portal"
  - test: "Submit a single matched item via [Submit] button and verify green success state"
    expected: "Row transitions to green background with checkmark and 'Submitted' label; portal expense item created"
    why_human: "Requires live CK portal authentication and actual form submission"
  - test: "Toggle dry-run mode and click [Submit All] — verify no actual submissions are made"
    expected: "All rows show yellow/amber dry-run state with no network requests to /ExpenseItems/Create"
    why_human: "Requires live browser context to intercept network requests"
---

# Phase 3: Injected Panel UI Verification Report

**Phase Goal:** User can see all matched and unmatched suspense items in an injected panel and submit them individually or in bulk without leaving the CK portal page
**Verified:** 2026-04-03T11:46:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A floating Shadow DOM panel appears showing matched items (date, amount, rule name, category, vendor, VAT summary) and unmatched items separately | FAILED | ck-panel.content.ts has stub createPanel that inserts placeholder text; real createPanel from ui/panel.ts is never imported |
| 2 | User can submit a single matched item via [Submit] button and see it transition to green success state; failed items show error and [Retry] button | PARTIAL | submitOne(), applySuccessState(), applyErrorState() all implemented in ui/panel.ts — but unreachable because the panel DOM is never mounted via the entrypoint |
| 3 | User can submit all matched items in bulk via [Submit All] and see a progress indicator update as each item completes | PARTIAL | submitAllWithDelay(), buildBulkSubmitHandler() fully implemented with progress indicator — unreachable via entrypoint |
| 4 | Unmatched items expand to an inline form with category dropdown, reason, vendor, VAT fields, and a "Save as rule" checkbox that creates a rule with an editable match pattern on submit | PARTIAL | renderInlineForm(), renderUnmatchedRow(), submitUnmatched() all implemented — unreachable via entrypoint |
| 5 | Dry-run mode toggle shows what would be submitted without actually posting to the CK endpoint | PARTIAL | dryRun toggle in PanelState, dry-run path in submitOne/submitAllWithDelay — unreachable via entrypoint |

**Score:** 0/5 truths fully verified (4 are implemented but unreachable; 1 truth is the root cause)

Note: The underlying logic in ui/panel.ts is completely implemented and tested. The gap is solely the missing import wire in ck-panel.content.ts.

### Required Artifacts

#### Plan 03-01 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `entrypoints/ck-panel.content.ts` | Isolated-world Shadow DOM panel entrypoint | ORPHANED | Exists and mounts Shadow DOM — but createPanel stub never imports from ui/panel.ts |
| `entrypoints/ck-portal.content.ts` | MAIN world fires ck:items-ready | VERIFIED | dispatchEvent + __ckExpenseData both present (lines 36-40) |
| `ui/panel-utils.ts` | Pure utility functions | VERIFIED | All 7 exports present; 37 tests passing |
| `ui/panel.css` | Shadow-root stylesheet | VERIFIED | .ck-panel class present; flex layout; all required classes present |
| `tests/panel-utils.test.ts` | Unit tests for panel-utils.ts | VERIFIED | 37 tests passing |
| `tests/panel.test.ts` | Tests for panel.ts | VERIFIED | 55 tests passing (no placeholder tests remain) |

#### Plan 03-02 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `ui/panel.ts` (createPanel, PanelState) | Panel DOM builder | STUB/ORPHANED | Fully implemented with all required exports — but never imported by ck-panel.content.ts |
| `ui/panel.css` (header/matched/success/error/progress) | Complete panel stylesheet | VERIFIED | All required classes present (.ck-panel-header, .ck-matched-section, .ck-item-row, .ck-success, .ck-error, .ck-progress) |
| `tests/panel.test.ts` | Submission orchestration tests | VERIFIED | submitAllWithDelay tests, formatVatSummary, parseClaimContext all tested |

#### Plan 03-03 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `ui/panel.ts` (buildRuleFromForm, getTopCategories) | Unmatched item functions | VERIFIED (implementation) | Both exported and tested |
| `ui/panel.css` (.ck-inline-form, .ck-form-row, .ck-form-error, .ck-save-rule-section) | Inline form styles | VERIFIED | All 4 required classes plus .ck-vat-hint and .ck-match-pattern-row present |
| `tests/panel.test.ts` | Unmatched item logic tests | VERIFIED | buildRuleFromForm (4 tests), getTopCategories (5 tests), submitUnmatched (7 tests) all pass |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `entrypoints/ck-portal.content.ts` | `document 'ck:items-ready' event` | `document.dispatchEvent(new CustomEvent('ck:items-ready', ...))` | WIRED | Line 37: matches required pattern |
| `entrypoints/ck-portal.content.ts` | `window.__ckExpenseData` | Direct assignment | WIRED | Line 36: `(window as any).__ckExpenseData = { claimId, items }` |
| `entrypoints/ck-panel.content.ts` | `createShadowRootUi` | WXT API call | WIRED | Line 17: createShadowRootUi with cssInjectionMode: 'ui' |
| `entrypoints/ck-panel.content.ts` | `ui/panel.ts createPanel()` | import { createPanel } | NOT_WIRED | **CRITICAL GAP**: ck-panel.content.ts defines its own stub createPanel; never imports from ui/panel.ts |
| `ui/panel.ts submitOne()` | `lib/ck-api.ts submitExpense()` | import | WIRED | Line 7: `import { submitExpense } from '../lib/ck-api'`; called at line 627 |
| `ui/panel.ts submitAll()` | `ctx.setTimeout(resolve, 400)` | delayFn injection | WIRED | Line 786: `new Promise((resolve) => ctx.setTimeout(resolve, ms))` |
| `ui/panel.ts buildPayload call` | `lib/expense-engine.ts buildPayload()` | import | PARTIAL | buildPayload imported (line 6) but never called directly in panel.ts — delegated through submitExpense in ck-api.ts. Architecturally correct but differs from plan spec. |
| `ui/panel.ts submitUnmatched()` | `lib/rules-store.ts addRule()` | import | WIRED | Line 8: `import { ... addRule } from '../lib/rules-store'`; called at line 306 |
| `ui/panel.ts renderInlineForm()` | `ui/panel-utils.ts deriveMatchPattern()` | import | WIRED | Line 12: `deriveMatchPattern` imported; called at lines 288, 313, 501 |
| `ui/panel.ts submitUnmatched()` | `lib/expense-engine.ts validateVat()` | import | WIRED | Line 6: `validateVat` imported; called at line 271 |
| `ui/panel.ts renderInlineForm()` | `lib/vendor-extractor.ts extractVendor()` | import | WIRED | Line 18: `import { extractVendor } from '../lib/vendor-extractor'`; called at line 415 |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| PANEL-01 | 03-01 | Shadow DOM floating panel injected on CK ExpenseItems pages | BLOCKED | Shadow DOM mounts via createShadowRootUi but only renders placeholder text — real panel never wired |
| PANEL-02 | 03-02 | Panel displays matched items with date, amount, rule name, category, vendor, VAT summary | BLOCKED | buildMatchedRow() implements this fully in ui/panel.ts but unreachable via entrypoint |
| PANEL-03 | 03-02 | User can submit individual matched items via per-row [Submit] button | BLOCKED | submitOne() implemented; unreachable |
| PANEL-04 | 03-02 | User can submit all matched items in bulk via [Submit All] with progress indicator | BLOCKED | submitAllWithDelay() + buildBulkSubmitHandler() implemented; unreachable |
| PANEL-05 | 03-02 | Submitted items show green success state; failed items show error with [Retry] button | BLOCKED | applySuccessState(), applyErrorState() implemented; unreachable |
| PANEL-06 | 03-01 | Panel shows claim context (month/year) and item counts in header | BLOCKED | parseClaimContext() + contextText update implemented in createPanel; unreachable |
| PANEL-07 | 03-02 | Dry-run / preview mode toggle | BLOCKED | dryRun toggle in PanelState with correct behavior; unreachable |
| PANEL-08 | 03-01 | Foreign currency amounts displayed alongside GBP | BLOCKED | extractForeignCurrency() integrated in buildMatchedRow; unreachable |
| UNMT-01 | 03-03 | Unmatched items show inline assignment form | BLOCKED | renderInlineForm() fully implemented; unreachable |
| UNMT-02 | 03-03 | "Save as rule" checkbox creates new rule | SATISFIED (logic) | submitUnmatched() calls addRule() when saveAsRule=true — tested and verified |
| UNMT-03 | 03-01/03-03 | Auto-derived match pattern shown and editable | SATISFIED (logic) | deriveMatchPattern() tested; patternInput rendered in renderInlineForm |
| UNMT-04 | 03-01/03-03 | Category dropdown shows most-used categories at top | SATISFIED (logic) | getTopCategories() + sortCategoriesByUsage() tested and working |
| UNMT-05 | 03-01/03-03 | VAT divisibility hint shown | SATISFIED (logic) | isLikelyVatInclusive() tested; vatHintDiv rendered in renderInlineForm |

**Orphaned requirements check:** All 13 requirements assigned to Phase 3 in REQUIREMENTS.md traceability table are covered by Plans 03-01, 03-02, and 03-03. No orphaned requirements.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `entrypoints/ck-panel.content.ts` | 76-80 | Stub createPanel() that inserts placeholder text — never replaced with real import | BLOCKER | The entire panel UI is unreachable; no matched/unmatched items ever displayed |
| `entrypoints/ck-panel.content.ts` | 66-70 | Stub handleItemsReady() that only logs — Plan 02 said it would replace this | BLOCKER | Suspense item data received by isolated world but never passed to panel state |
| `ui/panel.ts` | 6 | buildPayload imported but never called directly | INFO | Unused import; architecturally sound (delegated through submitExpense). Minor TypeScript lint warning. |
| `tests/panel.test.ts` | 216 | `afterEach` used but not imported from vitest | INFO | Tests still pass (vitest globals available at runtime) but is a TypeScript error (`tsc --noEmit` reports TS2304) |

### Human Verification Required

#### 1. Shadow DOM Panel Rendering

**Test:** Install extension, navigate to `https://portal.churchill-knight.co.uk/ExpenseItems/Create?claimId=XXXXX`, check if panel appears
**Expected:** A 400px right sidebar panel with "CK Expense Automator" header appears (after the entrypoint wiring gap is fixed)
**Why human:** Cannot render Shadow DOM and verify visual output programmatically

#### 2. Individual Submission Flow

**Test:** Click [Submit] on a matched item row
**Expected:** Button disables, row shows loading state, then green "✓ Submitted" label on success
**Why human:** Requires live CK portal session and actual HTTP POST verification

#### 3. Dry-Run Mode

**Test:** Toggle the "Dry-run" checkbox, click [Submit All]
**Expected:** All rows turn amber/yellow "⏭ Dry-run" without any network requests to /ExpenseItems/Create
**Why human:** Requires browser DevTools Network tab inspection

### Gaps Summary

The phase has one root-cause gap: **`ck-panel.content.ts` was never updated to import and use the real `createPanel` from `ui/panel.ts`**.

Plans 03-02 and 03-03 implemented the full panel in `ui/panel.ts` (1031 lines, all tested), but the entrypoint `ck-panel.content.ts` still contains the Plan 01 stub. This means:

- The Shadow DOM panel mounts (structure is correct)
- But it only ever shows "CK Expense Automator loading..."
- No matched or unmatched items are ever rendered
- No submit functionality is reachable by the user

The fix is a 3-line change:
1. Add `import { createPanel } from '../ui/panel';` to ck-panel.content.ts
2. Remove the stub `createPanel` function (lines 76-80)
3. Remove the stub `handleItemsReady` function (lines 66-70) since the real `createPanel` manages its own event listener internally

All underlying logic (ui/panel.ts, panel-utils.ts, tests) is complete and correct. The test suite passes 143 tests. Only the entrypoint wire is missing.

---

_Verified: 2026-04-03T11:46:00Z_
_Verifier: Claude (gsd-verifier)_
