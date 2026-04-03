// entrypoints/options/main.ts
// Options page — full rule management: list, add, inline edit, delete, enable/disable, reset.

import { getRules, addRule, updateRule, deleteRule, saveRules, DEFAULT_RULES } from '../../lib/rules-store';
import { CATEGORIES, getCategoryLabel } from '../../ui/panel-utils';
import type { ExpenseRule } from '../../lib/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatVat(rule: ExpenseRule): string {
  if (!rule.hasVat) return 'None';
  if (rule.vatAmount !== null) return `£${rule.vatAmount.toFixed(2)}`;
  if (rule.vatPercentage !== null) return `${rule.vatPercentage}%`;
  return 'Yes (unspecified)';
}

function formatUsage(rule: ExpenseRule): string {
  const count = rule.matchCount ?? 0;
  const lastUsed = rule.lastUsed
    ? new Date(rule.lastUsed).toLocaleDateString('en-GB')
    : 'Never';
  return `${count} uses · ${lastUsed}`;
}

function categoryOptionsHtml(selectedId: string): string {
  return CATEGORIES.map(
    (cat) => `<option value="${cat.id}" ${cat.id === selectedId ? 'selected' : ''}>${cat.label}</option>`,
  ).join('');
}

// ─── Row rendering ────────────────────────────────────────────────────────────

function renderViewRow(rule: ExpenseRule): string {
  const badgeClass = rule.enabled ? 'enabled-badge' : 'disabled-badge';
  return `
    <tr data-rule-id="${rule.id}">
      <td>
        <input type="checkbox" class="toggle" data-action="toggle-enabled" data-rule-id="${rule.id}" ${rule.enabled ? 'checked' : ''} title="${rule.enabled ? 'Enabled' : 'Disabled'}">
      </td>
      <td>
        <span class="${badgeClass}"></span>${escapeHtml(rule.name)}
      </td>
      <td><code>${escapeHtml(rule.matchPattern)}</code></td>
      <td>${escapeHtml(getCategoryLabel(rule.nominalId))}</td>
      <td>${escapeHtml(rule.purchasedFrom)}</td>
      <td>${escapeHtml(formatVat(rule))}</td>
      <td class="muted">${escapeHtml(formatUsage(rule))}</td>
      <td>
        <div class="actions-cell">
          <button class="btn btn-edit" data-action="edit" data-rule-id="${rule.id}">Edit</button>
          <button class="btn btn-delete" data-action="delete" data-rule-id="${rule.id}">Delete</button>
        </div>
      </td>
    </tr>
  `;
}

