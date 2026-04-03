// ui/panel.ts
// Panel DOM builder and state controller for the CK Expense Automator.
// Injected into the Shadow DOM root by entrypoints/ck-panel.content.ts.

import type { SuspenseItem, ExpenseRule, MatchResult, ExpenseSubmission, SubmissionResult } from '../lib/types';
import { matchExpenses, buildPayload, calculateVatFromPercentage } from '../lib/expense-engine';
import { submitExpense } from '../lib/ck-api';
import { getRules, recordRuleUsage } from '../lib/rules-store';
import { getCategoryLabel, extractForeignCurrency } from './panel-utils';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PanelState {
  items: MatchResult;
  claimId: string;
  dryRun: boolean;
  submitting: boolean;
  submittedCount: number;
  failedCount: number;
  expandedItemId: string | null;
}

// ─── Pure helper functions (exported for unit testing) ────────────────────────

/**
 * Build an ExpenseSubmission from a SuspenseItem + ExpenseRule pair.
 *
 * VAT calculation priority:
 * 1. rule.hasVat=false → vatAmount=null
 * 2. rule.hasVat=true, rule.vatAmount != null → use fixed vatAmount
 * 3. rule.hasVat=true, rule.vatPercentage != null → calculate from gross
 * 4. rule.hasVat=true, both null → vatAmount=null
 */
export function buildSubmissionForItem(
  item: SuspenseItem,
  rule: ExpenseRule,
  claimId: string,
): ExpenseSubmission {
  let vatAmount: number | null = null;

  if (rule.hasVat) {
    if (rule.vatAmount !== null) {
      vatAmount = rule.vatAmount;
    } else if (rule.vatPercentage !== null) {
      vatAmount = calculateVatFromPercentage(item.amount, rule.vatPercentage);
    }
    // else remains null (hasVat=true but amounts unspecified)
  }

  return {
    claimId,
    suspenseItemId: item.id,
    date: item.date,
    isoDate: item.isoDate,
    nominalId: rule.nominalId,
    description: rule.description,
    purchasedFrom: rule.purchasedFrom,
    grossAmount: item.amount,
    hasVat: rule.hasVat,
    vatAmount,
    previousPage: typeof window !== 'undefined' ? window.location.href : '',
  };
}

/**
 * Format VAT information for display in the panel.
 *
 * Returns one of:
 * - 'No VAT'
 * - 'VAT £12.00' (fixed amount)
 * - 'VAT 20%' (percentage display)
 * - 'VAT (unspecified)' (hasVat=true but no amounts)
 */
export function formatVatSummary(rule: ExpenseRule): string {
  if (!rule.hasVat) return 'No VAT';
  if (rule.vatAmount !== null) return `VAT £${rule.vatAmount.toFixed(2)}`;
  if (rule.vatPercentage !== null) return `VAT ${rule.vatPercentage}%`;
  return 'VAT (unspecified)';
}

/**
 * Format a numeric GBP amount as a currency string.
 * Examples: 72 → '£72.00', 5.5 → '£5.50'
 */
