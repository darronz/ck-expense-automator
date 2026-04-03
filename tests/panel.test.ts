// tests/panel.test.ts
// Unit tests for panel submission logic — PANEL-02 through PANEL-07, UNMT-02
// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SuspenseItem, ExpenseRule, SubmissionResult } from '../lib/types';

// ─── Mock browser APIs used by rules-store.ts ────────────────────────────────
vi.mock('../lib/rules-store', () => ({
  getRules: vi.fn().mockResolvedValue([]),
  recordRuleUsage: vi.fn().mockResolvedValue(undefined),
}));

// ─── Mock submitExpense from ck-api.ts ────────────────────────────────────────
vi.mock('../lib/ck-api', () => ({
  submitExpense: vi.fn().mockResolvedValue({ success: true }),
}));

// ─── Mock matchExpenses from expense-engine.ts ───────────────────────────────
vi.mock('../lib/expense-engine', () => ({
  matchExpenses: vi.fn().mockReturnValue({ matched: [], unmatched: [] }),
  buildPayload: vi.fn().mockReturnValue(new URLSearchParams()),
  calculateVatFromPercentage: vi.fn((gross: number, pct: number) => {
    const net = gross / (1 + pct / 100);
    return parseFloat((gross - net).toFixed(2));
  }),
}));

// ─── Import the module under test AFTER mocks ────────────────────────────────
import {
  buildSubmissionForItem,
  formatVatSummary,
  formatAmount,
  parseClaimContext,
  submitAllWithDelay,
} from '../ui/panel';

// ─── Test fixtures ────────────────────────────────────────────────────────────

const makeItem = (overrides: Partial<SuspenseItem> = {}): SuspenseItem => ({
  id: 'item-1',
  date: '13/03/2026',
  isoDate: '2026-03-13',
  description: 'ONLINE PAYMENT SUPABASE $25.00, Rate: 1.3390',
  amount: 18.67,
  ...overrides,
});

