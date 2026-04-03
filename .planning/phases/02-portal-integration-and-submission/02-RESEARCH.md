# Phase 2: Portal Integration and Submission - Research

**Researched:** 2026-04-03
**Domain:** jQuery DataTables programmatic interaction, MutationObserver DOM readiness, fetch() POST with ASP.NET MVC form encoding, response body validation error parsing, session expiry detection
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
None — all implementation choices are at Claude's discretion for this pure integration/infrastructure phase.

### Claude's Discretion
- MutationObserver timeout values for DataTable readiness
- Rate limiting between sequential POST submissions (400ms recommended)
- Response body parsing strategy for ASP.NET validation errors
- Session expiry detection method (redirect detection vs. response body check)
- ck-api.ts module API surface design
- Error types and error handling patterns

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PORT-02 | Extension programmatically sets Payment Type to "Business account" and ticks "Map to Suspense Items" to reveal the DataTable | jQuery `.val('2').trigger('change')` for Payment Type select, `.prop('checked', true).trigger('change')` for checkbox, MutationObserver on `#suspenseitems-table` parent container to detect DataTable insertion |
| PORT-03 | Extension reads all suspense items from the DataTable (ID, date, description, amount) with try/finally cleanup | `dt.page.len(-1).draw(false)` to show all rows, `dt.rows().every()` to iterate, row select/read/#MappedSuspenseItemIds pattern, `try/finally` with `dt.rows().deselect()` and `$('#MappedSuspenseItemIds').val('')` cleanup |
| PORT-04 | Extension submits expenses via fetch() POST with correct ASP.NET form encoding (including checkbox double-field pattern) | `buildPayload()` from Phase 1 produces correct URLSearchParams; `fetch('/ExpenseItems/Create?claimId=...', { method: 'POST', credentials: 'same-origin', body: payload.toString() })` |
| PORT-05 | Extension parses response body for ASP.NET validation errors (not just HTTP status) | ASP.NET MVC re-renders the form page with HTTP 200 on validation failure; response body contains `.validation-summary-errors` div and/or `.field-validation-error` spans; use `DOMParser` to detect these markers |
| PORT-06 | Extension detects session expiry (redirect to login page) and notifies user gracefully | `response.redirected === true` on fetch result; `response.url` will contain `/Account/Login` or similar; check both `response.redirected` and final URL pattern |
</phase_requirements>

---

## Summary

Phase 2 builds the `lib/ck-api.ts` module — the portal interaction layer that sits between the Phase 1 data layer and Phase 3 panel UI. It has two distinct responsibilities: (1) programmatically revealing and reading the suspense items DataTable, and (2) submitting individual expense forms via fetch() POST with reliable success/failure detection.

The DataTable trigger sequence is the most timing-sensitive part: the extension must set Payment Type = "Business account", tick the "Map to Suspense Items" checkbox, then wait for the DataTable to appear in the DOM before iterating rows. MutationObserver is the correct tool here — faster than polling and fires on the microtask queue. A combined MutationObserver + timeout pattern gives safety against the DataTable never appearing (e.g., no suspense items).

The submission response parsing is the most subtle problem. ASP.NET MVC returns HTTP 200 for BOTH successful form submissions (followed by a redirect to the same page, which fetch follows) AND validation failures (re-renders the form with error HTML). The naive check `response.ok` is useless. The correct strategy is: check `response.redirected` first (success path — the POST succeeded and server redirected), then on non-redirect 200, parse the response body HTML for `.validation-summary-errors` or `.field-validation-error` to detect server-side validation failures.

**Primary recommendation:** Implement `lib/ck-api.ts` as a pure async module with no side effects on import. Export `readSuspenseItems(claimId)` and `submitExpense(submission)` as the primary API. All DOM interaction assumes MAIN world context (access to page `window.$`).

---

## Standard Stack

### Core (existing from Phase 1)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | 5.7 | Type safety | Already established in project |
| WXT 0.20.20 | 0.20.20 | Build framework, MAIN world content scripts | Already established |
| jQuery (page global) | CK portal version | DataTables access | Available as `window.$` in MAIN world |
| DataTables (page global) | CK portal version | Suspense items table API | Available via `$('#DataTables_Table_1').DataTable()` |

