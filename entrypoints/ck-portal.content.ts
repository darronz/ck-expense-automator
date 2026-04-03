// entrypoints/ck-portal.content.ts
// MAIN world — no extension API access. Only page DOM and page JS.
// Waits for jQuery, then listens for scan requests from the isolated-world panel.

import { readSuspenseItems } from '../lib/ck-api';

export default defineContentScript({
  matches: ['https://portal.churchill-knight.co.uk/ExpenseItems/*'],
  world: 'MAIN',
  runAt: 'document_idle',

  main() {
    console.log('[CK Expense Automator] Content script loaded (MAIN world)');
    waitForJQuery()
      .then((hasDataTables) => {
        if (hasDataTables) {
          console.log('[CK Expense Automator] jQuery and DataTables API confirmed available');
        } else {
          console.log('[CK Expense Automator] jQuery available but DataTables not yet loaded');
        }

        // Listen for scan requests from the isolated-world panel
        window.addEventListener('message', async (event: MessageEvent) => {
          if (event.data?.type !== 'ck:scan-items') return;

          const claimId = event.data.payload?.claimId;
          if (!claimId) {
            console.warn('[CK Expense Automator] No claimId in scan request');
            return;
          }

          console.log(`[CK Expense Automator] Scanning suspense items for claimId: ${claimId}`);
          try {
            const items = await readSuspenseItems(claimId);
            console.log(`[CK Expense Automator] Read ${items.length} suspense items`);

            window.postMessage({
              type: 'ck:items-ready',
              payload: { claimId, items },
            }, '*');
          } catch (err) {
            console.error('[CK Expense Automator] Failed to read suspense items:', err);
            window.postMessage({
              type: 'ck:scan-error',
              payload: { error: String(err) },
            }, '*');
          }
        });

        console.log('[CK Expense Automator] Ready — waiting for scan request from panel');
      })
      .catch((err) => {
        console.error('[CK Expense Automator] jQuery not found:', err);
      });
  },
});

/**
 * Wait for jQuery to be available in the page context.
 */
function waitForJQuery(timeoutMs = 10000): Promise<boolean> {
  return new Promise((resolve, reject) => {
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
