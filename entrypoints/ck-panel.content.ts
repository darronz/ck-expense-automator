// entrypoints/ck-panel.content.ts
// ISOLATED world — has browser API access (browser.storage, browser.runtime).
// Mounts the CK Expense Automator shadow DOM panel on the CK portal.
// Must NOT be set to world: 'MAIN' — createShadowRootUi calls browser.runtime.getURL()
// which is unavailable in the MAIN world.

import './ui/panel.css';
import type { SuspenseItem } from '../lib/types';

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
  },
});

/**
 * Handle suspense item data received from the MAIN world script.
 * Plan 02 will replace this stub with full panel state management.
 */
function handleItemsReady(data: { claimId: string; items: SuspenseItem[] }): void {
  console.log(
    `[CK Expense Automator] Panel received ${data.items.length} suspense items for claimId: ${data.claimId}`,
  );
}

/**
 * Create the panel DOM inside the shadow root container.
 * Plan 02 will replace this stub with the full panel implementation.
 */
function createPanel(container: HTMLElement, _ctx: any): void {
  const placeholder = document.createElement('div');
  placeholder.textContent = 'CK Expense Automator loading...';
  container.appendChild(placeholder);
}