export function formatAmount(amount: number): string {
  return `£${amount.toFixed(2)}`;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Extract claim month and year from the first item's date string.
 * Returns { month: 'March', year: '2026' } or { month: 'Unknown', year: '' }.
 */
export function parseClaimContext(
  _claimId: string,
  items: SuspenseItem[],
): { month: string; year: string } {
  if (items.length === 0) return { month: 'Unknown', year: '' };

  const date = items[0].date; // dd/mm/yyyy
  const parts = date.split('/');
  if (parts.length < 3) return { month: 'Unknown', year: '' };

  const monthIndex = parseInt(parts[1], 10) - 1;
  const year = parts[2];
  const month = MONTH_NAMES[monthIndex] ?? 'Unknown';

  return { month, year };
}

/**
 * Submit all matched items sequentially with a configurable delay between submissions.
 *
 * @param items - Array of matched item+rule pairs to submit
 * @param claimId - CK portal claim ID
 * @param dryRun - When true, skip actual submissions; mark items as 'dry-run'
 * @param submitFn - Injectable submit function (defaults to submitExpense in production)
 * @param delayFn - Injectable delay function (takes ms, resolves after delay)
 * @param onProgress - Called after each item with (done, total)
 * @param onItemResult - Called after each item with (itemId, SubmissionResult)
 */
export async function submitAllWithDelay(
  items: Array<{ item: SuspenseItem; rule: ExpenseRule }>,
  claimId: string,
  dryRun: boolean,
  submitFn: (submission: ExpenseSubmission) => Promise<SubmissionResult>,
  delayFn: (ms: number) => Promise<void>,
  onProgress: (done: number, total: number) => void,
  onItemResult: (itemId: string, result: SubmissionResult) => void,
): Promise<void> {
  const total = items.length;

  for (let i = 0; i < total; i++) {
    const { item, rule } = items[i];
    let result: SubmissionResult;

    if (dryRun) {
      result = { success: true, error: 'dry-run' };
    } else {
      const submission = buildSubmissionForItem(item, rule, claimId);
      result = await submitFn(submission);
    }

    onItemResult(item.id, result);
    onProgress(i + 1, total);

    // Delay between submissions, but not after the last one
    if (i < total - 1) {
      await delayFn(400);
    }
  }
}

// ─── DOM helpers ──────────────────────────────────────────────────────────────

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const elem = document.createElement(tag);
  const { class: className, ...rest } = props;
  if (className) elem.className = className;
  Object.assign(elem, rest);
  for (const child of children) {
    if (typeof child === 'string') {
      elem.appendChild(document.createTextNode(child));
    } else {
      elem.appendChild(child);
    }
  }
  return elem;
}

// ─── Row update helpers ───────────────────────────────────────────────────────

function applySuccessState(rowEl: HTMLElement): void {
  rowEl.classList.remove('ck-error', 'ck-dryrun');
  rowEl.classList.add('ck-success');
  rowEl.style.cursor = 'default';

  const btnContainer = rowEl.querySelector('.ck-row-btn-container');
  if (btnContainer) {
    btnContainer.innerHTML = '';
    const label = el('span', { class: 'ck-success-label' }, '✓ Submitted');
    btnContainer.appendChild(label);
  }
}

function applyDryRunState(rowEl: HTMLElement): void {
  rowEl.classList.remove('ck-error', 'ck-success');
  rowEl.classList.add('ck-dryrun');

  const btnContainer = rowEl.querySelector('.ck-row-btn-container');
  if (btnContainer) {
    btnContainer.innerHTML = '';
    const label = el('span', { class: 'ck-success-label' }, '⏭ Dry-run');
    btnContainer.appendChild(label);
  }
}

function applyErrorState(
  rowEl: HTMLElement,
  errorMsg: string,
  onRetry: () => void,
): void {
  rowEl.classList.remove('ck-success', 'ck-dryrun');
  rowEl.classList.add('ck-error');

  const btnContainer = rowEl.querySelector('.ck-row-btn-container');
  if (btnContainer) {
    btnContainer.innerHTML = '';
    const retryBtn = el('button', { class: 'ck-retry-btn' }, 'Retry');
    retryBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onRetry();
    });
    btnContainer.appendChild(retryBtn);
  }

  let errorEl = rowEl.querySelector('.ck-error-text') as HTMLElement | null;
  if (!errorEl) {
    errorEl = el('div', { class: 'ck-error-text' });
    rowEl.appendChild(errorEl);
  }
  errorEl.textContent = errorMsg;
}

// ─── Individual item submit ───────────────────────────────────────────────────

