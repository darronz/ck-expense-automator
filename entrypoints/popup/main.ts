// entrypoints/popup/main.ts
// Popup logic: queries active tab, shows CK page status, matched/unmatched counts,
// and provides a panel toggle + options link.

const CK_EXPENSES_URL_PREFIX = 'https://portal.churchill-knight.co.uk/ExpenseItems/';

interface PanelStateResponse {
  matched: number;
  unmatched: number;
  panelVisible: boolean;
}

function renderInactive(app: HTMLElement): void {
  app.innerHTML = `<p class="status-inactive">Navigate to CK Expenses to use</p>`;
}

function renderLoading(app: HTMLElement): void {
  app.innerHTML = `<p class="loading-text">Panel loading...</p>`;
}

function renderActive(app: HTMLElement, state: PanelStateResponse): void {
  const toggleClass = state.panelVisible ? 'btn-primary btn-toggle-active' : 'btn-primary';
  const toggleLabel = state.panelVisible ? 'Hide Panel' : 'Show Panel';

  app.innerHTML = `
    <div class="status-active">
      <p class="panel-title">CK Expense Automator</p>
      <div class="counts">
        <div class="count-item">
          <span class="count-number count-matched">${state.matched}</span>
          <span class="count-label">Matched</span>
        </div>
        <div class="count-item">
          <span class="count-number count-unmatched">${state.unmatched}</span>
          <span class="count-label">Unmatched</span>
        </div>
      </div>
      <div class="actions">
        <button id="btn-toggle" class="${toggleClass}">${toggleLabel}</button>
        <button id="btn-options" class="btn-secondary">Options</button>
      </div>
    </div>
  `;

  const btnToggle = app.querySelector<HTMLButtonElement>('#btn-toggle');
  const btnOptions = app.querySelector<HTMLButtonElement>('#btn-options');

  btnToggle?.addEventListener('click', async () => {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (tab?.id != null) {
      try {
        await browser.tabs.sendMessage(tab.id, { type: 'CK_TOGGLE_PANEL' });
      } catch {
        // Content script not ready — ignore
      }
    }
    window.close();
  });

  btnOptions?.addEventListener('click', () => {
    browser.runtime.openOptionsPage();
    window.close();
  });
}

async function init(): Promise<void> {
  const app = document.getElementById('app');
  if (!app) return;

  let tabs: chrome.tabs.Tab[];
  try {
    tabs = await browser.tabs.query({ active: true, currentWindow: true });
  } catch {
    renderInactive(app);
    return;
  }

  const tab = tabs[0];
  if (!tab?.url?.startsWith(CK_EXPENSES_URL_PREFIX)) {
    renderInactive(app);
    return;
  }

  // On CK ExpenseItems page — try to get panel state
  if (tab.id == null) {
    renderInactive(app);
    return;
  }

  renderLoading(app);

  try {
    const response = await browser.tabs.sendMessage(tab.id, { type: 'CK_GET_STATE' }) as PanelStateResponse;
    renderActive(app, response);
  } catch {
    // Content script not injected yet or page still loading
    renderActive(app, { matched: 0, unmatched: 0, panelVisible: false });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  init();
});