### Browser APIs (no new packages needed)
| API | Purpose | Why |
|-----|---------|-----|
| `MutationObserver` | Detect DataTable DOM insertion | Native, microtask-based, faster than polling |
| `fetch()` | Submit form POST | Already specified in CLAUDE.md; uses session cookies via `credentials: 'same-origin'` |
| `DOMParser` | Parse HTML response body | Parse response HTML to query for validation error elements |

**No new packages required for Phase 2.** All necessary APIs are either already in the project or are native browser APIs available in the MAIN world content script context.

---

## Architecture Patterns

### Recommended Module Structure

```
lib/
└── ck-api.ts          # New: Portal interaction layer
                       # Exports: readSuspenseItems(), submitExpense()
                       # Depends on: types.ts, expense-engine.ts (buildPayload)
tests/
└── ck-api.test.ts     # Unit tests for parsable logic (parseValidationErrors, detectSessionExpiry)
                       # DOM-dependent functions are integration-tested manually
```

The content script integration point:
```
entrypoints/ck-portal.content.ts
  → imports lib/ck-api.ts
  → calls readSuspenseItems(claimId) after jQuery confirmed present
  → calls submitExpense(submission) for each matched item
```

### Pattern 1: MutationObserver-Based DataTable Readiness

**What:** Observe the form container for DataTable DOM insertion after triggering Payment Type and Suspense Items checkbox. Disconnect on detection OR timeout.

**When to use:** Replacing the polling approach used for jQuery detection in Phase 1. MutationObserver fires on the microtask queue — more reliable timing.

**Why MutationObserver over polling:** The DataTable `#DataTables_Table_1` is inserted into the DOM by the CK portal's JavaScript in response to the Payment Type change event. This is a DOM mutation. MutationObserver fires synchronously after the mutation is committed (microtask), whereas `setInterval` polling introduces up to 100ms lag per check.

**Example:**
```typescript
// Source: MDN MutationObserver + CLAUDE.md DataTable specs
function waitForDataTable(timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const win = window as any;
    const $ = win.$;

    // Check if already present (e.g., form revisit)
    if ($(DataTables_Table_1).length > 0) {
      resolve();
      return;
    }

    let timer: ReturnType<typeof setTimeout>;

    const observer = new MutationObserver(() => {
      if ($(DataTables_Table_1).length > 0) {
        observer.disconnect();
        clearTimeout(timer);
        resolve();
      }
    });

    // Observe the form or body for subtree changes
    observer.observe(document.body, { childList: true, subtree: true });

    timer = setTimeout(() => {
      observer.disconnect();
      reject(new Error(`DataTable #DataTables_Table_1 did not appear within ${timeoutMs}ms`));
    }, timeoutMs);
  });
}
```

**Recommended timeout:** 5000ms. The CK portal DataTable loads synchronously from DOM manipulation (not AJAX), so 5 seconds is very generous. If the DataTable hasn't appeared in 5 seconds, the portal behavior has changed or there are no suspense items to show.

### Pattern 2: Payment Type Trigger Sequence

**What:** Programmatically set the Payment Type select to value `2` (Business account) and trigger the portal's change event handler to reveal the Suspense Items checkbox.

**When to use:** Must fire before checking for the DataTable. The DataTable only appears after BOTH the Payment Type and Suspense Items checkbox are set.

**Critical:** The CK portal's form uses jQuery event handlers. Setting `.val()` alone does NOT trigger the handler — must call `.trigger('change')`. This is documented jQuery behavior: programmatic value changes do not fire DOM events automatically.

**Example:**
```typescript
// Source: jQuery API docs + CLAUDE.md form field specs
function triggerPaymentTypeAndSuspenseItems(): void {
  const win = window as any;
  const $ = win.$;

  // Step 1: Set Payment Type to "Business account" (value: "2")
  // Must trigger 'change' event for the portal's handler to fire
  $('[name="ExpensePaymentTypeId"]').val('2').trigger('change');

  // Step 2: Tick "Map to Suspense Items" checkbox
  // Portal shows the DataTable only after this is checked
  $('[name="IsMappedToSuspenseItems"]').filter(':checkbox').prop('checked', true).trigger('change');
}
```

**Note on IsMappedToSuspenseItems:** The ASP.NET form has two inputs with this name (checkbox + hidden). Target only the checkbox with `.filter(':checkbox')`.

### Pattern 3: DataTable Row Iteration with try/finally Cleanup

**What:** Expand the DataTable to show all rows, iterate using the DataTables API to extract ID/date/description/amount, then always clean up regardless of success or error.

**When to use:** Called after `waitForDataTable()` resolves.

**Critical:** The row iteration pattern selects each row to read the hidden `#MappedSuspenseItemIds` field value — this is how the portal encodes the suspense item ID into the DOM. The try/finally block MUST always deselect all rows and clear `#MappedSuspenseItemIds` to avoid leaving the form in a dirty state.

