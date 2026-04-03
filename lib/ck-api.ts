// lib/ck-api.ts
// Portal interaction layer — MAIN world only. No extension APIs (no browser.*, no chrome.*).
// Assumes window.$ (jQuery) and DataTables are available on the page.

import type { SuspenseItem, SubmissionResult } from './types';

// Re-export SubmissionResult so callers can import from a single module
export type { SubmissionResult };

/**
 * Convert a dd/mm/yyyy date string to yyyy-mm-dd ISO format.
 * Example: '13/03/2026' → '2026-03-13'
 */
export function parseDateToISO(ddmmyyyy: string): string {
  const [day, month, year] = ddmmyyyy.split('/');
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

/**
 * Parse a currency/amount string to a float.
 * Strips all non-numeric and non-period characters.
 * Example: '£18.67' → 18.67, '$25.00' → 25.00, '18.67' → 18.67
 */
export function parseAmount(text: string): number {
  const cleaned = text.replace(/[^0-9.]/g, '');
  return parseFloat(cleaned) || 0;
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
        date: dateText,
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