async function submitOne(
  item: SuspenseItem,
  rule: ExpenseRule,
  claimId: string,
  dryRun: boolean,
  rowEl: HTMLElement,
): Promise<void> {
  // Disable the submit button
  const submitBtn = rowEl.querySelector('.ck-submit-btn') as HTMLButtonElement | null;
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = '...';
  }

  if (dryRun) {
    applyDryRunState(rowEl);
    return;
  }

  const submission = buildSubmissionForItem(item, rule, claimId);
  const result = await submitExpense(submission);

  if (result.success) {
    await recordRuleUsage(rule.id);
    applySuccessState(rowEl);
  } else {
    const errorMsg = result.validationMessages?.join('; ') ?? result.error ?? 'Unknown error';
    applyErrorState(rowEl, errorMsg, () => {
      // Re-enable button and retry
      const container = rowEl.querySelector('.ck-row-btn-container');
      if (container) {
        container.innerHTML = '';
        const newBtn = el('button', { class: 'ck-submit-btn' }, 'Submit');
        newBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          submitOne(item, rule, claimId, dryRun, rowEl);
        });
        container.appendChild(newBtn);
      }
      rowEl.classList.remove('ck-error');
      const errEl = rowEl.querySelector('.ck-error-text');
      if (errEl) errEl.remove();
      submitOne(item, rule, claimId, dryRun, rowEl);
    });
  }
}

// ─── Row builder ─────────────────────────────────────────────────────────────

function buildMatchedRow(
  item: SuspenseItem,
  rule: ExpenseRule,
  claimId: string,
  state: PanelState,
  ctx: any,
): HTMLElement {
  const rowEl = el('div', { class: 'ck-item-row', id: `ck-row-${item.id}` });

  const primaryRow = el('div', { class: 'ck-item-primary' });

  // Left cluster: date + amount + name + foreign currency hint
  const leftCluster = el('div', { class: 'ck-item-left' });

  const dateSpan = el('span', { class: 'ck-item-date' }, item.date.slice(0, 5)); // dd/mm
  const amountSpan = el('span', { class: 'ck-item-amount' }, formatAmount(item.amount));
  const nameSpan = el('span', { class: 'ck-item-name' }, rule.name);

  const foreignCurrency = extractForeignCurrency(item.description);
  if (foreignCurrency) {
    const foreignSpan = el('span', { class: 'ck-item-foreign' }, `(${foreignCurrency})`);
    leftCluster.appendChild(dateSpan);
    leftCluster.appendChild(document.createTextNode(' '));
    leftCluster.appendChild(amountSpan);
    leftCluster.appendChild(foreignSpan);
    leftCluster.appendChild(document.createTextNode(' '));
    leftCluster.appendChild(nameSpan);
  } else {
    leftCluster.appendChild(dateSpan);
    leftCluster.appendChild(document.createTextNode(' '));
    leftCluster.appendChild(amountSpan);
    leftCluster.appendChild(document.createTextNode(' '));
    leftCluster.appendChild(nameSpan);
  }

  // Right cluster: submit button
  const btnContainer = el('div', { class: 'ck-row-btn-container' });
  const submitBtn = el('button', { class: 'ck-submit-btn' }, 'Submit');
  submitBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    submitOne(item, rule, claimId, state.dryRun, rowEl);
  });
  btnContainer.appendChild(submitBtn);

  primaryRow.appendChild(leftCluster);
  primaryRow.appendChild(btnContainer);

  // Secondary row: category · vendor · VAT
  const categoryLabel = getCategoryLabel(rule.nominalId);
  const vatSummary = formatVatSummary(rule);
  const secondaryRow = el(
    'div',
    { class: 'ck-item-secondary' },
    `${categoryLabel} · ${rule.purchasedFrom} · ${vatSummary}`,
  );

  // Details div (expanded on row click)
  const detailsDiv = el('div', { class: 'ck-item-details' });
  detailsDiv.innerHTML = `
    <table style="width:100%;border-collapse:collapse;">
      <tr><td style="padding:2px 8px 2px 0;color:#6b7280;white-space:nowrap;">Category</td><td>${categoryLabel}</td></tr>
      <tr><td style="padding:2px 8px 2px 0;color:#6b7280;white-space:nowrap;">Reason</td><td>${rule.description}</td></tr>
      <tr><td style="padding:2px 8px 2px 0;color:#6b7280;white-space:nowrap;">Vendor</td><td>${rule.purchasedFrom}</td></tr>
      <tr><td style="padding:2px 8px 2px 0;color:#6b7280;white-space:nowrap;">Amount</td><td>${formatAmount(item.amount)}</td></tr>
      <tr><td style="padding:2px 8px 2px 0;color:#6b7280;white-space:nowrap;">VAT</td><td>${vatSummary}</td></tr>
      <tr><td style="padding:2px 8px 2px 0;color:#6b7280;white-space:nowrap;">Date</td><td>${item.date}</td></tr>
    </table>
    <a href="#" class="ck-edit-link" style="font-size:11px;color:#2563eb;text-decoration:underline;margin-top:4px;display:inline-block;">[Edit]</a>
  `;

  // Click row to expand/collapse details
  rowEl.addEventListener('click', () => {
    const isExpanded = rowEl.classList.contains('ck-expanded');
    if (isExpanded) {
      rowEl.classList.remove('ck-expanded');
      state.expandedItemId = null;
    } else {
      // Collapse any other expanded row
      if (state.expandedItemId) {
        const prev = document.getElementById(`ck-row-${state.expandedItemId}`);
        if (prev) prev.classList.remove('ck-expanded');
      }
      rowEl.classList.add('ck-expanded');
      state.expandedItemId = item.id;
    }
  });

  // Prevent [Edit] link from submitting
  detailsDiv.querySelector('.ck-edit-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Edit functionality is a placeholder for Plan 03
  });

  rowEl.appendChild(primaryRow);
  rowEl.appendChild(secondaryRow);
  rowEl.appendChild(detailsDiv);

  return rowEl;
}