**Example:**
```typescript
// Source: CLAUDE.md — "Reading suspense item IDs programmatically" section
function iterateSuspenseItems(): SuspenseItem[] {
  const win = window as any;
  const $ = win.$;
  const dt = $(`#DataTables_Table_1`).DataTable();
  const items: SuspenseItem[] = [];

  // Expand to all rows (pass false to draw() to avoid visual flicker)
  dt.page.len(-1).draw(false);

  try {
    dt.rows().every(function(this: any, rowIdx: number) {
      // Deselect all, select only this row to populate #MappedSuspenseItemIds
      dt.rows().deselect();
      dt.row(rowIdx).select();

      const suspenseId = $(`#MappedSuspenseItemIds`).val() as string;
      if (!suspenseId) return; // Skip if selection didn't populate the field

      const rowNode = dt.row(rowIdx).node() as HTMLTableRowElement;
      const cells = rowNode.querySelectorAll('td');
      // Cell order from CLAUDE.md: checkbox, date, description, amount
      const dateText = cells[1]?.textContent?.trim() ?? '';
      const description = cells[2]?.textContent?.trim() ?? '';
      const amountText = cells[3]?.textContent?.trim() ?? '';

      items.push({
        id: suspenseId,
        date: dateText,                           // dd/mm/yyyy
        isoDate: parseDateToISO(dateText),        // yyyy-mm-dd
        description,
        amount: parseAmount(amountText),
      });
    });
  } finally {
    // Always clean up — leave form in neutral state
    dt.rows().deselect();
    $(`#MappedSuspenseItemIds`).val('');
  }

  return items;
}
```

**Note:** `dt.page.len(-1).draw(false)` — the `false` argument to `draw()` prevents the DataTable from resetting the page position, which reduces visual disruption. The DataTables API documents `page.len(-1)` as "show all records, effectively disabling paging."

### Pattern 4: fetch() POST Submission

**What:** Submit a single expense item using the pre-built URLSearchParams payload from `buildPayload()`.

**When to use:** For each matched item to be submitted. Run sequentially with 400ms delay to avoid server rate limiting.

**Example:**
```typescript
// Source: CLAUDE.md — "Submitting via fetch" section
async function submitExpense(submission: ExpenseSubmission): Promise<SubmissionResult> {
  const payload = buildPayload(submission);

  const response = await fetch(
    `/ExpenseItems/Create?claimId=${submission.claimId}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: payload.toString(),
      credentials: 'same-origin',  // Use existing session cookies — no auth extraction needed
    }
  );

  return parseSubmissionResponse(response);
}
```

**Sequential submission with delay:**
```typescript
async function submitAll(submissions: ExpenseSubmission[]): Promise<SubmissionResult[]> {
  const results: SubmissionResult[] = [];
  for (const submission of submissions) {
    results.push(await submitExpense(submission));
    // 400ms between submissions — conservative rate limiting
    await new Promise(resolve => setTimeout(resolve, 400));
  }
  return results;
}
```

### Pattern 5: Response Body Validation Error Parsing

**What:** After fetch() POST, check for session expiry redirect and ASP.NET validation errors in the response body. HTTP 200 alone does NOT indicate success.

**Why complex:** ASP.NET MVC POST responses fall into three cases:
1. **Success:** POST accepted → server redirects → fetch follows redirect → `response.redirected === true`, `response.url` ends at the same ClaimId page
2. **Validation failure:** Server re-renders form with errors → HTTP 200 with error HTML containing `.validation-summary-errors` or `.field-validation-error`
3. **Session expiry:** Session expired → 302 to `/Account/Login` → fetch follows → `response.redirected === true`, `response.url` contains `/Login` or `/Account`

**Detection priority:**
1. Check `response.redirected` — if true, inspect `response.url`
   - URL contains `/Login` or `/Account` → session expired error
   - URL matches the original expense path → success (PRG pattern)
2. If not redirected, parse response body HTML for validation error markers

**Example:**
```typescript
// Source: MDN Response.redirected + ASP.NET MVC validation HTML conventions
async function parseSubmissionResponse(
  response: Response,
  claimId: string
): Promise<SubmissionResult> {
  // Case 1: Redirect occurred — check where it landed
  if (response.redirected) {
    const finalUrl = response.url;
    if (isLoginUrl(finalUrl)) {
      return { success: false, error: 'SESSION_EXPIRED' };
    }
    // Redirected back to the expense page — this is the PRG success pattern
    return { success: true };
  }

  // Case 2: HTTP 200 without redirect — must inspect body for validation errors
  const html = await response.text();
  const errors = parseValidationErrors(html);
  if (errors.length > 0) {
    return { success: false, error: 'VALIDATION_ERROR', validationMessages: errors };
  }

  // HTTP 200 without errors and without redirect — treat as success
  return { success: true };
}

function isLoginUrl(url: string): boolean {
  return url.includes('/Login') || url.includes('/Account/');
}

function parseValidationErrors(html: string): string[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const errors: string[] = [];

  // Check validation summary (ul inside .validation-summary-errors div)
  const summaryDiv = doc.querySelector('.validation-summary-errors');
  if (summaryDiv) {
    summaryDiv.querySelectorAll('li').forEach(li => {
      const text = li.textContent?.trim();
      if (text) errors.push(text);
    });
  }

  // Check field-level validation spans
  doc.querySelectorAll('.field-validation-error').forEach(span => {
    const text = span.textContent?.trim();
    if (text && !errors.includes(text)) errors.push(text);
  });

  return errors;
}
```

**Key insight — CSS classes confirmed from ASP.NET MVC conventions (MEDIUM confidence, verified against docs):**
- `.validation-summary-errors` — applied to the `<div>` wrapping the error summary `<ul>` when errors exist
- `.validation-summary-valid` — applied when no errors (typically `display: none`)
- `.field-validation-error` — applied to `<span>` elements with field-specific error messages
- `.field-validation-valid` — applied when the field is valid (no visible error text)

**Important:** These class names are ASP.NET MVC conventions, not portal-specific. The CK portal uses standard ASP.NET MVC scaffolding. However, the exact markup should be verified against a real failed submission response in a DevTools session (noted as a CONTEXT.md blocker for Phase 2).

### Pattern 6: SubmissionResult Type

The `lib/types.ts` file needs a new type for submission results. Add to Phase 1's types:

```typescript
// Add to lib/types.ts
export interface SubmissionResult {
  success: boolean;
  error?: 'SESSION_EXPIRED' | 'VALIDATION_ERROR' | 'NETWORK_ERROR' | string;
  validationMessages?: string[];
}
```

### Anti-Patterns to Avoid

- **Checking only `response.ok` for success:** ASP.NET returns HTTP 200 for validation failures. `response.ok` is always true on success AND failure. Must inspect body or `response.redirected`.
- **Using `redirect: 'manual'` on fetch:** This causes `response.type === 'opaqueredirect'` with no accessible body or final URL — makes session expiry detection impossible. Use the default `redirect: 'follow'`.
- **Triggering Payment Type programmatically without `.trigger('change')`:** Setting `.val()` alone won't fire the portal's jQuery event handlers. The DataTable will never appear.
- **Restoring pagination after iteration:** After `dt.page.len(-1).draw(false)`, don't bother restoring original page length — the full read is destructive of the visual state. A page reload (which happens after all submissions anyway) restores it.
- **Accessing `browser.*` from ck-api.ts:** This module runs from MAIN world context via the content script. No extension APIs. Any rule loading needed must be passed in, not fetched from storage inside this module.
- **Assuming DataTable tbody `tr` count equals suspense items:** DataTables can add header rows, empty state rows, or loading rows. Always use `dt.rows()` API to iterate data rows, not raw DOM `querySelectorAll('tr')`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Polling for DataTable readiness | `setInterval` loop checking `$('#DataTables_Table_1').length` | `MutationObserver` with timeout | MutationObserver fires on microtask queue, no polling interval lag |
| HTML error parsing | Custom regex on response body string | `DOMParser` + `.querySelector()` | DOMParser handles malformed HTML gracefully; querySelectors are reliable |
| Form payload construction | Inline URLSearchParams in ck-api.ts | `buildPayload()` from `lib/expense-engine.ts` | Already built and tested in Phase 1 |
| Session cookie extraction | Reading cookies manually | `credentials: 'same-origin'` on fetch | Browser handles cookie forwarding; manual extraction is error-prone and unnecessary |

**Key insight:** The browser's fetch API with `credentials: 'same-origin'` automatically forwards the authenticated session cookies. No token extraction, no custom auth headers, no cookie parsing needed. The extension simply reuses the user's existing login session.

---

## Common Pitfalls

### Pitfall 1: HTTP 200 False Positive (Critical)
**What goes wrong:** Extension reports success when the CK portal rejected the submission due to VAT validation or a missing field, because `response.status === 200` and `response.ok === true`.
**Why it happens:** ASP.NET MVC re-renders the form view with HTTP 200 when ModelState is invalid. The redirect (successful POST → PRG redirect) is followed by fetch automatically, resulting in a final 200 from the GET. A validation failure also returns 200. They look identical at the status level.
**How to avoid:** Check `response.redirected` first (true = successful PRG), then on non-redirected 200 parse the body for `.validation-summary-errors`.
**Warning signs:** Items appear "submitted" in the panel but still show in the CK portal expense table as pending.

### Pitfall 2: DataTable Not Appearing After Payment Type Set
**What goes wrong:** MutationObserver timeout fires; DataTable never appears.
**Why it happens:** Three sub-causes: (1) The Payment Type was already set to Business account before the content script ran, and no change event fires. (2) The "Map to Suspense Items" checkbox trigger didn't register. (3) There are zero suspense items — the CK portal may not show the DataTable when empty.
**How to avoid:** Before triggering, check if DataTable is already present. Use `$('#DataTables_Table_1').length > 0` as the first check before calling `triggerPaymentTypeAndSuspenseItems()`. If no items exist after triggering, return an empty array rather than erroring.
**Warning signs:** MutationObserver timeout error in content script; DataTable not visible in portal DOM.

### Pitfall 3: Row Iteration Leaves Form Dirty
**What goes wrong:** An error during iteration leaves `#MappedSuspenseItemIds` populated with the last-selected suspense ID. When the user manually interacts with the form afterward, that ID is pre-filled.
**Why it happens:** Missing try/finally — if `dt.row(rowIdx).select()` throws or `parseAmount` throws, cleanup code after the loop never runs.
**How to avoid:** Always wrap iteration body in try/finally. The finally block MUST call `dt.rows().deselect()` and `$('#MappedSuspenseItemIds').val('')`.
**Warning signs:** Duplicate expense submissions; incorrect suspense item IDs in manual form fills.

### Pitfall 4: jQuery Selector Ambiguity for IsMappedToSuspenseItems
**What goes wrong:** `$('[name="IsMappedToSuspenseItems"]').prop('checked', true)` targets both the checkbox AND the hidden input, causing unexpected behavior.
**Why it happens:** ASP.NET MVC double-field pattern emits two inputs with the same name. jQuery's name selector matches both.
**How to avoid:** Always filter to the checkbox type: `$('[name="IsMappedToSuspenseItems"]').filter(':checkbox')`.
**Warning signs:** Both inputs report `.prop('checked', true)`; DataTable does not appear.

### Pitfall 5: Session Expiry Not Detected on First Submission
**What goes wrong:** The first fetch POST redirects to login, `parseSubmissionResponse` reports success because `response.redirected === true` and the URL check isn't tight enough.
**Why it happens:** The CK portal login URL may be `/Account/Login` or `/Login` — check both patterns. Also consider that after session expiry, the portal might redirect to a different domain or subdomain.
**How to avoid:** Check `response.url` against both `/Login` (case-insensitive) and `/Account/` patterns. Additionally, check `response.url` still starts with `https://portal.churchill-knight.co.uk/` — if it doesn't, that's definitely not a success redirect.
**Warning signs:** All submissions report "success" but expense items don't appear in CK portal; user is redirected to login page on next navigation.

### Pitfall 6: draw(false) vs draw() When Paginating
**What goes wrong:** `dt.page.len(-1).draw()` resets the scroll position or triggers additional AJAX calls on the portal.
**Why it happens:** `.draw()` without arguments defaults to resetting pagination to page 1. `.draw(false)` preserves the current display state.
**How to avoid:** Always use `dt.page.len(-1).draw(false)` for the expand-all operation. The DataTables API documents `false` as "do not reset current paging position."
**Warning signs:** Visual flicker; scroll jumps to top of table during iteration.

---

## Code Examples

Verified patterns from official sources and CLAUDE.md specification:

### Complete ck-api.ts API Surface
```typescript
// lib/ck-api.ts — MAIN world only, no extension APIs
// Source: CLAUDE.md specs + MDN fetch/MutationObserver + DataTables API docs

export type CkApiError = 'SESSION_EXPIRED' | 'VALIDATION_ERROR' | 'NETWORK_ERROR' | 'TIMEOUT' | 'DATATABLE_NOT_FOUND';

export interface SubmissionResult {
  success: boolean;
  error?: CkApiError | string;
  validationMessages?: string[];
}

// Reveals the DataTable and reads all suspense items.
// Assumes MAIN world context (window.$ is available).
export async function readSuspenseItems(claimId: string): Promise<SuspenseItem[]>

// Submits a single expense via fetch() POST.
// Returns structured result with error discrimination.
export async function submitExpense(submission: ExpenseSubmission): Promise<SubmissionResult>
```

### MutationObserver Pattern with Timeout
```typescript
// Source: MDN MutationObserver documentation
function waitForElement(selector: string, timeoutMs: number): Promise<Element> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(selector);
    if (existing) { resolve(existing); return; }

    let timer: ReturnType<typeof setTimeout>;
    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        clearTimeout(timer);
        resolve(el);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    timer = setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Element "${selector}" not found within ${timeoutMs}ms`));
    }, timeoutMs);
  });
}
```

### Response Validation Error Parsing (testable pure function)
```typescript
// Source: ASP.NET MVC validation HTML conventions + MDN DOMParser
// This function is pure — takes HTML string, returns error strings.
// Can be fully unit-tested without browser or network.
export function parseValidationErrors(html: string): string[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const errors: string[] = [];

  // Validation summary container (div with .validation-summary-errors)
  const summaryDiv = doc.querySelector('.validation-summary-errors');
  if (summaryDiv) {
    summaryDiv.querySelectorAll('li').forEach(li => {
      const text = li.textContent?.trim();
      if (text) errors.push(text);
    });
  }

  // Individual field validation spans
  doc.querySelectorAll('.field-validation-error').forEach(span => {
    const text = span.textContent?.trim();
    if (text && !errors.includes(text)) errors.push(text);
  });

  return errors;
}
```

### Session Expiry Detection
```typescript
// Source: MDN Response.redirected + Response.url documentation
export function detectSessionExpiry(response: Response): boolean {
  if (!response.redirected) return false;
  const url = response.url.toLowerCase();
  // Session expired redirects leave the portal domain or hit the login path
  return (
    url.includes('/login') ||
    url.includes('/account/') ||
    !url.startsWith('https://portal.churchill-knight.co.uk/')
  );
}
```

### dd/mm/yyyy to ISO Date Conversion
```typescript
// Source: CLAUDE.md SuspenseItem interface (date format spec)
// DataTable renders dates as dd/mm/yyyy; SuspenseItem.isoDate requires yyyy-mm-dd
export function parseDateToISO(ddmmyyyy: string): string {
  const [day, month, year] = ddmmyyyy.split('/');
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}
```

### Amount Parsing from DataTable Cell
```typescript
// Source: CLAUDE.md form fields (GrossAmountPaid is a decimal number)
// DataTable may render as "£18.67" or "18.67" — strip currency symbol
export function parseAmount(text: string): number {
  const cleaned = text.replace(/[^0-9.]/g, '');
  return parseFloat(cleaned) || 0;
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `setInterval` polling for DOM elements | `MutationObserver` + timeout | Chrome 26+ (widely supported 2014+) | Microtask-based, no polling lag, auto-disconnects on success |
| Check `response.status` for success | Check `response.redirected` + body parsing | fetch API standard (2015+) | Required for PRG pattern — ASP.NET always 200s on both success and failure |
| `response.type === 'opaqueredirect'` (manual redirect) | Default `redirect: 'follow'` + check `response.url` | fetch API design | Opaque redirect mode loses access to final URL and body — unusable for session detection |
| Manual regex on HTML strings | `DOMParser` + DOM queries | Standard web API | DOMParser handles malformed HTML gracefully; querySelectors are precise |

**Deprecated/outdated:**
- `XMLHttpRequest` for form submission: Replaced by `fetch()` with credentials. Both work but fetch is cleaner and async-native.
- `Mutation Events` (DOMNodeInserted etc.): Deprecated in all browsers, replaced by MutationObserver.

---

## Open Questions

1. **Exact validation error CSS classes in CK portal response**
   - What we know: Standard ASP.NET MVC uses `.validation-summary-errors` and `.field-validation-error`
   - What's unclear: The CK portal may use a custom theme that renames or extends these classes
   - Recommendation: As noted in STATE.md — "Capture a real failed submission response to identify exact ASP.NET error markers before writing the parser." The parser should be written with the standard classes but a manual DevTools verification pass should confirm before Phase 3. The CLAUDE.md spec notes the VAT validation rule which can be used to deliberately trigger a validation error.

2. **Exact DOM selector for triggering Payment Type select**
   - What we know: Field name is `ExpensePaymentTypeId` from CLAUDE.md form spec
   - What's unclear: Whether the actual DOM uses `name="ExpensePaymentTypeId"`, `id="ExpensePaymentTypeId"`, or both
   - Recommendation: Use `$('[name="ExpensePaymentTypeId"]')` as the selector — name attributes are specified in CLAUDE.md and are authoritative for form POST fields. If this doesn't work, fall back to `$('#ExpensePaymentTypeId')`.

3. **DataTable readiness timeout value**
   - What we know: The DataTable loads from DOM manipulation (not AJAX) after Payment Type change
   - What's unclear: Empirical timing on the live portal
   - Recommendation: 5000ms is generous for a synchronous DOM manipulation. If the live portal is slow to initialize DataTables, this can be increased. The STATE.md blocker note says "Empirical validation of MutationObserver timeout values needed on live portal."

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.2 |
| Config file | `vitest.config.ts` (exists from Phase 1) |
| Quick run command | `npx vitest run` |
| Full suite command | `npx vitest run --coverage` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PORT-02 | Payment Type + checkbox trigger reveals DataTable | manual | Manual verification on live CK portal | ❌ manual-only |
| PORT-03 | Row iteration returns correct SuspenseItem shape + cleanup | manual | Manual verification on live CK portal | ❌ manual-only |
| PORT-03 | `parseDateToISO` converts dd/mm/yyyy to yyyy-mm-dd | unit | `npx vitest run tests/ck-api.test.ts` | ❌ Wave 0 |
| PORT-03 | `parseAmount` strips currency symbols and returns float | unit | `npx vitest run tests/ck-api.test.ts` | ❌ Wave 0 |
| PORT-04 | fetch POST uses correct content-type and credentials | manual | Manual DevTools network inspection | ❌ manual-only |
| PORT-05 | `parseValidationErrors` detects `.validation-summary-errors` ul items | unit | `npx vitest run tests/ck-api.test.ts` | ❌ Wave 0 |
| PORT-05 | `parseValidationErrors` detects `.field-validation-error` spans | unit | `npx vitest run tests/ck-api.test.ts` | ❌ Wave 0 |
| PORT-05 | `parseValidationErrors` returns empty array for success HTML | unit | `npx vitest run tests/ck-api.test.ts` | ❌ Wave 0 |
| PORT-06 | `detectSessionExpiry` returns true when URL contains /Login | unit | `npx vitest run tests/ck-api.test.ts` | ❌ Wave 0 |
| PORT-06 | `detectSessionExpiry` returns false for portal domain redirect | unit | `npx vitest run tests/ck-api.test.ts` | ❌ Wave 0 |

**Manual-only justification for PORT-02, PORT-03 (DOM parts), PORT-04:** These depend on the live CK portal's jQuery/DataTables instance and the actual session cookie. They cannot be unit-tested without the live portal. The pure helper functions within them (parseDateToISO, parseAmount) are fully testable.

### Sampling Rate
- **Per task commit:** `npx vitest run`
- **Per wave merge:** `npx vitest run --coverage`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/ck-api.test.ts` — covers PORT-05 (parseValidationErrors), PORT-06 (detectSessionExpiry), PORT-03 helpers (parseDateToISO, parseAmount)
- [ ] Add `SubmissionResult` type to `lib/types.ts`

*(Existing test infrastructure from Phase 1 covers all other requirements. Only ck-api.test.ts is new.)*

---

## Sources

### Primary (HIGH confidence)
- CLAUDE.md — DataTable ID (`#DataTables_Table_1`), form field names, row iteration pattern, fetch POST spec, VAT validation rule, ASP.NET checkbox pattern, suspense item description format
- [MDN MutationObserver](https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver) — observe() options, disconnect(), microtask timing
- [MDN Response.redirected](https://developer.mozilla.org/en-US/docs/Web/API/Response/redirected) — boolean property, recommendation to use `redirect: 'follow'` + check `response.url`
- [MDN DOMParser](https://developer.mozilla.org/en-US/docs/Web/API/DOMParser) — parseFromString('text/html'), querySelector on parsed document
- [DataTables page.len(-1)](https://datatables.net/reference/api/page.len()) — -1 disables pagination ("show all records")
- [DataTables row().select()](https://datatables.net/reference/api/row().select()) — programmatic row selection, Select extension requirement

### Secondary (MEDIUM confidence)
- [ASP.NET MVC validation HTML conventions — dotnettutorials.net](https://dotnettutorials.net/lesson/validation-message-validation-summary-mvc/) — `.validation-summary-errors`, `.validation-summary-valid`, `.field-validation-error`, `.field-validation-valid` class names confirmed
- [jQuery .trigger() documentation](https://api.jquery.com/trigger/) — programmatic value changes don't fire DOM events; must call `.trigger('change')` explicitly
- [jQuery .val() documentation](https://api.jquery.com/change/) — change event not fired by programmatic `.val()` changes

### Tertiary (LOW confidence — verify on live portal)
- ASP.NET MVC PRG (Post-Redirect-Get) pattern — server redirects on success, re-renders on failure. CK portal likely follows this standard pattern but has not been confirmed via live network capture.
- Exact CSS class names in CK portal validation response HTML — standard ASP.NET MVC classes assumed; needs live portal DevTools verification.

---

## Metadata

**Confidence breakdown:**
- DataTable interaction patterns: HIGH — specified verbatim in CLAUDE.md with exact selectors and API calls
- MutationObserver pattern: HIGH — MDN primary source, widely established API
- fetch() POST submission: HIGH — CLAUDE.md specifies exact endpoint, credentials, and content-type
- Response body parsing (CSS class names): MEDIUM — ASP.NET MVC conventions confirmed from multiple doc sources; exact CK portal markup needs live verification
- Session expiry detection via response.redirected + URL: HIGH — MDN primary source confirms behavior

**Research date:** 2026-04-03
**Valid until:** 2026-05-03 (stable APIs; CK portal HTML structure could change — verify on live portal before Phase 3)