function renderEditRow(rule: ExpenseRule): string {
  return `
    <tr data-rule-id="${rule.id}" class="editing">
      <td>
        <input type="checkbox" class="toggle" ${rule.enabled ? 'checked' : ''} id="edit-enabled-${rule.id}">
      </td>
      <td>
        <input type="text" id="edit-name-${rule.id}" value="${escapeHtml(rule.name)}" placeholder="Rule name">
      </td>
      <td>
        <input type="text" id="edit-pattern-${rule.id}" value="${escapeHtml(rule.matchPattern)}" placeholder="Regex pattern">
      </td>
      <td>
        <select id="edit-nominal-${rule.id}">
          ${categoryOptionsHtml(rule.nominalId)}
        </select>
      </td>
      <td>
        <input type="text" id="edit-vendor-${rule.id}" value="${escapeHtml(rule.purchasedFrom)}" placeholder="Vendor">
      </td>
      <td>
        <div style="display:flex;flex-direction:column;gap:4px;">
          <label style="font-size:12px;display:flex;align-items:center;gap:4px;">
            <input type="checkbox" id="edit-hasvat-${rule.id}" ${rule.hasVat ? 'checked' : ''}> Has VAT
          </label>
          <div id="edit-vat-fields-${rule.id}" style="${rule.hasVat ? '' : 'display:none'}">
            <input type="number" id="edit-vat-amount-${rule.id}" value="${rule.vatAmount ?? ''}" placeholder="Fixed £" min="0" step="0.01" style="width:80px;margin-bottom:4px;">
            <input type="number" id="edit-vat-pct-${rule.id}" value="${rule.vatPercentage ?? ''}" placeholder="%" min="0" max="100" step="0.1" style="width:70px;">
          </div>
        </div>
      </td>
      <td class="muted">${escapeHtml(formatUsage(rule))}</td>
      <td>
        <div class="actions-cell">
          <button class="btn btn-save" data-action="save" data-rule-id="${rule.id}">Save</button>
          <button class="btn btn-cancel" data-action="cancel" data-rule-id="${rule.id}">Cancel</button>
        </div>
      </td>
    </tr>
  `;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ─── Full page render ─────────────────────────────────────────────────────────

let currentRules: ExpenseRule[] = [];
let editingRuleId: string | null = null;

function renderPage(rules: ExpenseRule[]): void {
  currentRules = rules;
  editingRuleId = null;
  const app = document.getElementById('app');
  if (!app) return;

  const rulesHtml = rules.map((r) => renderViewRow(r)).join('');

  app.innerHTML = `
    <h1>CK Expense Automator — Rule Manager</h1>

    <!-- Add Rule form (hidden by default) -->
    <div class="add-form" id="add-form">
      <h2>Add New Rule</h2>
      <div class="add-form-grid">
        <div class="add-form-field">
          <label for="new-name">Name</label>
          <input type="text" id="new-name" placeholder="e.g. Supabase">
        </div>
        <div class="add-form-field">
          <label for="new-pattern">Match Pattern (regex)</label>
          <input type="text" id="new-pattern" placeholder="e.g. supabase">
        </div>
        <div class="add-form-field">
          <label for="new-nominal">Category</label>
          <select id="new-nominal">
            ${categoryOptionsHtml('68')}
          </select>
        </div>
        <div class="add-form-field">
          <label for="new-description">Reason</label>
          <input type="text" id="new-description" placeholder="e.g. Cloud DB">
        </div>
        <div class="add-form-field">
          <label for="new-vendor">Vendor</label>
          <input type="text" id="new-vendor" placeholder="e.g. Supabase">
        </div>
        <div class="add-form-field add-form-vat">
          <label style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:500;color:#374151;">
            <input type="checkbox" id="new-hasvat"> Has VAT Receipt
          </label>
          <div class="vat-sub-fields" id="new-vat-sub">
            <div class="add-form-vat-amount">
              <label for="new-vat-amount">VAT Amount (£)</label>
              <input type="number" id="new-vat-amount" min="0" step="0.01" placeholder="0.00">
            </div>
            <div class="add-form-vat-pct">
              <label for="new-vat-pct">VAT % (of gross)</label>
              <input type="number" id="new-vat-pct" min="0" max="100" step="0.1" placeholder="20">
            </div>
          </div>
        </div>
      </div>
      <div class="add-form-actions">
        <button class="btn btn-save" id="btn-add-submit">Add Rule</button>
        <button class="btn btn-cancel" id="btn-add-cancel">Cancel</button>
      </div>
    </div>

    <div class="toolbar">
      <span class="toolbar-left" id="rule-count">${rules.length} rule${rules.length !== 1 ? 's' : ''}</span>
      <div class="toolbar-right">
        <button class="btn-add-rule" id="btn-show-add">Add Rule</button>
        <button class="btn-reset" id="btn-reset">Reset to Defaults</button>
      </div>
    </div>

    <table id="rules-table">
      <thead>
        <tr>
          <th>On</th>
          <th>Name</th>
          <th>Match Pattern</th>
          <th>Category</th>
          <th>Vendor</th>
          <th>VAT</th>
          <th>Usage</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody id="rules-tbody">
        ${rulesHtml}
      </tbody>
    </table>
  `;

  attachEventListeners();
}

// ─── Event handling ───────────────────────────────────────────────────────────

function attachEventListeners(): void {
  // Table delegate — handles toggle, edit, save, cancel, delete
  const tbody = document.getElementById('rules-tbody');
  tbody?.addEventListener('click', handleTableClick);
  tbody?.addEventListener('change', handleTableChange);

  // Has VAT change listener for edit rows (toggle vat fields visibility)
  tbody?.addEventListener('change', (e) => {
    const target = e.target as HTMLInputElement;
    if (target.type === 'checkbox' && target.id.startsWith('edit-hasvat-')) {
      const ruleId = target.id.replace('edit-hasvat-', '');
      const vatFields = document.getElementById(`edit-vat-fields-${ruleId}`);
      if (vatFields) vatFields.style.display = target.checked ? '' : 'none';
    }
  });

  // Add form toggle
  document.getElementById('btn-show-add')?.addEventListener('click', () => {
    const form = document.getElementById('add-form');
    form?.classList.add('visible');
    document.getElementById('new-name')?.focus();
  });

  document.getElementById('btn-add-cancel')?.addEventListener('click', () => {
    const form = document.getElementById('add-form');
    form?.classList.remove('visible');
    clearAddForm();
  });

  document.getElementById('btn-add-submit')?.addEventListener('click', () => {
    handleAddRule();
  });

  // Has VAT toggle in add form
  document.getElementById('new-hasvat')?.addEventListener('change', (e) => {
    const checked = (e.target as HTMLInputElement).checked;
    const subFields = document.getElementById('new-vat-sub');
    if (subFields) {
      if (checked) subFields.classList.add('visible');
      else subFields.classList.remove('visible');
    }
  });

  // Reset to defaults
  document.getElementById('btn-reset')?.addEventListener('click', () => {
    if (window.confirm('Reset ALL rules to defaults? This will delete all your custom rules.')) {
      saveRules(DEFAULT_RULES).then(() => initPage());
    }
  });
}

async function handleTableClick(e: Event): Promise<void> {
  const target = e.target as HTMLElement;
  const action = target.dataset.action;
  const ruleId = target.dataset.ruleId;
  if (!action || !ruleId) return;

  if (action === 'edit') {
    handleEditClick(ruleId);
  } else if (action === 'save') {
    await handleSaveClick(ruleId);
  } else if (action === 'cancel') {
    handleCancelClick(ruleId);
  } else if (action === 'delete') {
    await handleDeleteClick(ruleId);
  }
}

async function handleTableChange(e: Event): Promise<void> {
  const target = e.target as HTMLInputElement;
  if (target.dataset.action === 'toggle-enabled') {
    const ruleId = target.dataset.ruleId;
    if (!ruleId) return;
    const rule = currentRules.find((r) => r.id === ruleId);
    if (!rule) return;
    await updateRule({ ...rule, enabled: target.checked });
    // Update the badge in the same row without full re-render
    const row = target.closest('tr');
    const badge = row?.querySelector('.enabled-badge, .disabled-badge');
    if (badge) {
      badge.className = target.checked ? 'enabled-badge' : 'disabled-badge';
    }
    currentRules = currentRules.map((r) => r.id === ruleId ? { ...r, enabled: target.checked } : r);
  }
}

function handleEditClick(ruleId: string): void {
  // Cancel any open edit first
  if (editingRuleId && editingRuleId !== ruleId) {
    handleCancelClick(editingRuleId);
  }
  editingRuleId = ruleId;
  const rule = currentRules.find((r) => r.id === ruleId);
  if (!rule) return;

  const row = document.querySelector(`tr[data-rule-id="${ruleId}"]`);
  if (!row) return;
  row.outerHTML = renderEditRow(rule);

  // Re-attach after outerHTML replacement
  const tbody = document.getElementById('rules-tbody');
  tbody?.addEventListener('click', handleTableClick);
}

async function handleSaveClick(ruleId: string): Promise<void> {
  const rule = currentRules.find((r) => r.id === ruleId);
  if (!rule) return;

  const nameInput = document.getElementById(`edit-name-${ruleId}`) as HTMLInputElement;
  const patternInput = document.getElementById(`edit-pattern-${ruleId}`) as HTMLInputElement;
  const nominalSelect = document.getElementById(`edit-nominal-${ruleId}`) as HTMLSelectElement;
  const vendorInput = document.getElementById(`edit-vendor-${ruleId}`) as HTMLInputElement;
  const enabledInput = document.getElementById(`edit-enabled-${ruleId}`) as HTMLInputElement;
  const hasVatInput = document.getElementById(`edit-hasvat-${ruleId}`) as HTMLInputElement;
  const vatAmountInput = document.getElementById(`edit-vat-amount-${ruleId}`) as HTMLInputElement;
  const vatPctInput = document.getElementById(`edit-vat-pct-${ruleId}`) as HTMLInputElement;

  // Validation
  let valid = true;
  if (!nameInput.value.trim()) {
    nameInput.classList.add('invalid');
    valid = false;
  } else {
    nameInput.classList.remove('invalid');
  }
  if (!patternInput.value.trim()) {
    patternInput.classList.add('invalid');
    valid = false;
  } else {
    patternInput.classList.remove('invalid');
  }
  if (!valid) return;

  const hasVat = hasVatInput.checked;
  const vatAmountRaw = vatAmountInput.value.trim();
  const vatPctRaw = vatPctInput.value.trim();

  // Mutually exclusive: if vatAmount filled, clear vatPercentage and vice versa
  let vatAmount: number | null = null;
  let vatPercentage: number | null = null;
  if (hasVat) {
    if (vatAmountRaw) {
      vatAmount = parseFloat(vatAmountRaw);
    } else if (vatPctRaw) {
      vatPercentage = parseFloat(vatPctRaw);
    }
  }

  const updatedRule: ExpenseRule = {
    ...rule,
    enabled: enabledInput.checked,
    name: nameInput.value.trim(),
    matchPattern: patternInput.value.trim(),
    nominalId: nominalSelect.value,
    purchasedFrom: vendorInput.value.trim(),
    hasVat,
    vatAmount,
    vatPercentage,
  };

  await updateRule(updatedRule);
  currentRules = currentRules.map((r) => r.id === ruleId ? updatedRule : r);
  editingRuleId = null;

  // Replace the editing row with view row
  const row = document.querySelector(`tr[data-rule-id="${ruleId}"]`);
  if (row) {
    row.outerHTML = renderViewRow(updatedRule);
    reattachToggleListeners();
  }
}

function handleCancelClick(ruleId: string): void {
  const rule = currentRules.find((r) => r.id === ruleId);
  if (!rule) return;
  editingRuleId = null;

  const row = document.querySelector(`tr[data-rule-id="${ruleId}"]`);
  if (row) {
    row.outerHTML = renderViewRow(rule);
    reattachToggleListeners();
  }
}

async function handleDeleteClick(ruleId: string): Promise<void> {
  const rule = currentRules.find((r) => r.id === ruleId);
  if (!rule) return;

  if (!window.confirm(`Delete rule "${rule.name}"?`)) return;

  await deleteRule(ruleId);
  currentRules = currentRules.filter((r) => r.id !== ruleId);

  const row = document.querySelector(`tr[data-rule-id="${ruleId}"]`);
  row?.remove();

  const countEl = document.getElementById('rule-count');
  if (countEl) {
    countEl.textContent = `${currentRules.length} rule${currentRules.length !== 1 ? 's' : ''}`;
  }
}

// Re-attach event listeners after outerHTML replacement (delegate is on tbody, should persist)
function reattachToggleListeners(): void {
  // The delegate listener is on tbody and survives row replacement — no action needed.
  // This function is a hook for future needs.
}

function clearAddForm(): void {
  const form = document.getElementById('add-form');
  if (!form) return;
  (form.querySelector('#new-name') as HTMLInputElement).value = '';
  (form.querySelector('#new-pattern') as HTMLInputElement).value = '';
  (form.querySelector('#new-nominal') as HTMLSelectElement).value = '68';
  (form.querySelector('#new-description') as HTMLInputElement).value = '';
  (form.querySelector('#new-vendor') as HTMLInputElement).value = '';
  (form.querySelector('#new-hasvat') as HTMLInputElement).checked = false;
  (form.querySelector('#new-vat-amount') as HTMLInputElement).value = '';
  (form.querySelector('#new-vat-pct') as HTMLInputElement).value = '';
  const subFields = document.getElementById('new-vat-sub');
  subFields?.classList.remove('visible');
}

async function handleAddRule(): Promise<void> {
  const nameInput = document.getElementById('new-name') as HTMLInputElement;
  const patternInput = document.getElementById('new-pattern') as HTMLInputElement;
  const nominalSelect = document.getElementById('new-nominal') as HTMLSelectElement;
  const descInput = document.getElementById('new-description') as HTMLInputElement;
  const vendorInput = document.getElementById('new-vendor') as HTMLInputElement;
  const hasVatInput = document.getElementById('new-hasvat') as HTMLInputElement;
  const vatAmountInput = document.getElementById('new-vat-amount') as HTMLInputElement;
  const vatPctInput = document.getElementById('new-vat-pct') as HTMLInputElement;

  // Validation
  let valid = true;
  if (!nameInput.value.trim()) {
    nameInput.classList.add('invalid');
    valid = false;
  } else {
    nameInput.classList.remove('invalid');
  }
  if (!patternInput.value.trim()) {
    patternInput.classList.add('invalid');
    valid = false;
  } else {
    patternInput.classList.remove('invalid');
  }
  if (!valid) return;

  const hasVat = hasVatInput.checked;
  const vatAmountRaw = vatAmountInput.value.trim();
  const vatPctRaw = vatPctInput.value.trim();

  let vatAmount: number | null = null;
  let vatPercentage: number | null = null;
  if (hasVat) {
    if (vatAmountRaw) {
      vatAmount = parseFloat(vatAmountRaw);
    } else if (vatPctRaw) {
      vatPercentage = parseFloat(vatPctRaw);
    }
  }

  const newRule: ExpenseRule = {
    id: crypto.randomUUID(),
    name: nameInput.value.trim(),
    matchPattern: patternInput.value.trim(),
    matchFlags: 'i',
    nominalId: nominalSelect.value,
    description: descInput.value.trim(),
    purchasedFrom: vendorInput.value.trim(),
    hasVat,
    vatAmount,
    vatPercentage,
    enabled: true,
    createdAt: new Date().toISOString(),
    matchCount: 0,
    lastUsed: undefined,
  };

  await addRule(newRule);
  // Re-render the whole page to reflect the new rule
  await initPage();
}

// ─── Initialisation ───────────────────────────────────────────────────────────

async function initPage(): Promise<void> {
  const rules = await getRules();
  renderPage(rules);
}

document.addEventListener('DOMContentLoaded', () => {
  initPage();
});

// Live sync: if panel saves a new rule (e.g. "save as rule" from unmatched item),
// re-render the options page to reflect the change.
browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes['rules']) {
    initPage();
  }
});
