// lib/expense-engine.ts
// Core matching, VAT calculation, and form payload builder.
// Pure functions — no browser API calls here.

import type { ExpenseRule, ExpenseSubmission, MatchResult, SuspenseItem } from './types';

/**
 * Test whether a bank description matches a rule's regex pattern.
 * Returns false (does not throw) if the pattern is an invalid regex (Pitfall 6).
 */
export function matchRule(rule: ExpenseRule, description: string): boolean {
  if (!rule.enabled) return false;
  try {
    const regex = new RegExp(rule.matchPattern, rule.matchFlags ?? 'i');
    return regex.test(description);
  } catch (err) {
    console.warn(`[CK Expense Automator] Invalid regex in rule "${rule.name}": ${rule.matchPattern}`, err);
    return false;
  }
}

/**
 * Client-side VAT validation before submission.
 * The CK portal rule: VAT must be > 0 and ≤ 20% of Net Amount (Gross - VAT).
 *
 * Example: Gross £72, VAT £12 → Net £60, max VAT = £60 * 0.20 = £12 ✓
 */
export function validateVat(gross: number, vat: number): { valid: boolean; error?: string } {
  if (vat <= 0) {
    return { valid: false, error: 'VAT must be greater than 0' };
  }
  const net = gross - vat;
  const maxVat = net * 0.20;
  if (vat > maxVat) {
    return {
      valid: false,
      error: `VAT £${vat.toFixed(2)} exceeds maximum £${maxVat.toFixed(2)} (20% of net £${net.toFixed(2)})`,
    };
  }
  return { valid: true };
}

/**
 * Calculate VAT amount from a percentage using the inclusive (reverse) method.
 * Formula: net = gross / (1 + pct/100); vat = gross - net
 *
 * Example: gross=72, pct=20 → net=60, vat=12 (not 14.40!)
 * This is how UK VAT works: the percentage applies to the net amount inside the gross.
 */
export function calculateVatFromPercentage(gross: number, vatPct: number): number {
  if (vatPct === 0) return 0;
  const net = gross / (1 + vatPct / 100);
  return parseFloat((gross - net).toFixed(2));
}

/**
 * Build the URLSearchParams payload for a CK portal form POST.
 * Includes all 20 required fields from the CLAUDE.md spec.
 * Applies the ASP.NET double-checkbox pattern for HasVatReceipt and IsMappedToSuspenseItems.
 */
export function buildPayload(params: ExpenseSubmission): URLSearchParams {
  const form = new URLSearchParams();
  const vatAmount = params.vatAmount ?? 0;
  const net = params.grossAmount - vatAmount;

  form.append('Id', '0');
  form.append('ExpenseClaimId', params.claimId);
  form.append('AccountingTypeId', '2');
  form.append('ExpenseDates', params.date);           // dd/mm/yyyy
  form.append('FirstExpenseDate', params.isoDate);    // yyyy-mm-dd
  form.append('LastExpenseDate', params.isoDate);     // yyyy-mm-dd
  form.append('VisibleDate', '');
  form.append('NominalId', params.nominalId);
  form.append('Description', params.description);
  form.append('PurchasedFrom', params.purchasedFrom);
  form.append('ExpensePaymentTypeId', '2');           // Business account
  form.append('ActiveUserCompanyFrsRegistered', 'False');
  form.append('ActiveUserCompanyVatRegistered', 'True');
  form.append('GrossAmountPaid', params.grossAmount.toFixed(2));
  // ASP.NET double-field pattern: checkbox value + hidden fallback
  form.append('HasVatReceipt', params.hasVat ? 'true' : 'false');
  form.append('HasVatReceipt', 'false');
  form.append('VatAmountPaid', vatAmount.toFixed(2));
  form.append('NetAmountPaid', net.toFixed(2));
  form.append('MappedSuspenseItemIds', params.suspenseItemId);
  form.append('IsHavingSuspenseItems', 'True');
  // ASP.NET double-field pattern for IsMappedToSuspenseItems
  form.append('IsMappedToSuspenseItems', 'true');
  form.append('IsMappedToSuspenseItems', 'false');
  form.append('PreviousPage', params.previousPage);

  return form;
}

/**
 * Match an array of suspense items against a set of rules.
 * Returns matched items (each with the first matching rule) and unmatched items.
 */
export function matchExpenses(items: SuspenseItem[], rules: ExpenseRule[]): MatchResult {
  const matched: MatchResult['matched'] = [];
  const unmatched: SuspenseItem[] = [];

  for (const item of items) {
    let foundRule: ExpenseRule | null = null;
    for (const rule of rules) {
      if (matchRule(rule, item.description)) {
        foundRule = rule;
        break;
      }
    }
    if (foundRule) {
      matched.push({ item, rule: foundRule });
    } else {
      unmatched.push(item);
    }
  }

  return { matched, unmatched };
}
