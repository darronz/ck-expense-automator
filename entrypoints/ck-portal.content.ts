// entrypoints/ck-portal.content.ts
// MAIN world — no extension API access. Only page DOM and page JS.

import { readSuspenseItems } from '../lib/ck-api';

export default defineContentScript({
  matches: ['https://portal.churchill-knight.co.uk/ExpenseItems/*'],
  world: 'MAIN',
  runAt: 'document_idle',

  main() {
    console.log('[CK Expense Automator] Content script loaded (MAIN world)');
    waitForJQuery()
      .then(async (hasDataTables) => {
        if (hasDataTables) {
          console.log('[CK Expense Automator] jQuery and DataTables API confirmed available');
        } else {
          console.log('[CK Expense Automator] jQuery available but DataTables not yet loaded (expected — requires portal interaction)');
        }

        // Extract claimId from the current URL query string
        const url = new URL(window.location.href);
        const claimId = url.searchParams.get('claimId') ?? '';

        if (!claimId) {
          console.warn('[CK Expense Automator] No claimId found in URL — cannot read suspense items');
          return;
        }

        console.log(`[CK Expense Automator] Reading suspense items for claimId: ${claimId}`);
        try {
          const items = await readSuspenseItems(claimId);
          console.log(`[CK Expense Automator] Read ${items.length} suspense items`, items);

          // Send to isolated-world panel via window.postMessage (crosses world boundary).
          // CustomEvent on document does NOT cross MAIN→ISOLATED world boundary.
          window.postMessage({
            type: 'ck:items-ready',
            payload: { claimId, items },
          }, '*');
        } catch (err) {
          console.error('[CK Expense Automator] Failed to read suspense items:', err);
        }
      })
      .catch((err) => {
        console.error('[CK Expense Automator] jQuery not found:', err);
      });
  },
});

/**
 * Wait for jQuery to be available in the page context.
 * Returns true if $.fn.dataTable is also present, false if only jQuery.
 * DataTables is loaded by the CK portal but its table instance only appears
 * after user interaction — so $.fn.dataTable (the plugin) may be present
 * while $(...).DataTable() on a specific table is not yet initialised.
 */
function waitForJQuery(timeoutMs = 10000): Promise<boolean> {
  return new Promise((resolve, reject) => {
    // Cast to any — window.$ is a page global, not typed in extension context
    const win = window as any;

    if (typeof win.$ !== 'undefined' && win.$.fn) {
      resolve(typeof win.$.fn.dataTable !== 'undefined');
      return;
    }

    const start = Date.now();
    const interval = setInterval(() => {
      if (typeof win.$ !== 'undefined' && win.$.fn) {
        clearInterval(interval);
        resolve(typeof win.$.fn.dataTable !== 'undefined');
        return;
      }
      if (Date.now() - start > timeoutMs) {
        clearInterval(interval);
        reject(new Error('jQuery not found on page within 10 seconds'));
      }
    }, 100);
  });
}
