// lib/ck-api.ts
// Portal interaction layer — MAIN world only. No extension APIs (no browser.*, no chrome.*).
// Assumes window.$ (jQuery) and DataTables are available on the page.

import type { SuspenseItem, SubmissionResult, ExpenseSubmission } from './types';
import { buildPayload } from './expense-engine';

// Re-export SubmissionResult so callers can import from a single module
export type { SubmissionResult };

/**
 * Convert a date string to yyyy-mm-dd ISO format.
 * Supports:
 *   - dd/mm/yyyy  → '13/03/2026' → '2026-03-13'
 *   - dd Mon yyyy → '13 Mar 2026' → '2026-03-13'
 */
export function parseDateToISO(dateStr: string): string {
  const MONTHS: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  };

  // Try "dd Mon yyyy" format first (e.g. "13 Mar 2026")
  const longMatch = dateStr.trim().match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (longMatch) {
    const [, day, mon, year] = longMatch;
    const month = MONTHS[mon.toLowerCase()] ?? '01';
    return `${year}-${month}-${day.padStart(2, '0')}`;
  }

  // Fallback to "dd/mm/yyyy" format
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const [day, month, year] = parts;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Last resort: try Date.parse
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0];
  }

  return dateStr; // return as-is if unparseable
}

/**
 * Convert a date string to dd/mm/yyyy format for form submission.
 * Handles the same inputs as parseDateToISO.
 * Example: '13 Mar 2026' → '13/03/2026', '13/03/2026' → '13/03/2026'
 */
export function parseDateToDDMMYYYY(dateStr: string): string {
  const iso = parseDateToISO(dateStr);
  const [year, month, day] = iso.split('-');
  if (year && month && day) {
    return `${day}/${month}/${year}`;
  }
  return dateStr;
}

/**
 * Parse a currency/amount string to a positive float.
 * Strips currency symbols and sign, returns absolute value.
 * Example: '£-24.99' → 24.99, '£18.67' → 18.67, '$25.00' → 25.00
 */
export function parseAmount(text: string): number {
  const cleaned = text.replace(/[^0-9.\-]/g, '');
  return Math.abs(parseFloat(cleaned) || 0);
}

/**
 * Programmatically set Payment Type = "Business account" (value: "2") and
 * tick the "Map to Suspense Items" checkbox to reveal the suspense items DataTable.
 *
 * IMPORTANT: Must call .trigger('change') after each programmatic value change —
 * the CK portal uses jQuery event handlers that do not fire on silent .val()/.prop() calls.
 */
function triggerPaymentTypeAndSuspenseItems(): void {
  const win = window as any;
  const $ = win.$;

  // Step 1: Set Payment Type to "Business account" (value: "2")
  $('[name="ExpensePaymentTypeId"]').val('2').trigger('change');

  // Step 2: Tick "Map to Suspense Items" checkbox.
  // Filter to :checkbox only — ASP.NET MVC emits two inputs with the same name
  // (checkbox + hidden fallback). We must target only the visible checkbox.
  $('[name="IsMappedToSuspenseItems"]').filter(':checkbox').prop('checked', true).trigger('change');
}

/**
 * Wait for the suspense items DataTable (#DataTables_Table_1) to appear in the DOM.
 * Resolves immediately if already present. Rejects after timeoutMs with a TIMEOUT error.
 *
 * Uses MutationObserver (microtask-based) rather than polling — fires as soon as the
 * CK portal's jQuery handlers insert the DataTable into the DOM.
 */
