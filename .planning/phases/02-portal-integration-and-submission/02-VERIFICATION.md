---
phase: 02-portal-integration-and-submission
verified: 2026-04-03T11:00:00Z
status: passed
score: 8/8 must-haves verified
re_verification: false
---

# Phase 2: Portal Integration and Submission — Verification Report

**Phase Goal:** The extension can read all suspense items from the CK DataTable and submit a single expense via fetch() POST with correct error detection
**Verified:** 2026-04-03T11:00:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Extension programmatically triggers Payment Type = 'Business account' and 'Map to Suspense Items' checkbox, causing the DataTable to appear | VERIFIED | `triggerPaymentTypeAndSuspenseItems()` in `lib/ck-api.ts` lines 37–48: `$('[name="ExpensePaymentTypeId"]').val('2').trigger('change')` and `$('[name="IsMappedToSuspenseItems"]').filter(':checkbox').prop('checked', true).trigger('change')` |
| 2 | Extension reads all suspense item rows (including paginated ones shown after page.len(-1)) and returns structured SuspenseItem array | VERIFIED | `readSuspenseItems()` at line 105 calls `dt.page.len(-1).draw(false)` then iterates `dt.rows().every(...)`, builds `SuspenseItem` objects with id, date, isoDate, description, amount |
| 3 | If an error occurs during row iteration, the form is left in clean state (no selected rows, MappedSuspenseItemIds empty) | VERIFIED | `try { ... } finally { dt.rows().deselect(); ($('#MappedSuspenseItemIds') as any).val(''); }` at lines 126–154. `deselect` appears at lines 129 (loop) and 152 (finally) |
| 4 | If the DataTable is not present after 5 seconds, readSuspenseItems throws a typed timeout error rather than hanging | VERIFIED | `waitForDataTable(5000)` at line 80–83: `reject(new Error('TIMEOUT: DataTable #DataTables_Table_1 did not appear within ' + timeoutMs + 'ms'))` |
| 5 | A single expense POST uses application/x-www-form-urlencoded content-type, credentials: 'same-origin', and the correct claimId in the URL | VERIFIED | `submitExpense()` at lines 277–293: `fetch('/ExpenseItems/Create?claimId=${submission.claimId}', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, credentials: 'same-origin' })` |
| 6 | A successful submission (PRG redirect back to expense page) returns { success: true } | VERIFIED | `parseSubmissionResponse()` at lines 241–243: `if (response.redirected) { return { success: true }; }` (after session expiry already screened out) |
| 7 | A validation failure (HTTP 200 with .validation-summary-errors in body) returns { success: false, error: 'VALIDATION_ERROR', validationMessages: [...] } | VERIFIED | `parseSubmissionResponse()` lines 247–252; `parseValidationErrors()` uses DOMParser to extract `.validation-summary-errors li` and `.field-validation-error`; 5 unit tests covering this path pass |
| 8 | Session expiry (redirect to a URL containing /Login or /Account/) returns { success: false, error: 'SESSION_EXPIRED' } | VERIFIED | `detectSessionExpiry()` at lines 214–222; `parseSubmissionResponse()` returns `{ success: false, error: 'SESSION_EXPIRED' }` at line 238–240; 5 unit tests for detectSessionExpiry pass |

