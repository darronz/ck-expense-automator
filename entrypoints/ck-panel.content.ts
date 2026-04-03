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
        // shadowHost is outside the shadow root — apply fixed sidebar positioning here.
        // These styles are NOT isolated and apply to the element in the real DOM.
        Object.assign(shadowHost.style, {
          position: 'fixed',
          top: '0',
          right: '0',
          width: '400px',
          height: '100vh',
          zIndex: '999999',
          pointerEvents: 'none',
        });

        // container (uiContainer) is inside the shadow root — safe to apply panel content styles.
        container.style.pointerEvents = 'auto';
        container.style.height = '100%';

        // Store shadowHost reference for panel toggle
        shadowHostRef = shadowHost;

        createPanel(container, ctx);
      },
    });

    ui.mount();

    // Late-subscriber pattern: check if MAIN world already fired ck:items-ready
    // before this isolated-world script registered its event listener.
    // The MAIN world stores data on window.__ckExpenseData as a fallback.
    const existing = (window as any).__ckExpenseData;
    if (existing) {
      handleItemsReady(existing);
    } else {
      ctx.addEventListener(document, 'ck:items-ready' as any, (event: Event) => {
        if (event instanceof CustomEvent) handleItemsReady(event.detail);
      });
    }

    // Listen for match result updates from the panel (via custom event)
    ctx.addEventListener(document, 'ck:match-result' as any, (event: Event) => {
      if (event instanceof CustomEvent) {
        currentMatchResult = event.detail as MatchResult;
      }
    });
  },
});

function handleItemsReady(data: { claimId: string; items: SuspenseItem[] }): void {
  console.log(
    `[CK Expense Automator] Panel received ${data.items.length} suspense items for claimId: ${data.claimId}`,
  );
  // TODO: Phase 3 panel receives items — createPanel already handles its own state via the event bridge
}
