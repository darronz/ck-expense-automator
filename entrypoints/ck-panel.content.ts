// entrypoints/ck-panel.content.ts
// ISOLATED world — has browser API access (browser.storage, browser.runtime).
// Mounts the CK Expense Automator shadow DOM panel on the CK portal.
// Must NOT be set to world: 'MAIN' — createShadowRootUi calls browser.runtime.getURL()
// which is unavailable in the MAIN world.

import '../ui/panel.css';
import type { SuspenseItem, MatchResult } from '../lib/types';
import { createPanel } from '../ui/panel';

// ─── Module-level state (accessible by message handler) ───────────────────────

let currentMatchResult: MatchResult | null = null;
let isPanelVisible = true;
let shadowHostRef: HTMLElement | null = null;

/** Toggle panel visibility without unmounting. */
function togglePanelVisibility(): void {
  if (!shadowHostRef) return;
  isPanelVisible = !isPanelVisible;
  shadowHostRef.style.display = isPanelVisible ? '' : 'none';
}

// ─── Message handler ──────────────────────────────────────────────────────────

browser.runtime.onMessage.addListener((message: { type: string }, _sender, sendResponse) => {
  if (message.type === 'CK_GET_STATE') {
    sendResponse({
      matched: currentMatchResult?.matched.length ?? 0,
      unmatched: currentMatchResult?.unmatched.length ?? 0,
      panelVisible: isPanelVisible,
    });
    return true;
  }
  if (message.type === 'CK_TOGGLE_PANEL') {
    togglePanelVisibility();
    return true;
  }
});

export default defineContentScript({
  matches: ['https://portal.churchill-knight.co.uk/ExpenseItems/*'],
  cssInjectionMode: 'ui',
  // world defaults to 'ISOLATED' — correct for browser.storage access
  runAt: 'document_idle',

  async main(ctx) {
    const ui = await createShadowRootUi(ctx, {
      name: 'ck-expense-panel',
      position: 'overlay',
      anchor: 'body',
      alignment: 'top-right',
      zIndex: 999999,
      isolateEvents: ['keyup', 'keydown', 'keypress'],

      onMount(container, _shadow, shadowHost) {
        // shadowHost covers the full viewport as a positioning frame
        Object.assign(shadowHost.style, {
          position: 'fixed',
          top: '0',
          left: '0',
          width: '100vw',
          height: '100vh',
          zIndex: '2147483647',
          pointerEvents: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        });

        // WXT injects an <html> wrapper inside the shadow root with
        // "position: absolute; top: 0; right: 0" — override to fill the fixed host
        const htmlWrapper = shadowHost.shadowRoot?.querySelector('html');
        if (htmlWrapper) {
          Object.assign((htmlWrapper as HTMLElement).style, {
            position: 'fixed',
            top: '0',
            left: '0',
            right: '0',
            bottom: '0',
            width: '100vw',
            height: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            zIndex: '2147483647',
          });
        }

        // container (<body>) is the centered panel — scrollable, clickable
        Object.assign(container.style, {
          pointerEvents: 'auto',
          position: 'relative',
          zIndex: '2147483647',
          maxWidth: 'calc(100vw - 80px)',
          maxHeight: 'calc(100vh - 80px)',
          width: '480px',
          overflowY: 'auto',
          borderRadius: '12px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
          background: '#ffffff',
        });

        // Store shadowHost reference for panel toggle
        shadowHostRef = shadowHost;

        createPanel(container, ctx);
      },
    });

    ui.mount();

    // Listen for data from MAIN world via window.postMessage (crosses world boundary).
    // CustomEvent on document does NOT cross MAIN→ISOLATED, but postMessage does.
    window.addEventListener('message', (event: MessageEvent) => {
      if (event.data?.type === 'ck:items-ready' && event.data?.payload) {
        handleItemsReady(event.data.payload);
      }
      if (event.data?.type === 'ck:match-result' && event.data?.payload) {
        currentMatchResult = event.data.payload as MatchResult;
      }
    });
  },
});

function handleItemsReady(_data: { claimId: string; items: SuspenseItem[] }): void {
  // Data is handled by createPanel's own postMessage listener
}
