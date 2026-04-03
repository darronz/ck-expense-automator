import { describe, it, expect } from 'vitest';
import {
  matchRule,
  validateVat,
  buildPayload,
  calculateVatFromPercentage,
  matchExpenses,
} from '../lib/expense-engine';
import type { ExpenseRule, ExpenseSubmission, SuspenseItem } from '../lib/types';

function makeRule(overrides: Partial<ExpenseRule> = {}): ExpenseRule {
  return {
    id: 'rule-id-001',
    name: 'Test Rule',
    matchPattern: 'supabase',
    matchFlags: 'i',
    nominalId: '68',
    description: 'Cloud DB',
    purchasedFrom: 'Supabase',
    hasVat: false,
    vatAmount: null,
    vatPercentage: null,
    enabled: true,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeSubmission(overrides: Partial<ExpenseSubmission> = {}): ExpenseSubmission {
  return {
    claimId: '275672',
    suspenseItemId: '102783',
    date: '13/03/2026',
    isoDate: '2026-03-13',
    nominalId: '68',
    description: 'Cloud DB',
    purchasedFrom: 'Supabase',
    grossAmount: 18.67,
    hasVat: false,
    vatAmount: null,
    previousPage: 'https://portal.churchill-knight.co.uk/ExpenseItems/Create?claimId=275672',
    ...overrides,
  };
}

describe('matchRule', () => {
  it('returns true when description matches pattern (case-insensitive by default)', () => {
    const rule = makeRule({ matchPattern: 'supabase' });
    expect(matchRule(rule, 'ONLINE PAYMENT SUPABASE $25.00')).toBe(true);
    expect(matchRule(rule, 'Supabase invoice')).toBe(true);
  });

  it('returns false when description does not match', () => {
    const rule = makeRule({ matchPattern: 'supabase' });
    expect(matchRule(rule, 'DIRECT DEBIT Virgin Media 760869601001')).toBe(false);
  });

  it('returns false when rule.enabled is false (even if pattern matches)', () => {
    const rule = makeRule({ matchPattern: 'supabase', enabled: false });
    expect(matchRule(rule, 'ONLINE PAYMENT SUPABASE $25.00')).toBe(false);
  });

  it('returns false (does not throw) when matchPattern is an invalid regex like "["', () => {
    const rule = makeRule({ matchPattern: '[' });
    expect(() => matchRule(rule, 'some description')).not.toThrow();
    expect(matchRule(rule, 'some description')).toBe(false);
  });

  it('respects custom matchFlags', () => {
    // With case-sensitive flags, uppercase pattern should not match lowercase input
    const rule = makeRule({ matchPattern: 'SUPABASE', matchFlags: '' });
    expect(matchRule(rule, 'supabase invoice')).toBe(false);
    expect(matchRule(rule, 'SUPABASE invoice')).toBe(true);
  });
});

describe('validateVat', () => {
  it('returns { valid: true } for £12 VAT on £72 gross (exactly at 20% limit)', () => {
    const result = validateVat(72, 12);
    expect(result.valid).toBe(true);
  });

  it('returns { valid: false } for £12.01 VAT on £72 gross (exceeds 20% of net)', () => {
    const result = validateVat(72, 12.01);
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('returns { valid: false } when VAT is 0', () => {
    const result = validateVat(72, 0);
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('returns { valid: false } when VAT is negative', () => {
    const result = validateVat(72, -1);
    expect(result.valid).toBe(false);
  });

  it('returns { valid: true } for a small valid VAT amount', () => {
    const result = validateVat(100, 10);
    // net = 90, max VAT = 18; 10 <= 18, so valid
    expect(result.valid).toBe(true);
  });
});

describe('buildPayload', () => {
  it('returns URLSearchParams containing all required CK form fields', () => {
    const submission = makeSubmission();
    const params = buildPayload(submission);
    const required = [
      'Id',
      'ExpenseClaimId',
      'AccountingTypeId',
      'ExpenseDates',
      'FirstExpenseDate',
      'LastExpenseDate',
      'VisibleDate',
      'NominalId',
      'Description',
      'PurchasedFrom',
      'ExpensePaymentTypeId',
      'ActiveUserCompanyFrsRegistered',
      'ActiveUserCompanyVatRegistered',
      'GrossAmountPaid',
      'HasVatReceipt',
      'VatAmountPaid',
      'NetAmountPaid',
      'MappedSuspenseItemIds',
      'IsHavingSuspenseItems',
      'IsMappedToSuspenseItems',
      'PreviousPage',
    ];
    for (const field of required) {
      expect(params.has(field), `Missing field: ${field}`).toBe(true);
    }
  });

  it('sets HasVatReceipt to "true" when hasVat is true', () => {
    const submission = makeSubmission({ hasVat: true, vatAmount: 3.11 });
    const params = buildPayload(submission);
    const values = params.getAll('HasVatReceipt');
    expect(values[0]).toBe('true');
  });

  it('always appends a second HasVatReceipt value of "false" (ASP.NET double-field)', () => {
    const submission = makeSubmission({ hasVat: true, vatAmount: 3.11 });
    const params = buildPayload(submission);
    const values = params.getAll('HasVatReceipt');
    expect(values).toHaveLength(2);
    expect(values[1]).toBe('false');
  });

  it('sets HasVatReceipt to "false" as first value when hasVat is false', () => {
    const submission = makeSubmission({ hasVat: false });
    const params = buildPayload(submission);
    const values = params.getAll('HasVatReceipt');
    expect(values[0]).toBe('false');
    expect(values[1]).toBe('false');
  });

  it('always appends IsMappedToSuspenseItems twice (ASP.NET double-field)', () => {
    const submission = makeSubmission();
    const params = buildPayload(submission);
    const values = params.getAll('IsMappedToSuspenseItems');
    expect(values).toHaveLength(2);
    expect(values[0]).toBe('true');
    expect(values[1]).toBe('false');
  });

  it('sets NetAmountPaid to gross - vat as string', () => {
    const submission = makeSubmission({ grossAmount: 72, hasVat: true, vatAmount: 12 });
    const params = buildPayload(submission);
    expect(params.get('NetAmountPaid')).toBe('60.00');
    expect(params.get('GrossAmountPaid')).toBe('72.00');
    expect(params.get('VatAmountPaid')).toBe('12.00');
  });

  it('sets NetAmountPaid to gross when hasVat is false (vatAmount null)', () => {
    const submission = makeSubmission({ grossAmount: 18.67, hasVat: false, vatAmount: null });
    const params = buildPayload(submission);
    expect(params.get('NetAmountPaid')).toBe('18.67');
    expect(params.get('VatAmountPaid')).toBe('0.00');
  });

  it('always uses "2" for AccountingTypeId and ExpensePaymentTypeId', () => {
    const params = buildPayload(makeSubmission());
    expect(params.get('AccountingTypeId')).toBe('2');
    expect(params.get('ExpensePaymentTypeId')).toBe('2');
  });

  it('always uses "False" for ActiveUserCompanyFrsRegistered and "True" for ActiveUserCompanyVatRegistered', () => {
    const params = buildPayload(makeSubmission());
    expect(params.get('ActiveUserCompanyFrsRegistered')).toBe('False');
    expect(params.get('ActiveUserCompanyVatRegistered')).toBe('True');
  });

  it('always uses "True" for IsHavingSuspenseItems', () => {
    const params = buildPayload(makeSubmission());
    expect(params.get('IsHavingSuspenseItems')).toBe('True');
  });
});

describe('calculateVatFromPercentage', () => {
  it('returns 12 for gross=72, vatPct=20 (not 14.4)', () => {
    expect(calculateVatFromPercentage(72, 20)).toBe(12);
  });

  it('calculates correctly for other common amounts', () => {
    // gross=120, 20% VAT: net=100, vat=20
    expect(calculateVatFromPercentage(120, 20)).toBe(20);
  });

  it('handles zero VAT percentage', () => {
    expect(calculateVatFromPercentage(100, 0)).toBe(0);
  });
});

describe('matchExpenses', () => {
  it('returns matched items with the first matching rule', () => {
    const supabaseRule = makeRule({ id: 'rule-supabase', matchPattern: 'supabase' });
    const linkedinRule = makeRule({ id: 'rule-linkedin', matchPattern: 'linkedin', nominalId: '68' });
    const items: SuspenseItem[] = [
      {
        id: 'item-1',
        date: '13/03/2026',
        isoDate: '2026-03-13',
        description: 'Ref: Starling Account: 12345678, SortCode: 00-00-00\nONLINE PAYMENT SUPABASE $25.00, Rate: 1.3390',
        amount: 33.49,
      },
      {
        id: 'item-2',
        date: '14/03/2026',
        isoDate: '2026-03-14',
        description: 'Ref: Starling Account: 12345678, SortCode: 00-00-00\nCARD SUBSCRIPTION LinkedInPreA 70807384',
        amount: 24.99,
      },
    ];

    const result = matchExpenses(items, [supabaseRule, linkedinRule]);
    expect(result.matched).toHaveLength(2);
    expect(result.unmatched).toHaveLength(0);
    expect(result.matched[0].rule.id).toBe('rule-supabase');
    expect(result.matched[1].rule.id).toBe('rule-linkedin');
  });

  it('returns unmatched items when no rule matches', () => {
    const rule = makeRule({ matchPattern: 'supabase' });
    const items: SuspenseItem[] = [
      {
        id: 'item-unknown',
        date: '15/03/2026',
        isoDate: '2026-03-15',
        description: 'Ref: Starling Account: 12345678, SortCode: 00-00-00\nDIRECT DEBIT UNKNOWN VENDOR 999',
        amount: 50.00,
      },
    ];
    const result = matchExpenses(items, [rule]);
    expect(result.matched).toHaveLength(0);
    expect(result.unmatched).toHaveLength(1);
    expect(result.unmatched[0].id).toBe('item-unknown');
  });

  it('uses first matching rule when multiple rules match', () => {
    const rule1 = makeRule({ id: 'first-rule', matchPattern: 'supabase' });
    const rule2 = makeRule({ id: 'second-rule', matchPattern: 'supabase' });
    const items: SuspenseItem[] = [
      {
        id: 'item-1',
        date: '13/03/2026',
        isoDate: '2026-03-13',
        description: 'ONLINE PAYMENT SUPABASE $25.00',
        amount: 33.49,
      },
    ];
    const result = matchExpenses(items, [rule1, rule2]);
    expect(result.matched[0].rule.id).toBe('first-rule');
  });

  it('handles empty items array', () => {
    const rule = makeRule();
    const result = matchExpenses([], [rule]);
    expect(result.matched).toHaveLength(0);
    expect(result.unmatched).toHaveLength(0);
  });

  it('handles empty rules array (all items unmatched)', () => {
    const items: SuspenseItem[] = [
      {
        id: 'item-1',
        date: '13/03/2026',
        isoDate: '2026-03-13',
        description: 'ONLINE PAYMENT SUPABASE $25.00',
        amount: 33.49,
      },
    ];
    const result = matchExpenses(items, []);
    expect(result.matched).toHaveLength(0);
    expect(result.unmatched).toHaveLength(1);
  });
});
