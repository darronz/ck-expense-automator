---
phase: 03-injected-panel-ui
plan: "03"
subsystem: ui
tags: [panel, unmatched-items, inline-form, save-as-rule, vat-hint, categories]
dependency_graph:
  requires:
    - 03-01  # panel-utils.ts (deriveMatchPattern, sortCategoriesByUsage, CATEGORIES, isLikelyVatInclusive)
    - 03-02  # panel.ts foundation (createPanel, buildSubmissionForItem, submitAllWithDelay)
    - 01-01  # types.ts (ExpenseRule, SuspenseItem)
    - 01-02  # rules-store.ts (addRule, getRules, recordRuleUsage)
    - 02-01  # vendor-extractor.ts (extractVendor)
    - 02-02  # ck-api.ts (submitExpense), expense-engine.ts (validateVat)
  provides:
    - Unmatched item inline assignment form (UNMT-01 through UNMT-05)
    - buildRuleFromForm() exported function
    - getTopCategories() exported function
    - submitUnmatched() exported function
  affects:
    - ui/panel.ts (adds 3 new exports + 2 internal DOM renderers)
    - ui/panel.css (adds inline form styles, ~175 lines)
    - tests/panel.test.ts (adds 16 new tests)
tech_stack:
  added: []
  patterns:
    - TDD (RED-GREEN) for all new exported functions
    - Shadow DOM CSS with explicit all-initial reset consideration
    - Form state toggle via CSS class (.ck-form-open) not JS display
key_files:
  created: []
  modified:
    - ui/panel.ts
    - ui/panel.css
    - tests/panel.test.ts
decisions:
  - "renderInlineForm() uses .ck-form-open class toggle on row to show/hide form — no JS display manipulation, consistent with .ck-expanded pattern from Plan 02"
  - "submitUnmatched() always skips addRule() in dryRun mode — consistent with matched items dry-run (no side effects in preview)"
  - "getTopCategories() sums matchCount per nominalId across all rules — multiple rules for same category compound their usage"
  - "VAT hint shown immediately if isLikelyVatInclusive(item.amount) at render time — not reactive to user input"
metrics:
  duration: 8
  completed_date: "2026-04-03"
  tasks_completed: 2
  files_modified: 3
---

# Phase 3 Plan 3: Unmatched Items Inline Assignment Form Summary

Inline assignment form for unmatched suspense items with vendor pre-fill, category sorting by usage, VAT divisibility hint, and save-as-rule flow with editable match pattern.

## What Was Built

### New Exports (ui/panel.ts)

**`buildRuleFromForm(vendor, nominalId, description, hasVat, vatAmount, matchPattern): ExpenseRule`**
Creates a complete ExpenseRule from inline form values. Generates a UUID via crypto.randomUUID() with Math.random() fallback. Sets vatAmount=null when hasVat=false regardless of input.

**`getTopCategories(rules: ExpenseRule[]): string[]`**
Returns all 20 NominalIds sorted by usage frequency (sum of matchCount per nominalId across all rules). Falls back to DEFAULT_TOP_CATEGORIES ordering when no usage data exists. No duplicates.

**`submitUnmatched(item, claimId, dryRun, formEl, rules, onSuccess): Promise<void>`**
End-to-end handler for inline form submission:
- Reads form values from named inputs in formEl
- Validates reason (required) and VAT (via validateVat()) before submitting
- Skips submitExpense in dryRun mode
- Calls addRule() post-submission when saveAsRule is checked
- Shows errors in .ck-form-error div; calls onSuccess() on success

### Internal DOM Renderers (ui/panel.ts)

**`renderInlineForm(item, claimId, dryRun, rules, rowEl): HTMLElement`**
Builds the .ck-inline-form element with:
- Category `<select>` populated from `getTopCategories()` (Subscriptions selected by default)
- Reason text input (required)
- Vendor text input pre-filled from `extractVendor(item.description)`
- Has VAT checkbox that enables/disables VAT Amount field
- VAT Amount input with divisibility hint ("This amount may include 20% VAT (£X.XX)") shown when `isLikelyVatInclusive(item.amount)` is true
- Save as rule checkbox (checked by default) with editable match pattern input pre-filled from `deriveMatchPattern(vendor)`
- Cancel/Submit action buttons

**`renderUnmatchedRow(item, claimId, dryRun, rules): HTMLElement`**
Replaces the Plan 02 placeholder. Shows date, amount, short description (40 chars) with amber [Assign & Submit] button. Toggles .ck-form-open class on click to show/hide inline form. On success: collapses form and applies green success state via applySuccessState().

### CSS (ui/panel.css)

Added 175 lines of inline form styles (see `.ck-inline-form`, `.ck-form-row`, `.ck-form-checkbox-row`, `.ck-vat-hint`, `.ck-save-rule-section`, `.ck-match-pattern-row`, `.ck-form-error`, `.ck-form-actions`, `.ck-form-submit-btn`, `.ck-form-cancel-btn`, `.ck-assign-btn`, `.ck-unmatched-row`).

All styles follow the shadow-root `all: initial` constraint — explicit declarations for display, box-sizing, and font properties throughout.

## Tests

Added 16 new tests to tests/panel.test.ts:
- `buildRuleFromForm`: 4 tests (no-VAT case, VAT case, hasVat=false nullifies vatAmount, unique IDs)
- `getTopCategories`: 5 tests (all 20 IDs returned, DEFAULT_TOP_CATEGORIES fallback, matchCount ordering, undefined=0, no duplicates)
- `submitUnmatched`: 7 tests (submitExpense called, dry-run skips, addRule on save, no addRule without save, reason required, VAT validation, onSuccess called)

Full suite: 143 tests across 6 files, all passing.

## Deviations from Plan

None — plan executed exactly as written.

## Commits

| Hash | Message |
|------|---------|
| 92e695f | feat(03-03): implement unmatched item logic with inline form |
| cd1eaba | feat(03-03): add inline form CSS for unmatched item assignment |

## Self-Check: PASSED

- ui/panel.ts: FOUND
- ui/panel.css: FOUND
- tests/panel.test.ts: FOUND
- commit 92e695f: FOUND
- commit cd1eaba: FOUND
