// ui/panel.ts
// Panel DOM builder and state controller for the CK Expense Automator.
// Injected into the Shadow DOM root by entrypoints/ck-panel.content.ts.

import type { SuspenseItem, ExpenseRule, MatchResult, ExpenseSubmission, SubmissionResult } from '../lib/types';
import { matchExpenses, buildPayload, calculateVatFromPercentage, validateVat } from '../lib/expense-engine';
import { submitExpense } from '../lib/ck-api';
import { getRules, recordRuleUsage, addRule } from '../lib/rules-store';
import {
  getCategoryLabel,
  extractForeignCurrency,
  deriveMatchPattern,
  isLikelyVatInclusive,
  sortCategoriesByUsage,
  CATEGORIES,
  DEFAULT_TOP_CATEGORIES,
} from './panel-utils';
import { extractVendor } from '../lib/vendor-extractor';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PanelState {
  items: MatchResult;
  claimId: string;
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
 * @param submitFn - Injectable submit function (defaults to submitExpense in production)
 * @param delayFn - Injectable delay function (takes ms, resolves after delay)
 * @param onProgress - Called after each item with (done, total)
 * @param onItemResult - Called after each item with (itemId, SubmissionResult)
 */
export async function submitAllWithDelay(
  items: Array<{ item: SuspenseItem; rule: ExpenseRule }>,
  claimId: string,
  submitFn: (submission: ExpenseSubmission) => Promise<SubmissionResult>,
  delayFn: (ms: number) => Promise<void>,
  onProgress: (done: number, total: number) => void,
  onItemResult: (itemId: string, result: SubmissionResult) => void,
): Promise<void> {
  const total = items.length;

  for (let i = 0; i < total; i++) {
    const { item, rule } = items[i];
    const submission = buildSubmissionForItem(item, rule, claimId);
    const result = await submitFn(submission);

    onItemResult(item.id, result);
    onProgress(i + 1, total);

    // Delay between submissions, but not after the last one
    if (i < total - 1) {
      await delayFn(400);
    }
  }
}

// ─── Unmatched item helpers (exported for unit testing) ──────────────────────

/**
 * Build an ExpenseRule from inline form values.
 * Called when the user submits an unmatched item with "Save as rule" checked.
 */
export function buildRuleFromForm(
  vendor: string,
  nominalId: string,
  description: string,
  hasVat: boolean,
  vatAmount: number | null,
  matchPattern: string,
): ExpenseRule {
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);

  return {
    id,
    name: description || vendor,
    matchPattern,
    matchFlags: 'i',
    nominalId,
    description,
    purchasedFrom: vendor,
    hasVat,
    vatAmount: hasVat ? vatAmount : null,
    vatPercentage: null,
    enabled: true,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Return all 20 category NominalIds sorted by usage frequency (desc).
 * Rules with higher matchCount for a given category float to the top.
 * Falls back to DEFAULT_TOP_CATEGORIES ordering when no usage data exists.
 *
 * Note: ExpenseRule.matchCount is a usage stat stored on the rule itself
 * (mirrored from storage.local for display purposes).
 */
export function getTopCategories(rules: ExpenseRule[]): string[] {
  // Sum matchCount per nominalId across all rules
  const usageCounts: Record<string, number> = {};
  for (const rule of rules) {
    const count = rule.matchCount ?? 0;
    if (count > 0) {
      usageCounts[rule.nominalId] = (usageCounts[rule.nominalId] ?? 0) + count;
    }
  }
  return sortCategoriesByUsage(CATEGORIES.map((c) => c.id), usageCounts);
}

/**
 * Submit an unmatched item using values from the inline form element.
 *
 * Flow:
 * 1. Read form values (nominalId, reason, vendor, hasVat, vatAmount, saveAsRule, matchPattern)
 * 2. Validate: reason required; if hasVat, validate VAT via validateVat()
 * 3. Call submitExpense; on success optionally call addRule(); call onSuccess
 * 4. On any validation or submission error: show in .ck-form-error div
 */
export async function submitUnmatched(
  item: SuspenseItem,
  claimId: string,
  formEl: HTMLElement,
  rules: ExpenseRule[],
  onSuccess: () => void,
): Promise<void> {
  // Read form values
  const nominalIdEl = formEl.querySelector('[name="nominalId"]') as HTMLSelectElement | null;
  const reasonEl = formEl.querySelector('[name="reason"]') as HTMLInputElement | null;
  const vendorEl = formEl.querySelector('[name="vendor"]') as HTMLInputElement | null;
  const hasVatEl = formEl.querySelector('[name="hasVat"]') as HTMLInputElement | null;
  const vatAmountEl = formEl.querySelector('[name="vatAmount"]') as HTMLInputElement | null;
  const saveAsRuleEl = formEl.querySelector('[name="saveAsRule"]') as HTMLInputElement | null;
  const matchPatternEl = formEl.querySelector('[name="matchPattern"]') as HTMLInputElement | null;
  const errorDiv = formEl.querySelector('.ck-form-error') as HTMLElement | null;

  const nominalId = nominalIdEl?.value ?? '68';
  const reason = (reasonEl?.value ?? '').trim();
  const vendor = (vendorEl?.value ?? '').trim();
  const hasVat = hasVatEl?.checked ?? false;
  const vatAmountRaw = (vatAmountEl?.value ?? '').trim();
  const vatAmount = vatAmountRaw ? parseFloat(vatAmountRaw) : null;
  const saveAsRule = saveAsRuleEl?.checked ?? false;
  const matchPattern = (matchPatternEl?.value ?? '').trim();

  const showError = (msg: string): void => {
    if (errorDiv) errorDiv.textContent = msg;
  };

  // Validation: reason is required
  if (!reason) {
    showError('Reason is required.');
    return;
  }

  // Validation: VAT amount when hasVat is checked
  if (hasVat && vatAmount !== null) {
    const vatCheck = validateVat(item.amount, vatAmount);
    if (!vatCheck.valid) {
      showError(vatCheck.error ?? 'Invalid VAT amount.');
      return;
    }
  }

  // Clear any previous error
  showError('');

  // Build a synthetic rule for submission
  const syntheticRule: ExpenseRule = buildRuleFromForm(
    vendor || item.description,
    nominalId,
    reason,
    hasVat,
    vatAmount,
    matchPattern || deriveMatchPattern(vendor),
  );

  const submission: ExpenseSubmission = buildSubmissionForItem(item, syntheticRule, claimId);
  const result = await submitExpense(submission);

  if (result.success) {
    if (saveAsRule) {
      await addRule(
        buildRuleFromForm(
          vendor || item.description,
          nominalId,
          reason,
          hasVat,
          vatAmount,
          matchPattern || deriveMatchPattern(vendor),
        ),
      );
    }
    onSuccess();
  } else {
    const errorMsg = result.validationMessages?.join('; ') ?? result.error ?? 'Submission failed.';
    showError(errorMsg);
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

// ─── Unmatched item DOM renderers ────────────────────────────────────────────

/**
 * Build the inline assignment form for an unmatched suspense item.
 * The form is hidden by default and shown when the row has .ck-form-open class.
 */
function renderInlineForm(
  item: SuspenseItem,
  claimId: string,
  rules: ExpenseRule[],
  rowEl: HTMLElement,
  onAssign?: (item: SuspenseItem, rule: ExpenseRule) => void,
  toggleIcon?: HTMLElement,
): HTMLElement {
  const formEl = el('div', { class: 'ck-inline-form' });

  const topCategories = getTopCategories(rules);
  const vendorFromDesc = extractVendor(item.description);
  const vendor = vendorFromDesc ?? '';

  // VAT divisibility hint text (computed once)
  const vatHintText = isLikelyVatInclusive(item.amount)
    ? `This amount may include 20% VAT (£${(item.amount - item.amount / 1.2).toFixed(2)})`
    : '';

  // ── Category row ─────────────────────────────────────────────────────────
  const categoryRow = el('div', { class: 'ck-form-row' });
  const categoryLabel = el('label', {}, 'Category');
  const categorySelect = el('select', { name: 'nominalId' } as any);
  for (const catId of topCategories) {
    const option = el('option', { value: catId } as any, getCategoryLabel(catId));
    if (catId === '68') (option as HTMLOptionElement).selected = true;
    categorySelect.appendChild(option);
  }
  categoryRow.appendChild(categoryLabel);
  categoryRow.appendChild(categorySelect);
  formEl.appendChild(categoryRow);

  // ── Reason row ───────────────────────────────────────────────────────────
  const reasonRow = el('div', { class: 'ck-form-row' });
  const reasonLabel = el('label', {}, 'Reason');
  const reasonInput = el('input', { type: 'text', name: 'reason', placeholder: 'e.g. Cloud DB' } as any);
  reasonRow.appendChild(reasonLabel);
  reasonRow.appendChild(reasonInput);
  formEl.appendChild(reasonRow);

  // ── Vendor row ───────────────────────────────────────────────────────────
  const vendorRow = el('div', { class: 'ck-form-row' });
  const vendorLabel = el('label', {}, 'Vendor');
  const vendorInput = el('input', { type: 'text', name: 'vendor', value: vendor } as any);
  vendorRow.appendChild(vendorLabel);
  vendorRow.appendChild(vendorInput);
  formEl.appendChild(vendorRow);

  // ── Has VAT row ──────────────────────────────────────────────────────────
  const vatCheckRow = el('div', { class: 'ck-form-checkbox-row' });
  const vatCheckbox = el('input', { type: 'checkbox', name: 'hasVat' } as any);
  const vatCheckLabel = el('label', {}, 'Has VAT receipt');
  vatCheckRow.appendChild(vatCheckbox);
  vatCheckRow.appendChild(vatCheckLabel);
  formEl.appendChild(vatCheckRow);

  // ── VAT amount row ───────────────────────────────────────────────────────
  const vatAmountRow = el('div', { class: 'ck-form-row' });
  const vatAmountLabel = el('label', {}, 'VAT Amount (£)');
  const vatAmountInput = el('input', {
    type: 'number',
    name: 'vatAmount',
    placeholder: '0.00',
    disabled: true,
    step: '0.01',
    min: '0',
  } as any);
  const vatHintDiv = el('div', { class: `ck-vat-hint${vatHintText ? ' ck-visible' : ''}` }, vatHintText);
  vatAmountRow.appendChild(vatAmountLabel);
  vatAmountRow.appendChild(vatAmountInput);
  vatAmountRow.appendChild(vatHintDiv);
  formEl.appendChild(vatAmountRow);

  // Toggle VAT amount field when checkbox changes
  vatCheckbox.addEventListener('change', () => {
    (vatAmountInput as HTMLInputElement).disabled = !(vatCheckbox as HTMLInputElement).checked;
  });

  // ── Save as rule section ─────────────────────────────────────────────────
  const saveRuleSection = el('div', { class: 'ck-save-rule-section' });

  const saveRuleRow = el('div', { class: 'ck-form-checkbox-row' });
  const saveRuleCheckbox = el('input', {
    type: 'checkbox',
    name: 'saveAsRule',
    id: `ck-save-rule-${item.id}`,
    checked: false,
  } as any);
  const saveRuleLabel = el('label', { htmlFor: `ck-save-rule-${item.id}` }, 'Save as rule for future matches');
  saveRuleRow.appendChild(saveRuleCheckbox);
  saveRuleRow.appendChild(saveRuleLabel);
  saveRuleSection.appendChild(saveRuleRow);

  // Match pattern input (hidden by default, shown when saveAsRule checked)
  const patternRow = el('div', { class: 'ck-match-pattern-row' });
  const patternLabel = el('label', {});
  patternLabel.appendChild(document.createTextNode('Match pattern ('));
  const regexLink = el('a', { href: 'https://regexone.com', target: '_blank' } as any, 'regex');
  Object.assign(regexLink.style, { color: '#2563eb', textDecoration: 'underline' });
  patternLabel.appendChild(regexLink);
  patternLabel.appendChild(document.createTextNode(')'));
  const fallbackDesc = item.description.split('\n').pop()?.trim() ?? item.description;
  const defaultPattern = deriveMatchPattern(vendorFromDesc ?? fallbackDesc);
  const patternInput = el('input', {
    type: 'text',
    name: 'matchPattern',
    value: defaultPattern,
  } as any);
  patternRow.appendChild(patternLabel);
  patternRow.appendChild(patternInput);
  saveRuleSection.appendChild(patternRow);

  // Toggle match pattern visibility when saveAsRule changes
  saveRuleCheckbox.addEventListener('change', () => {
    const checked = (saveRuleCheckbox as HTMLInputElement).checked;
    if (checked) {
      patternRow.classList.add('ck-visible');
    } else {
      patternRow.classList.remove('ck-visible');
    }
  });

  formEl.appendChild(saveRuleSection);

  // ── Error div ────────────────────────────────────────────────────────────
  const errorDiv = el('div', { class: 'ck-form-error' });
  formEl.appendChild(errorDiv);

  // ── Actions row ──────────────────────────────────────────────────────────
  const actionsRow = el('div', { class: 'ck-form-actions' });

  const cancelBtn = el('button', { class: 'ck-form-cancel-btn', type: 'button' } as any, 'Cancel');
  cancelBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    rowEl.classList.remove('ck-form-open');
    if (toggleIcon) toggleIcon.textContent = '+';
    errorDiv.textContent = '';
  });

  const assignSubmitBtn = el('button', { class: 'ck-form-submit-btn', type: 'button' } as any, 'Assign');
  assignSubmitBtn.addEventListener('click', async (e) => {
    e.stopPropagation();

    // Read form values
    const nominalId = (formEl.querySelector('[name="nominalId"]') as HTMLSelectElement)?.value ?? '68';
    const reason = ((formEl.querySelector('[name="reason"]') as HTMLInputElement)?.value ?? '').trim();
    const vendor = ((formEl.querySelector('[name="vendor"]') as HTMLInputElement)?.value ?? '').trim();
    const hasVat = (formEl.querySelector('[name="hasVat"]') as HTMLInputElement)?.checked ?? false;
    const vatAmountRaw = ((formEl.querySelector('[name="vatAmount"]') as HTMLInputElement)?.value ?? '').trim();
    const vatAmount = vatAmountRaw ? parseFloat(vatAmountRaw) : null;
    const saveAsRule = (formEl.querySelector('[name="saveAsRule"]') as HTMLInputElement)?.checked ?? false;
    const matchPattern = ((formEl.querySelector('[name="matchPattern"]') as HTMLInputElement)?.value ?? '').trim();

    // Clear previous validation errors
    formEl.querySelectorAll('.ck-field-error').forEach(e => e.remove());
    formEl.querySelectorAll('.ck-input-error').forEach(e => e.classList.remove('ck-input-error'));
    errorDiv.textContent = '';

    // Validate
    let valid = true;

    const reasonInput = formEl.querySelector('[name="reason"]') as HTMLInputElement;
    if (!reason) {
      reasonInput?.classList.add('ck-input-error');
      const errMsg = el('div', { class: 'ck-field-error' }, 'Reason is required');
      reasonInput?.parentElement?.appendChild(errMsg);
      valid = false;
    }

    if (hasVat && vatAmount !== null) {
      const vatCheck = validateVat(item.amount, vatAmount);
      if (!vatCheck.valid) {
        const vatInput = formEl.querySelector('[name="vatAmount"]') as HTMLInputElement;
        vatInput?.classList.add('ck-input-error');
        const errMsg = el('div', { class: 'ck-field-error' }, vatCheck.error ?? 'Invalid VAT amount');
        vatInput?.parentElement?.appendChild(errMsg);
        valid = false;
      }
    }

    if (!valid) return;

    // Build the rule
    const syntheticRule = buildRuleFromForm(
      vendor || item.description,
      nominalId,
      reason,
      hasVat,
      vatAmount,
      matchPattern || deriveMatchPattern(vendor),
    );

    // Save as rule if checked
    if (saveAsRule) {
      await addRule(syntheticRule);
    }

    // Move to matched section via callback
    if (onAssign) {
      onAssign(item, syntheticRule);
    }

    // Remove this unmatched row
    rowEl.remove();
  });

  actionsRow.appendChild(cancelBtn);
  actionsRow.appendChild(assignSubmitBtn);
  formEl.appendChild(actionsRow);

  return formEl;
}

/**
 * Build a single unmatched item row with [Assign] button and inline form.
 */
function renderUnmatchedRow(
  item: SuspenseItem,
  claimId: string,
  rules: ExpenseRule[],
  onAssign?: (item: SuspenseItem, rule: ExpenseRule) => void,
): HTMLElement {
  const rowEl = el('div', { class: 'ck-item-row', id: `ck-row-${item.id}` });

  // Primary row with date, amount, description, and assign button
  const primaryRow = el('div', { class: 'ck-item-primary ck-unmatched-row' });

  const toggleIcon = el('span', { class: 'ck-toggle-icon' }, '+');

  const left = el('div', { class: 'ck-item-left' });
  left.appendChild(el('span', { class: 'ck-item-date' }, item.date.slice(0, 5)));
  left.appendChild(document.createTextNode(' '));
  left.appendChild(el('span', { class: 'ck-item-amount' }, formatAmount(item.amount)));
  left.appendChild(document.createTextNode(' '));

  // Extract description after the Starling account prefix
  const descLines = item.description.split('\n').filter(Boolean);
  const shortDesc = (descLines[descLines.length - 1]?.trim() ?? item.description).slice(0, 40);
  left.appendChild(el('span', { class: 'ck-item-name' }, shortDesc));

  // Entire primary row is clickable to toggle the form
  primaryRow.style.cursor = 'pointer';
  primaryRow.addEventListener('click', () => {
    const isOpen = rowEl.classList.toggle('ck-form-open');
    toggleIcon.textContent = isOpen ? '−' : '+';
  });

  primaryRow.appendChild(left);
  primaryRow.appendChild(toggleIcon);
  rowEl.appendChild(primaryRow);

  // Build inline form (hidden until ck-form-open applied)
  const inlineForm = renderInlineForm(item, claimId, rules, rowEl, onAssign, toggleIcon);
  rowEl.appendChild(inlineForm);

  return rowEl;
}

// ─── Individual item submit ───────────────────────────────────────────────────

async function submitOne(
  item: SuspenseItem,
  rule: ExpenseRule,
  claimId: string,
  rowEl: HTMLElement,
  onSuccess?: () => void,
): Promise<void> {
  // Disable the submit button
  const submitBtn = rowEl.querySelector('.ck-submit-btn') as HTMLButtonElement | null;
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = '...';
  }

  const submission = buildSubmissionForItem(item, rule, claimId);
  const result = await submitExpense(submission);

  if (result.success) {
    await recordRuleUsage(rule.id);
    applySuccessState(rowEl);
    onSuccess?.();
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
          submitOne(item, rule, claimId, rowEl);
        });
        container.appendChild(newBtn);
      }
      rowEl.classList.remove('ck-error');
      const errEl = rowEl.querySelector('.ck-error-text');
      if (errEl) errEl.remove();
      submitOne(item, rule, claimId, rowEl);
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
  onSubmitSuccess?: () => void,
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
    submitOne(item, rule, claimId, rowEl, () => {
      state.submittedCount++;
      onSubmitSuccess?.();
    });
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

  // [Edit] replaces the details table with editable fields
  detailsDiv.querySelector('.ck-edit-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Build edit form
    const editForm = document.createElement('div');
    editForm.className = 'ck-edit-form';
    editForm.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:6px;padding:4px 0;">
        <label style="font-size:11px;color:#6b7280;">Category
          <select class="ck-edit-category" style="width:100%;padding:4px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;font-family:inherit;box-sizing:border-box;"></select>
        </label>
        <label style="font-size:11px;color:#6b7280;">Reason
          <input class="ck-edit-description" type="text" value="${rule.description}" style="width:100%;padding:4px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;font-family:inherit;box-sizing:border-box;" />
        </label>
        <label style="font-size:11px;color:#6b7280;">Vendor
          <input class="ck-edit-vendor" type="text" value="${rule.purchasedFrom}" style="width:100%;padding:4px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;font-family:inherit;box-sizing:border-box;" />
        </label>
        <div style="display:flex;gap:8px;margin-top:4px;">
          <button class="ck-edit-save" style="background:#2563eb;color:#fff;border:none;border-radius:4px;padding:4px 12px;font-size:12px;cursor:pointer;font-family:inherit;">Save</button>
          <button class="ck-edit-cancel" style="background:#6b7280;color:#fff;border:none;border-radius:4px;padding:4px 12px;font-size:12px;cursor:pointer;font-family:inherit;">Cancel</button>
        </div>
      </div>
    `;

    // Populate category dropdown
    const catSelect = editForm.querySelector('.ck-edit-category') as HTMLSelectElement;
    for (const cat of CATEGORIES) {
      const opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = cat.label;
      if (cat.id === rule.nominalId) opt.selected = true;
      catSelect.appendChild(opt);
    }

    // Replace details content with edit form
    const originalHTML = detailsDiv.innerHTML;
    detailsDiv.innerHTML = '';
    detailsDiv.appendChild(editForm);

    // Stop clicks inside form from collapsing the row
    editForm.addEventListener('click', (ev) => ev.stopPropagation());

    // Cancel restores original
    editForm.querySelector('.ck-edit-cancel')?.addEventListener('click', () => {
      detailsDiv.innerHTML = originalHTML;
      // Re-attach the edit listener
      detailsDiv.querySelector('.ck-edit-link')?.addEventListener('click', (e2) => {
        (e2 as Event).preventDefault();
        (e2 as Event).stopPropagation();
        // Re-trigger by dispatching a new click — but simpler to just reload
        // For now, editing is one-shot per expand
      });
    });

    // Save updates the rule object for this submission
    editForm.querySelector('.ck-edit-save')?.addEventListener('click', () => {
      rule.nominalId = catSelect.value;
      rule.description = (editForm.querySelector('.ck-edit-description') as HTMLInputElement).value;
      rule.purchasedFrom = (editForm.querySelector('.ck-edit-vendor') as HTMLInputElement).value;

      // Update the secondary row text
      const newCatLabel = getCategoryLabel(rule.nominalId);
      const newVatSummary = formatVatSummary(rule);
      secondaryRow.textContent = `${newCatLabel} · ${rule.purchasedFrom} · ${newVatSummary}`;

      // Restore details view with updated values
      detailsDiv.innerHTML = `
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:2px 8px 2px 0;color:#6b7280;white-space:nowrap;">Category</td><td>${newCatLabel}</td></tr>
          <tr><td style="padding:2px 8px 2px 0;color:#6b7280;white-space:nowrap;">Reason</td><td>${rule.description}</td></tr>
          <tr><td style="padding:2px 8px 2px 0;color:#6b7280;white-space:nowrap;">Vendor</td><td>${rule.purchasedFrom}</td></tr>
          <tr><td style="padding:2px 8px 2px 0;color:#6b7280;white-space:nowrap;">Amount</td><td>${formatAmount(item.amount)}</td></tr>
          <tr><td style="padding:2px 8px 2px 0;color:#6b7280;white-space:nowrap;">VAT</td><td>${newVatSummary}</td></tr>
          <tr><td style="padding:2px 8px 2px 0;color:#6b7280;white-space:nowrap;">Date</td><td>${item.date}</td></tr>
        </table>
        <a href="#" class="ck-edit-link" style="font-size:11px;color:#2563eb;text-decoration:underline;margin-top:4px;display:inline-block;">[Edit]</a>
      `;
    });
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
      submitExpense,
      delayFn,
      (done, total) => {
        progressBar.value = done;
        progressText.textContent = `Submitting ${done}/${total}...`;
      },
      async (itemId, result) => {
        const rowEl = bodyEl.querySelector(`#ck-row-${itemId}`) as HTMLElement | null;
        if (result.success) {
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
                submitOne(pair.item, pair.rule, claimId, rowEl);
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
    const summaryText = `${submitted} submitted, ${failed} failed`;
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
    submitting: false,
    submittedCount: 0,
    failedCount: 0,
    expandedItemId: null,
  };

  // ── Header ────────────────────────────────────────────────────────────────

  const headerEl = el('div', { class: 'ck-panel-header' });

  const titleBlock = el('div', { class: 'ck-panel-title' });
  const titleText = el('div', {}, 'CK Expense Automator');
  titleBlock.appendChild(titleText);

  // Minimize and close buttons
  const headerActions = el('div', { class: 'ck-panel-header-actions' });
  const minimizeBtn = el('button', { class: 'ck-header-btn' }, '−');

  let minimized = false;

  function applyMinimizedState(isMinimized: boolean): void {
    minimized = isMinimized;
    bodyEl.style.display = minimized ? 'none' : '';
    footerEl.style.display = minimized ? 'none' : '';
    progressSection.style.display = minimized ? 'none' : '';
    minimizeBtn.textContent = minimized ? '+' : '−';

    const containerEl = panelEl.parentElement;
    const htmlWrapper = containerEl?.parentElement;
    if (htmlWrapper) {
      if (minimized) {
        (htmlWrapper as HTMLElement).style.alignItems = 'flex-end';
        (htmlWrapper as HTMLElement).style.justifyContent = 'flex-end';
        (htmlWrapper as HTMLElement).style.padding = '0 24px 24px 0';
      } else {
        (htmlWrapper as HTMLElement).style.alignItems = 'center';
        (htmlWrapper as HTMLElement).style.justifyContent = 'center';
        (htmlWrapper as HTMLElement).style.padding = '0';
      }
    }
  }

  // Restore persisted state
  if (typeof browser !== 'undefined' && browser.storage?.local) {
    browser.storage.local.get('panelMinimized').then((result: Record<string, unknown>) => {
      if (result['panelMinimized'] === true) {
        applyMinimizedState(true);
      }
    });
  }

  minimizeBtn.addEventListener('click', () => {
    applyMinimizedState(!minimized);
    // Persist
    if (typeof browser !== 'undefined' && browser.storage?.local) {
      browser.storage.local.set({ panelMinimized: minimized });
    }
  });
  headerActions.appendChild(minimizeBtn);

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
  const footerText = el('span', {}, 'Ready');
  footerEl.appendChild(footerText);
  panelEl.appendChild(footerEl);

  // ── Scan button (initial state) ──────────────────────────────────────────

  const scanSection = el('div', { class: 'ck-scan-section' });
  const scanBtn = el('button', { class: 'ck-scan-btn' }, 'Scan Items');
  const scanHint = el('div', { class: 'ck-scan-hint' }, 'Reads your unmapped bank transactions');
  scanSection.appendChild(scanBtn);
  scanSection.appendChild(scanHint);
  bodyEl.appendChild(scanSection);

  scanBtn.addEventListener('click', () => {
    scanBtn.textContent = 'Scanning...';
    (scanBtn as HTMLButtonElement).disabled = true;
    footerText.textContent = 'Scanning...';
    // Tell MAIN world to read the DataTable
    window.postMessage({ type: 'ck:scan-items', payload: { claimId } }, '*');
  });

  // ── Load data and render ──────────────────────────────────────────────────

  function handleItemsReady(detail: { claimId: string; items: SuspenseItem[] }): void {
    // Remove scan section once data arrives
    scanSection.remove();
    const { claimId: cId, items } = detail;
    state.claimId = cId;

    getRules().then((rules) => {
      const matchResult = matchExpenses(items, rules);
      state.items = matchResult;

      const { matched, unmatched } = matchResult;
      const total = matched.length + unmatched.length;

      const ctx2 = parseClaimContext(cId, items);
      footerText.textContent = `${matched.length} matched · ${unmatched.length} unmatched · Ready`;

      // Update footer after each individual submit
      const updateFooter = () => {
        const totalItems = state.items.matched.length + state.items.unmatched.length;
        if (state.submittedCount >= state.items.matched.length && state.items.unmatched.length === 0) {
          footerText.textContent = `All ${state.submittedCount} submitted · Reload page to update`;
        } else {
          footerText.textContent = `Submitted: ${state.submittedCount}/${totalItems} · Reload page to see changes`;
        }
      };

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
      if (matched.length > 0) {
        matchedHeader.appendChild(submitAllBtn);
      }
      matchedSection.appendChild(matchedHeader);

      for (const { item, rule } of matched) {
        const rowEl = buildMatchedRow(item, rule, cId, state, ctx, updateFooter);
        matchedSection.appendChild(rowEl);
      }

      bodyEl.appendChild(matchedSection);

      // ── Unmatched section ─────────────────────────────────────────────────

      const unmatchedSection = el('div', { class: 'ck-unmatched-section' });
      const unmatchedHeader = el('div', { class: 'ck-section-header' });
      const unmatchedHeading = el('span', {}, `UNMATCHED (${unmatched.length})`);
      unmatchedHeader.appendChild(unmatchedHeading);
      unmatchedSection.appendChild(unmatchedHeader);

      // Callback when an unmatched item is assigned — move it to matched section
      const handleAssign = (assignedItem: SuspenseItem, assignedRule: ExpenseRule) => {
        // Add to matched state
        state.items.matched.push({ item: assignedItem, rule: assignedRule });
        state.items.unmatched = state.items.unmatched.filter(u => u.id !== assignedItem.id);

        // Add a matched row to the matched section
        const newRow = buildMatchedRow(assignedItem, assignedRule, cId, state, ctx, updateFooter);
        matchedSection.appendChild(newRow);

        // Update counts
        const mc = state.items.matched.length;
        const uc = state.items.unmatched.length;
        matchedHeading.textContent = `MATCHED (${mc})`;
        unmatchedHeading.textContent = `UNMATCHED (${uc})`;
        footerText.textContent = `${mc} matched · ${uc} unmatched · Ready`;
      };

      for (const item of unmatched) {
        const rowEl = renderUnmatchedRow(item, cId, rules, handleAssign);
        unmatchedSection.appendChild(rowEl);
      }

      bodyEl.appendChild(unmatchedSection);
    }).catch((err: Error) => {
      footerText.textContent = `Error loading rules: ${err.message}`;
    });
  }

  // Listen for data from MAIN world via window.postMessage (crosses world boundary).
  window.addEventListener('message', (event: MessageEvent) => {
    if (event.data?.type === 'ck:items-ready' && event.data?.payload) {
      handleItemsReady(event.data.payload);
    }
    if (event.data?.type === 'ck:scan-error') {
      scanBtn.textContent = 'Scan Items';
      (scanBtn as HTMLButtonElement).disabled = false;
      footerText.textContent = 'Scan failed — see console for details';
    }
  });
}