function waitForDataTable(timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const win = window as any;
    const $ = win.$;

    // Check if DataTable is already in the DOM
    if ($('#DataTables_Table_1').length > 0) {
      resolve();
      return;
    }

    let timer: ReturnType<typeof setTimeout>;

    const observer = new MutationObserver(() => {
      if ($('#DataTables_Table_1').length > 0) {
        observer.disconnect();
        clearTimeout(timer);
        resolve();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    timer = setTimeout(() => {
      observer.disconnect();
      reject(new Error('TIMEOUT: DataTable #DataTables_Table_1 did not appear within ' + timeoutMs + 'ms'));
    }, timeoutMs);
  });
}

/**
 * Read all suspense items from the CK portal's DataTable.
 *
 * This function:
 * 1. Triggers Payment Type = "Business account" and "Map to Suspense Items" if the
 *    DataTable is not already visible.
 * 2. Waits up to 5 seconds for the DataTable to appear.
 * 3. Expands the DataTable to show all rows (dt.page.len(-1)).
 * 4. Iterates every row, selecting it to read the hidden #MappedSuspenseItemIds field.
 * 5. ALWAYS cleans up in finally: deselects all rows, clears #MappedSuspenseItemIds.
 *
 * Assumes MAIN world context — window.$ must be a jQuery instance with DataTables plugin loaded.
 *
 * @param claimId - The CK portal claim ID (from the page URL). Currently unused in reading
 *                  but required for API consistency with submitExpense (plan 02).
 * @returns Array of SuspenseItem objects, one per unmapped bank transaction. Empty array if
 *          the DataTable never appears (e.g., no suspense items exist).
 */
export async function readSuspenseItems(_claimId: string): Promise<SuspenseItem[]> {
  const win = window as any;
  const $ = win.$;

  // If DataTable is not already visible, trigger the form interactions that reveal it
  if (!($('#DataTables_Table_1').length > 0)) {
    triggerPaymentTypeAndSuspenseItems();
    await waitForDataTable(5000);
  }

  // If still not present after trigger, return empty (no suspense items)
  if (!($('#DataTables_Table_1').length > 0)) {
    return [];
  }

  const dt = $('#DataTables_Table_1').DataTable();
  const items: SuspenseItem[] = [];

  // Show all rows — pass false to draw() to avoid scroll/position reset
  dt.page.len(-1).draw(false);

  try {
    dt.rows().every(function (this: any, rowIdx: number) {
      // Deselect all rows, then select only this row to populate the hidden field
      dt.rows().deselect();
      dt.row(rowIdx).select();

      const suspenseId = ($('#MappedSuspenseItemIds').val() as string) ?? '';
      if (!suspenseId) return; // Row selection didn't populate field — skip

      const rowNode = dt.row(rowIdx).node() as HTMLTableRowElement;
      const cells = rowNode.querySelectorAll('td');
      // Cell order: checkbox(0), date(1), description(2), amount(3)
      const dateText = cells[1]?.textContent?.trim() ?? '';
      const description = cells[2]?.textContent?.trim() ?? '';
      const amountText = cells[3]?.textContent?.trim() ?? '';

      items.push({
        id: suspenseId,
        date: parseDateToDDMMYYYY(dateText),
        isoDate: parseDateToISO(dateText),
        description,
        amount: parseAmount(amountText),
      });
    });
  } finally {
    // ALWAYS clean up — even if iteration throws, leave form in neutral state
    dt.rows().deselect();
    ($('#MappedSuspenseItemIds') as any).val('');
  }

  return items;
}

// ---------------------------------------------------------------------------
// Validation error parsing
// ---------------------------------------------------------------------------

/**
 * Parse ASP.NET MVC validation error HTML and return an array of error messages.
 *
 * Checks two standard ASP.NET MVC validation markers:
 * - `.validation-summary-errors li` — summary-level errors (e.g. VAT amount too high)
 * - `.field-validation-error`       — field-level errors (e.g. Description required)
 *
 * Deduplicates: if the same message appears in both, it is returned only once.
 * Returns an empty array when the HTML contains no validation errors.
 *
 * This is a pure function — suitable for unit testing without browser or network.
 */
export function parseValidationErrors(html: string): string[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const errors: string[] = [];

  // Validation summary container (.validation-summary-errors contains <ul><li>...)
  const summaryDiv = doc.querySelector('.validation-summary-errors');
  if (summaryDiv) {
    summaryDiv.querySelectorAll('li').forEach((li) => {
      const text = li.textContent?.trim();
      if (text) errors.push(text);
    });
  }

  // Individual field validation spans
  doc.querySelectorAll('.field-validation-error').forEach((span) => {
    const text = span.textContent?.trim();
    if (text && !errors.includes(text)) errors.push(text);
  });

  return errors;
}

// ---------------------------------------------------------------------------
// Session expiry detection
// ---------------------------------------------------------------------------

/**
 * Detect whether a fetch() response indicates session expiry.
 *
 * ASP.NET MVC redirects to the login page when the session expires.
 * fetch() follows redirects by default, so `response.redirected === true`
 * and `response.url` will contain the final redirect target.
 *
 * Returns true when:
 * - The response was redirected AND
 * - The final URL contains '/login' or '/account/' (case-insensitive), OR
 * - The final URL is not on the portal domain (left the site entirely)
 */
export function detectSessionExpiry(response: Response): boolean {
  if (!response.redirected) return false;
  const url = response.url.toLowerCase();
  return (
    url.includes('/login') ||
    url.includes('/account/') ||
    !url.startsWith('https://portal.churchill-knight.co.uk/')
  );
}

// ---------------------------------------------------------------------------
// Response parsing (internal)
// ---------------------------------------------------------------------------

/**
 * Parse a fetch() Response from a CK portal expense submission.
 *
 * Cases:
 * 1. Session expired (redirect to login) → SESSION_EXPIRED error
 * 2. PRG success (redirect back to expense page) → success
 * 3. HTTP 200 with validation errors in body → VALIDATION_ERROR
 * 4. HTTP 200 with no errors → success
 */
async function parseSubmissionResponse(response: Response): Promise<SubmissionResult> {
  if (detectSessionExpiry(response)) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }

  // PRG pattern: successful POST triggers a redirect back to the expense page
  if (response.redirected) {
    return { success: true };
  }

  // Non-redirect 200: parse the body for ASP.NET MVC validation error markers
  const html = await response.text();
  const errors = parseValidationErrors(html);
  if (errors.length > 0) {
    return { success: false, error: 'VALIDATION_ERROR', validationMessages: errors };
  }

  return { success: true };
}

// ---------------------------------------------------------------------------
// Expense submission
// ---------------------------------------------------------------------------

/**
 * Submit a single expense item to the CK portal via fetch() POST.
 *
 * Uses `credentials: 'same-origin'` so the browser forwards the existing
 * authenticated session cookie — no manual cookie extraction required.
 *
 * The payload is built by `buildPayload()` from lib/expense-engine.ts which
 * handles all the ASP.NET MVC form field requirements (checkbox double-field
 * pattern, VAT calculation, fixed field values, etc.).
 *
 * Returns a structured SubmissionResult:
 * - { success: true }                                          — expense submitted
 * - { success: false, error: 'NETWORK_ERROR' }                — fetch() threw
 * - { success: false, error: 'SESSION_EXPIRED' }              — redirected to login
 * - { success: false, error: 'VALIDATION_ERROR', validationMessages: [...] } — form rejected
 */
export async function submitExpense(submission: ExpenseSubmission): Promise<SubmissionResult> {
  const payload = buildPayload(submission);

  let response: Response;
  try {
    response = await fetch(`/ExpenseItems/Create?claimId=${submission.claimId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: payload.toString(),
      credentials: 'same-origin',
    });
  } catch (err) {
    return { success: false, error: 'NETWORK_ERROR' };
  }

  return parseSubmissionResponse(response);
}