**Score:** 8/8 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/ck-api.ts` | readSuspenseItems, parseDateToISO, parseAmount, submitExpense, parseValidationErrors, detectSessionExpiry | VERIFIED | All 6 exports present; 294 lines, substantive implementation |
| `lib/types.ts` | SubmissionResult interface and CkApiError type | VERIFIED | Lines 58–69: `CkApiError` union type and `SubmissionResult` interface both exported |
| `tests/ck-api.test.ts` | Unit tests for all pure helper functions | VERIFIED | 18 test cases across parseDateToISO, parseAmount, parseValidationErrors, detectSessionExpiry |
| `entrypoints/ck-portal.content.ts` | Wires readSuspenseItems() call after jQuery confirmed, logs results | VERIFIED | Import at line 4; claimId extracted at lines 23–28; `readSuspenseItems(claimId)` called at line 32 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `lib/ck-api.ts` | `window.$('#DataTables_Table_1').DataTable()` | `window as any` / MAIN world | VERIFIED | `const win = window as any; const $ = win.$;` appears in both `triggerPaymentTypeAndSuspenseItems()` and `readSuspenseItems()` |
| `lib/ck-api.ts` | `lib/types.ts` | `import type { SuspenseItem, SubmissionResult, ExpenseSubmission }` | VERIFIED | Line 5: `import type { SuspenseItem, SubmissionResult, ExpenseSubmission } from './types';` |
| `lib/ck-api.ts submitExpense` | `/ExpenseItems/Create?claimId={id}` | `fetch()` with `credentials: 'same-origin'` | VERIFIED | Lines 282–287; `credentials: 'same-origin'` confirmed at line 287 |
| `lib/ck-api.ts parseSubmissionResponse` | `response.redirected + response.url` | fetch Response API | VERIFIED | `response.redirected` checked at lines 238 and 241; `response.url` used indirectly via `detectSessionExpiry()` |
| `entrypoints/ck-portal.content.ts` | `lib/ck-api.ts` | `import { readSuspenseItems }` | VERIFIED | Line 4: `import { readSuspenseItems } from '../lib/ck-api';`; called at line 32 |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| PORT-02 | 02-01-PLAN.md | Extension programmatically sets Payment Type to "Business account" and ticks "Map to Suspense Items" to reveal the DataTable | SATISFIED | `triggerPaymentTypeAndSuspenseItems()` in `lib/ck-api.ts` lines 37–48 |
| PORT-03 | 02-01-PLAN.md | Extension reads all suspense items from the DataTable (ID, date, description, amount) with try/finally cleanup | SATISFIED | `readSuspenseItems()` with `dt.page.len(-1)`, row iteration, and `finally` cleanup at lines 105–157 |
| PORT-04 | 02-02-PLAN.md | Extension submits expenses via fetch() POST with correct ASP.NET form encoding (including checkbox double-field pattern) | SATISFIED | `submitExpense()` calls `buildPayload()` (which handles checkbox double-field encoding) and posts via `fetch()` at lines 277–293 |
| PORT-05 | 02-02-PLAN.md | Extension parses response body for ASP.NET validation errors (not just HTTP status) | SATISFIED | `parseValidationErrors()` uses DOMParser to query `.validation-summary-errors li` and `.field-validation-error` at lines 175–196 |
| PORT-06 | 02-02-PLAN.md | Extension detects session expiry (redirect to login page) and notifies user gracefully | SATISFIED | `detectSessionExpiry()` checks `response.redirected` + URL pattern at lines 214–222; surfaces `SESSION_EXPIRED` error from `parseSubmissionResponse()` |

### Anti-Patterns Found

No anti-patterns detected across all modified files.

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | — | — | — |

Specific checks:
- No `TODO/FIXME/PLACEHOLDER` comments in `lib/ck-api.ts`
- No `return null`, `return {}`, `return []` empty stubs in any exported function
- No `browser.*` or `chrome.*` extension API usage in `lib/ck-api.ts` (only a comment referencing them)
- No `console.log`-only implementations

### Human Verification Required

The following behaviours cannot be verified by static analysis and require manual testing on the live CK portal:

#### 1. DataTable Trigger Sequence

**Test:** Navigate to `https://portal.churchill-knight.co.uk/ExpenseItems/Create?claimId={id}` with a real account. Load the extension, observe the console.
**Expected:** Console shows "Reading suspense items for claimId: {id}" followed by "Read N suspense items" with the actual items array logged.
**Why human:** The jQuery trigger sequence (`val('2').trigger('change')` then checkbox `.trigger('change')`) must cause the CK portal's own JS handlers to reveal the DataTable. Cannot be tested without a live authenticated session.

#### 2. MutationObserver DataTable Detection

**Test:** On the CK portal with the DataTable not yet present on page load, verify the MutationObserver fires and resolves rather than timing out.
**Expected:** Items are read within ~1 second of page load; no TIMEOUT error in console.
**Why human:** MutationObserver fires only on actual DOM mutations from the portal's jQuery handlers — cannot simulate in unit tests.

#### 3. fetch() POST Submission

**Test:** Use the browser DevTools Network tab to inspect the POST request when `submitExpense()` is called.
**Expected:** Request to `/ExpenseItems/Create?claimId={id}` with `Content-Type: application/x-www-form-urlencoded`, session cookie forwarded, all form fields present including double-field checkbox pattern (`HasVatReceipt=false&HasVatReceipt=false`).
**Why human:** The `buildPayload()` / `credentials: 'same-origin'` chain can only be verified against the live portal. Unit tests cover the logic but not the actual network request.

#### 4. Validation Error Surface

**Test:** Attempt to submit an expense with a VAT amount exceeding 20% of net amount.
**Expected:** Submission returns `{ success: false, error: 'VALIDATION_ERROR', validationMessages: ['The VAT amount is too high.'] }` (or similar portal message).
**Why human:** The exact HTML structure of the portal's validation error response must match the DOMParser selectors at runtime.

#### 5. Session Expiry Detection

**Test:** Let the CK portal session expire (log out or wait), then attempt a `submitExpense()` call.
**Expected:** Returns `{ success: false, error: 'SESSION_EXPIRED' }` and the console shows an appropriate error.
**Why human:** Session expiry redirect URL pattern must match `/login` or `/account/` at runtime.

### Build and Test Results

| Check | Result |
|-------|--------|
| `npx vitest run` | 65/65 tests passing (4 test files) |
| `./node_modules/.bin/tsc --noEmit` | Exit 0 — no TypeScript errors |
| `npx wxt build` | Exit 0 — 8.18 kB extension built successfully |
| `grep -c "deselect" lib/ck-api.ts` | 2 (loop body line 129 + finally block line 152) |
| No extension API usage in ck-api.ts | Confirmed — only comment mentions `browser.*`/`chrome.*` |
| 18 test cases in ck-api.test.ts | Confirmed — exceeds 13 minimum |

### Gaps Summary

No gaps found. All 8 observable truths are verified. All 5 required artifacts exist, are substantive, and are correctly wired. Requirements PORT-02 through PORT-06 are all satisfied with direct implementation evidence. The 5 human verification items above are operational checks requiring a live CK portal session — they do not represent gaps in the implementation.

---

_Verified: 2026-04-03T11:00:00Z_
_Verifier: Claude (gsd-verifier)_