// ─── Bulk submit handler ─────────────────────────────────────────────────────

function buildBulkSubmitHandler(
  matchedItems: MatchResult['matched'],
  claimId: string,
  state: PanelState,
  submitAllBtn: HTMLButtonElement,
  progressSection: HTMLElement,
  progressText: HTMLElement,
  progressBar: HTMLProgressElement,
  footerText: HTMLElement,
  bodyEl: HTMLElement,
  ctx: any,
): () => void {
  return async () => {
    if (state.submitting) return;
    state.submitting = true;
    submitAllBtn.disabled = true;

    // Show progress section
    progressSection.classList.add('ck-visible');
    progressBar.value = 0;
    progressBar.max = matchedItems.length;
    progressText.textContent = `Submitting 0/${matchedItems.length}...`;

    let submitted = 0;
    let failed = 0;

    const delayFn = (ms: number): Promise<void> =>
      new Promise((resolve) => ctx.setTimeout(resolve, ms));

    await submitAllWithDelay(
      matchedItems,
      claimId,
      state.dryRun,
      submitExpense,
      delayFn,
      (done, total) => {
        progressBar.value = done;
        progressText.textContent = `Submitting ${done}/${total}...`;
      },
      async (itemId, result) => {
        const rowEl = bodyEl.querySelector(`#ck-row-${itemId}`) as HTMLElement | null;
        if (result.success && result.error === 'dry-run') {
          if (rowEl) applyDryRunState(rowEl);
        } else if (result.success) {
          if (rowEl) applySuccessState(rowEl);
          // Find rule for this item and record usage
          const pair = matchedItems.find((p) => p.item.id === itemId);
          if (pair) await recordRuleUsage(pair.rule.id);
          submitted++;
        } else {
          const errorMsg = result.validationMessages?.join('; ') ?? result.error ?? 'Unknown error';
          if (rowEl) {
            const pair = matchedItems.find((p) => p.item.id === itemId);
            if (pair) {
              applyErrorState(rowEl, errorMsg, () => {
                submitOne(pair.item, pair.rule, claimId, state.dryRun, rowEl);
              });
            }
          }
          failed++;
        }
        state.submittedCount = submitted;
        state.failedCount = failed;
        footerText.textContent = `Submitted: ${submitted}/${matchedItems.length}`;
      },
    );

    // Hide progress bar, show summary
    progressSection.classList.remove('ck-visible');
    state.submitting = false;

    // Build summary section
    const summaryEl = el('div', { class: 'ck-summary' });
    const summaryText = state.dryRun
      ? `Dry-run complete: ${matchedItems.length} items previewed`
      : `${submitted} submitted, ${failed} failed`;
    summaryEl.appendChild(el('div', {}, summaryText));

    const reloadBtn = el('button', { class: 'ck-reload-btn' }, 'Reload Page');
    reloadBtn.addEventListener('click', () => {
      window.location.reload();
    });
    summaryEl.appendChild(reloadBtn);

    bodyEl.appendChild(summaryEl);
  };
}