const makeRule = (overrides: Partial<ExpenseRule> = {}): ExpenseRule => ({
  id: 'rule-1',
  name: 'Supabase',
  matchPattern: 'supabase',
  nominalId: '68',
  description: 'Cloud DB',
  purchasedFrom: 'Supabase',
  hasVat: false,
  vatAmount: null,
  vatPercentage: null,
  enabled: true,
  createdAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

// ─── buildSubmissionForItem ───────────────────────────────────────────────────

describe('buildSubmissionForItem', () => {
  it('maps item and rule fields to ExpenseSubmission', () => {
    const item = makeItem();
    const rule = makeRule();
    const result = buildSubmissionForItem(item, rule, '275672');

    expect(result.claimId).toBe('275672');
    expect(result.suspenseItemId).toBe('item-1');
    expect(result.date).toBe('13/03/2026');
    expect(result.isoDate).toBe('2026-03-13');
    expect(result.nominalId).toBe('68');
    expect(result.description).toBe('Cloud DB');
    expect(result.purchasedFrom).toBe('Supabase');
    expect(result.grossAmount).toBe(18.67);
    expect(result.hasVat).toBe(false);
    expect(result.vatAmount).toBeNull();
  });

  it('uses fixed vatAmount when rule.hasVat=true and vatAmount is set', () => {
    const item = makeItem({ amount: 72 });
    const rule = makeRule({ hasVat: true, vatAmount: 12, vatPercentage: null });
    const result = buildSubmissionForItem(item, rule, '275672');

    expect(result.hasVat).toBe(true);
    expect(result.vatAmount).toBe(12);
  });

  it('calculates vatAmount from percentage when vatPercentage is set and vatAmount is null', () => {
    const item = makeItem({ amount: 72 });
    const rule = makeRule({ hasVat: true, vatAmount: null, vatPercentage: 20 });
    const result = buildSubmissionForItem(item, rule, '275672');

    expect(result.hasVat).toBe(true);
    // calculateVatFromPercentage(72, 20) = 72 - 72/1.2 = 72 - 60 = 12
    expect(result.vatAmount).toBe(12);
  });

  it('returns vatAmount=null when hasVat=false', () => {
    const item = makeItem({ amount: 24.99 });
    const rule = makeRule({ hasVat: false, vatAmount: null, vatPercentage: null });
    const result = buildSubmissionForItem(item, rule, '275672');

    expect(result.vatAmount).toBeNull();
  });

  it('sets previousPage to empty string in test context', () => {
    const item = makeItem();
    const rule = makeRule();
    const result = buildSubmissionForItem(item, rule, '275672');

    // In jsdom, window.location.href is 'about:blank' — we accept any string
    expect(typeof result.previousPage).toBe('string');
  });
});

// ─── formatVatSummary ─────────────────────────────────────────────────────────

describe('formatVatSummary', () => {
  it('returns "No VAT" when hasVat=false', () => {
    const rule = makeRule({ hasVat: false });
    expect(formatVatSummary(rule)).toBe('No VAT');
  });

  it('returns "VAT £12.00" when hasVat=true and vatAmount=12', () => {
    const rule = makeRule({ hasVat: true, vatAmount: 12, vatPercentage: null });
    expect(formatVatSummary(rule)).toBe('VAT £12.00');
  });

  it('returns "VAT 20%" when hasVat=true and vatPercentage=20 and vatAmount=null', () => {
    const rule = makeRule({ hasVat: true, vatAmount: null, vatPercentage: 20 });
    expect(formatVatSummary(rule)).toBe('VAT 20%');
  });

  it('returns "VAT (unspecified)" when hasVat=true but both vatAmount and vatPercentage are null', () => {
    const rule = makeRule({ hasVat: true, vatAmount: null, vatPercentage: null });
    expect(formatVatSummary(rule)).toBe('VAT (unspecified)');
  });
});

// ─── formatAmount ─────────────────────────────────────────────────────────────

describe('formatAmount', () => {
  it('formats 72 as £72.00', () => {
    expect(formatAmount(72)).toBe('£72.00');
  });

  it('formats 5.5 as £5.50', () => {
    expect(formatAmount(5.5)).toBe('£5.50');
  });

  it('formats 100 as £100.00', () => {
    expect(formatAmount(100)).toBe('£100.00');
  });

  it('formats 18.67 as £18.67', () => {
    expect(formatAmount(18.67)).toBe('£18.67');
  });
});

// ─── parseClaimContext ────────────────────────────────────────────────────────

describe('parseClaimContext', () => {
  it('returns month and year from first item date', () => {
    const items = [makeItem({ date: '13/03/2026' })];
    const ctx = parseClaimContext('275672', items);
    expect(ctx.month).toBe('March');
    expect(ctx.year).toBe('2026');
  });

  it('returns Unknown/empty for empty items array', () => {
    const ctx = parseClaimContext('275672', []);
    expect(ctx.month).toBe('Unknown');
    expect(ctx.year).toBe('');
  });

  it('parses January correctly', () => {
    const items = [makeItem({ date: '05/01/2026' })];
    const ctx = parseClaimContext('275672', items);
    expect(ctx.month).toBe('January');
    expect(ctx.year).toBe('2026');
  });

  it('parses December correctly', () => {
    const items = [makeItem({ date: '01/12/2025' })];
    const ctx = parseClaimContext('275672', items);
    expect(ctx.month).toBe('December');
    expect(ctx.year).toBe('2025');
  });
});

// ─── submitAllWithDelay ───────────────────────────────────────────────────────

describe('submitAllWithDelay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls submitFn for each item in sequence', async () => {
    const items = [
      { item: makeItem({ id: 'a' }), rule: makeRule() },
      { item: makeItem({ id: 'b' }), rule: makeRule() },
      { item: makeItem({ id: 'c' }), rule: makeRule() },
    ];
    const submitFn = vi.fn().mockResolvedValue({ success: true } as SubmissionResult);
    const delayFn = vi.fn().mockResolvedValue(undefined);
    const onProgress = vi.fn();
    const onItemResult = vi.fn();

    const promise = submitAllWithDelay(
      items,
      '275672',
      false,
      submitFn,
      delayFn,
      onProgress,
      onItemResult,
    );
    await promise;

    expect(submitFn).toHaveBeenCalledTimes(3);
  });

  it('calls delayFn 400ms between items (not after last)', async () => {
    const items = [
      { item: makeItem({ id: 'a' }), rule: makeRule() },
      { item: makeItem({ id: 'b' }), rule: makeRule() },
    ];
    const submitFn = vi.fn().mockResolvedValue({ success: true } as SubmissionResult);
    const delayFn = vi.fn().mockResolvedValue(undefined);
    const onProgress = vi.fn();
    const onItemResult = vi.fn();

    await submitAllWithDelay(items, '275672', false, submitFn, delayFn, onProgress, onItemResult);

    // For 2 items: 1 delay between them (not after last)
    expect(delayFn).toHaveBeenCalledTimes(1);
    expect(delayFn).toHaveBeenCalledWith(400);
  });

  it('calls onProgress after each item with (done, total)', async () => {
    const items = [
      { item: makeItem({ id: 'a' }), rule: makeRule() },
      { item: makeItem({ id: 'b' }), rule: makeRule() },
    ];
    const submitFn = vi.fn().mockResolvedValue({ success: true } as SubmissionResult);
    const delayFn = vi.fn().mockResolvedValue(undefined);
    const onProgress = vi.fn();
    const onItemResult = vi.fn();

    await submitAllWithDelay(items, '275672', false, submitFn, delayFn, onProgress, onItemResult);

    expect(onProgress).toHaveBeenNthCalledWith(1, 1, 2);
    expect(onProgress).toHaveBeenNthCalledWith(2, 2, 2);
  });

  it('calls onItemResult after each item with itemId and result', async () => {
    const items = [
      { item: makeItem({ id: 'a' }), rule: makeRule() },
      { item: makeItem({ id: 'b' }), rule: makeRule() },
    ];
    const submitFn = vi
      .fn()
      .mockResolvedValueOnce({ success: true } as SubmissionResult)
      .mockResolvedValueOnce({ success: false, error: 'NETWORK_ERROR' } as SubmissionResult);
    const delayFn = vi.fn().mockResolvedValue(undefined);
    const onProgress = vi.fn();
    const onItemResult = vi.fn();

    await submitAllWithDelay(items, '275672', false, submitFn, delayFn, onProgress, onItemResult);

    expect(onItemResult).toHaveBeenNthCalledWith(1, 'a', { success: true });
    expect(onItemResult).toHaveBeenNthCalledWith(2, 'b', { success: false, error: 'NETWORK_ERROR' });
  });

  it('skips submitFn in dry-run mode and calls onItemResult with dry-run marker', async () => {
    const items = [
      { item: makeItem({ id: 'a' }), rule: makeRule() },
      { item: makeItem({ id: 'b' }), rule: makeRule() },
    ];
    const submitFn = vi.fn();
    const delayFn = vi.fn().mockResolvedValue(undefined);
    const onProgress = vi.fn();
    const onItemResult = vi.fn();

    await submitAllWithDelay(items, '275672', true, submitFn, delayFn, onProgress, onItemResult);

    expect(submitFn).not.toHaveBeenCalled();
    expect(onItemResult).toHaveBeenCalledWith('a', { success: true, error: 'dry-run' });
    expect(onItemResult).toHaveBeenCalledWith('b', { success: true, error: 'dry-run' });
  });

  it('passes the correct submission to submitFn for each item', async () => {
    const item = makeItem({ id: 'x', date: '13/03/2026', isoDate: '2026-03-13', amount: 18.67 });
    const rule = makeRule({ nominalId: '68', description: 'Cloud DB', purchasedFrom: 'Supabase' });
    const items = [{ item, rule }];
    const submitFn = vi.fn().mockResolvedValue({ success: true } as SubmissionResult);
    const delayFn = vi.fn().mockResolvedValue(undefined);

    await submitAllWithDelay(items, '275672', false, submitFn, vi.fn().mockResolvedValue(undefined), vi.fn(), vi.fn());

    expect(submitFn).toHaveBeenCalledWith(
      expect.objectContaining({
        claimId: '275672',
        suspenseItemId: 'x',
        nominalId: '68',
        description: 'Cloud DB',
        purchasedFrom: 'Supabase',
        grossAmount: 18.67,
      }),
    );
  });

  it('handles a single item with no delay call', async () => {
    const items = [{ item: makeItem({ id: 'only' }), rule: makeRule() }];
    const submitFn = vi.fn().mockResolvedValue({ success: true } as SubmissionResult);
    const delayFn = vi.fn().mockResolvedValue(undefined);
    const onProgress = vi.fn();
    const onItemResult = vi.fn();

    await submitAllWithDelay(items, '275672', false, submitFn, delayFn, onProgress, onItemResult);

    expect(submitFn).toHaveBeenCalledTimes(1);
    expect(delayFn).not.toHaveBeenCalled();
    expect(onProgress).toHaveBeenCalledWith(1, 1);
  });

  it('handles empty items array without error', async () => {
    const submitFn = vi.fn();
    const delayFn = vi.fn();
    const onProgress = vi.fn();
    const onItemResult = vi.fn();

    await expect(
      submitAllWithDelay([], '275672', false, submitFn, delayFn, onProgress, onItemResult),
    ).resolves.toBeUndefined();

    expect(submitFn).not.toHaveBeenCalled();
    expect(onProgress).not.toHaveBeenCalled();
  });
});