// ─── Main panel builder ───────────────────────────────────────────────────────

/**
 * Build and mount the full panel DOM into the given container element.
 * Loads rules, runs matching, then renders the matched/unmatched sections.
 *
 * @param container - The Shadow DOM container element from WXT's createShadowRootUi
 * @param ctx - WXT ContentScriptContext (provides ctx.setTimeout for safe timers)
 */
export function createPanel(container: HTMLElement, ctx: any): void {
  // Root panel element
  const panelEl = el('div', { class: 'ck-panel' });
  container.appendChild(panelEl);

  // Extract claimId from URL
  const urlParams = new URLSearchParams(
    typeof window !== 'undefined' ? window.location.search : '',
  );
  const claimId = urlParams.get('claimId') ?? '';

  // State object (mutable, shared across handlers)
  const state: PanelState = {
    items: { matched: [], unmatched: [] },
    claimId,
    dryRun: false,
    submitting: false,
    submittedCount: 0,
    failedCount: 0,
    expandedItemId: null,
  };

  // ── Header ────────────────────────────────────────────────────────────────

  const headerEl = el('div', { class: 'ck-panel-header' });

  const titleBlock = el('div', { class: 'ck-panel-title' });
  const titleText = el('div', {}, 'CK Expense Automator');
  const contextText = el('div', { class: 'ck-panel-context' }, 'Loading...');
  titleBlock.appendChild(titleText);
  titleBlock.appendChild(contextText);

  // Dry-run toggle
  const dryRunLabel = el('label', { class: 'ck-dry-run-label' });
  const dryRunCheckbox = el('input', { type: 'checkbox' } as any);
  dryRunCheckbox.addEventListener('change', () => {
    state.dryRun = (dryRunCheckbox as HTMLInputElement).checked;
  });
  dryRunLabel.appendChild(dryRunCheckbox);
  dryRunLabel.appendChild(document.createTextNode(' Dry-run'));

  // Minimize and close buttons
  const headerActions = el('div', { class: 'ck-panel-header-actions' });
  const minimizeBtn = el('button', { class: 'ck-header-btn' }, '−');
  const closeBtn = el('button', { class: 'ck-header-btn' }, '×');

  minimizeBtn.addEventListener('click', () => {
    bodyEl.style.display = bodyEl.style.display === 'none' ? '' : 'none';
    footerEl.style.display = footerEl.style.display === 'none' ? '' : 'none';
  });
  closeBtn.addEventListener('click', () => {
    panelEl.remove();
  });

  headerActions.appendChild(dryRunLabel);
  headerActions.appendChild(minimizeBtn);
  headerActions.appendChild(closeBtn);

  headerEl.appendChild(titleBlock);
  headerEl.appendChild(headerActions);
  panelEl.appendChild(headerEl);

  // ── Progress section (hidden by default) ─────────────────────────────────

  const progressSection = el('div', { class: 'ck-progress' });
  const progressText = el('div', { class: 'ck-progress-text' }, 'Submitting...');
  const progressBar = el('progress', { class: 'ck-progress-bar', value: 0, max: 1 } as any) as HTMLProgressElement;
  progressSection.appendChild(progressText);
  progressSection.appendChild(progressBar);
  panelEl.appendChild(progressSection);

  // ── Body ──────────────────────────────────────────────────────────────────

  const bodyEl = el('div', { class: 'ck-panel-body' });
  panelEl.appendChild(bodyEl);

  // ── Footer ────────────────────────────────────────────────────────────────

  const footerEl = el('div', { class: 'ck-panel-footer' });
  const footerText = el('span', {}, 'Submitted: 0/0 · Loading...');
  footerEl.appendChild(footerText);
  panelEl.appendChild(footerEl);

  // ── Load data and render ──────────────────────────────────────────────────

  // Listen for suspense items from the MAIN world
  function handleItemsReady(detail: { claimId: string; items: SuspenseItem[] }): void {
    const { claimId: cId, items } = detail;
    state.claimId = cId;

    getRules().then((rules) => {
      const matchResult = matchExpenses(items, rules);
      state.items = matchResult;

      const { matched, unmatched } = matchResult;
      const total = matched.length + unmatched.length;

      // Update header context
      const ctx2 = parseClaimContext(cId, items);
      contextText.textContent =
        `Claim: ${ctx2.month} ${ctx2.year} · ${matched.length} matched / ${unmatched.length} unmatched`;

      footerText.textContent = `Submitted: 0/${total} · Ready`;

      // Clear body
      bodyEl.innerHTML = '';

      // ── Matched section ───────────────────────────────────────────────────

      const matchedSection = el('div', { class: 'ck-matched-section' });

      const matchedHeader = el('div', { class: 'ck-section-header' });
      const matchedHeading = el('span', {}, `MATCHED (${matched.length})`);
      const submitAllBtn = el('button', { class: 'ck-submit-btn' }, 'Submit All');

      submitAllBtn.addEventListener(
        'click',
        buildBulkSubmitHandler(
          matched,
          cId,
          state,
          submitAllBtn,
          progressSection,
          progressText,
          progressBar,
          footerText,
          bodyEl,
          ctx,
        ),
      );

      matchedHeader.appendChild(matchedHeading);
      matchedHeader.appendChild(submitAllBtn);
      matchedSection.appendChild(matchedHeader);

      for (const { item, rule } of matched) {
        const rowEl = buildMatchedRow(item, rule, cId, state, ctx);
        matchedSection.appendChild(rowEl);
      }

      bodyEl.appendChild(matchedSection);

      // ── Unmatched section (placeholder for Plan 03) ───────────────────────

      const unmatchedSection = el('div', { class: 'ck-unmatched-section' });
      const unmatchedHeader = el('div', { class: 'ck-section-header' });
      unmatchedHeader.appendChild(el('span', {}, `UNMATCHED (${unmatched.length})`));
      unmatchedSection.appendChild(unmatchedHeader);

      for (const item of unmatched) {
        const rowEl = el('div', { class: 'ck-item-row', id: `ck-row-${item.id}` });
        const primary = el('div', { class: 'ck-item-primary' });
        const left = el('div', { class: 'ck-item-left' });
        left.appendChild(el('span', { class: 'ck-item-date' }, item.date.slice(0, 5)));
        left.appendChild(document.createTextNode(' '));
        left.appendChild(el('span', { class: 'ck-item-amount' }, formatAmount(item.amount)));
        left.appendChild(document.createTextNode(' '));
        // Extract description after the Starling account prefix
        const descLines = item.description.split('\n').filter(Boolean);
        const shortDesc = descLines[descLines.length - 1]?.trim() ?? item.description;
        left.appendChild(el('span', { class: 'ck-item-name' }, shortDesc));
        const assignBtn = el('button', { class: 'ck-submit-btn' }, 'Assign & Submit');
        assignBtn.title = 'Plan 03 will add the inline assignment form';
        primary.appendChild(left);
        primary.appendChild(assignBtn);
        rowEl.appendChild(primary);
        unmatchedSection.appendChild(rowEl);
      }

      bodyEl.appendChild(unmatchedSection);
    }).catch((err: Error) => {
      contextText.textContent = `Error loading rules: ${err.message}`;
    });
  }

  // Check for data already dispatched before we registered the listener
  const existingData = typeof window !== 'undefined' ? (window as any).__ckExpenseData : null;
  if (existingData) {
    handleItemsReady(existingData);
  } else {
    // Register listener for when MAIN world fires ck:items-ready
    const listener = (event: Event) => {
      if (event instanceof CustomEvent) handleItemsReady(event.detail);
    };
    if (ctx && typeof ctx.addEventListener === 'function') {
      ctx.addEventListener(document, 'ck:items-ready', listener);
    } else {
      document.addEventListener('ck:items-ready', listener);
    }
  }
}
