import { describe, it, expect, beforeEach } from 'vitest';
import {
  getRules,
  saveRules,
  addRule,
  updateRule,
  deleteRule,
  recordRuleUsage,
  DEFAULT_RULES,
} from '../lib/rules-store';
import type { ExpenseRule } from '../lib/types';

function makeRule(overrides: Partial<ExpenseRule> = {}): ExpenseRule {
  return {
    id: 'test-id-001',
    name: 'Test Rule',
    matchPattern: 'test',
    matchFlags: 'i',
    nominalId: '68',
    description: 'Test expense',
    purchasedFrom: 'Test Vendor',
    hasVat: false,
    vatAmount: null,
    vatPercentage: null,
    enabled: true,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('getRules', () => {
  it('returns empty array when storage is empty', async () => {
    const rules = await getRules();
    expect(rules).toEqual([]);
  });
});

describe('saveRules / getRules roundtrip', () => {
  it('preserves all ExpenseRule fields after save and get', async () => {
    const rule = makeRule({
      id: 'roundtrip-id',
      name: 'Virgin Media Internet',
      matchPattern: 'virgin\\s*media',
      nominalId: '48',
      description: 'Internet',
      purchasedFrom: 'Virgin Media Business',
      hasVat: true,
      vatAmount: 12.0,
      vatPercentage: null,
      enabled: true,
    });
    await saveRules([rule]);
    const saved = await getRules();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toEqual(rule);
  });

  it('preserves vatPercentage field when set', async () => {
    const rule = makeRule({ vatPercentage: 20, vatAmount: null });
    await saveRules([rule]);
    const saved = await getRules();
    expect(saved[0].vatPercentage).toBe(20);
    expect(saved[0].vatAmount).toBeNull();
  });
});

describe('addRule', () => {
  it('appends a rule to an existing array (does not replace)', async () => {
    const rule1 = makeRule({ id: 'id-1', name: 'Rule 1' });
    const rule2 = makeRule({ id: 'id-2', name: 'Rule 2' });
    await saveRules([rule1]);
    await addRule(rule2);
    const rules = await getRules();
    expect(rules).toHaveLength(2);
    expect(rules[0].id).toBe('id-1');
    expect(rules[1].id).toBe('id-2');
  });
});

describe('updateRule', () => {
  it('replaces the rule with matching id, leaves others unchanged', async () => {
    const rule1 = makeRule({ id: 'keep-id', name: 'Keep This' });
    const rule2 = makeRule({ id: 'update-id', name: 'Old Name' });
    await saveRules([rule1, rule2]);
    await updateRule({ ...rule2, name: 'New Name' });
    const rules = await getRules();
    expect(rules).toHaveLength(2);
    expect(rules.find(r => r.id === 'keep-id')?.name).toBe('Keep This');
    expect(rules.find(r => r.id === 'update-id')?.name).toBe('New Name');
  });
});

describe('deleteRule', () => {
  it('removes the rule with matching id, leaves others unchanged', async () => {
    const rule1 = makeRule({ id: 'keep-id', name: 'Keep This' });
    const rule2 = makeRule({ id: 'delete-id', name: 'Delete This' });
    await saveRules([rule1, rule2]);
    await deleteRule('delete-id');
    const rules = await getRules();
    expect(rules).toHaveLength(1);
    expect(rules[0].id).toBe('keep-id');
  });
});

describe('DEFAULT_RULES', () => {
  it('is an array with at least 8 items', () => {
    expect(Array.isArray(DEFAULT_RULES)).toBe(true);
    expect(DEFAULT_RULES.length).toBeGreaterThanOrEqual(8);
  });

  it('each rule has id (string), name (string), matchPattern (string), nominalId (string), enabled: true', () => {
    for (const rule of DEFAULT_RULES) {
      expect(typeof rule.id).toBe('string');
      expect(rule.id.length).toBeGreaterThan(0);
      expect(typeof rule.name).toBe('string');
      expect(rule.name.length).toBeGreaterThan(0);
      expect(typeof rule.matchPattern).toBe('string');
      expect(rule.matchPattern.length).toBeGreaterThan(0);
      expect(typeof rule.nominalId).toBe('string');
      expect(rule.nominalId.length).toBeGreaterThan(0);
      expect(rule.enabled).toBe(true);
    }
  });
});

describe('recordRuleUsage', () => {
  it('increments matchCount by 1 from 0', async () => {
    const ruleId = 'usage-test-id';
    await recordRuleUsage(ruleId);
    const result = await browser.storage.local.get(`stats-${ruleId}`);
    const stats = result[`stats-${ruleId}`] as { matchCount: number; lastUsed: string };
    expect(stats.matchCount).toBe(1);
  });

  it('increments matchCount a second time (accumulates)', async () => {
    const ruleId = 'usage-accumulate-id';
    await recordRuleUsage(ruleId);
    await recordRuleUsage(ruleId);
    const result = await browser.storage.local.get(`stats-${ruleId}`);
    const stats = result[`stats-${ruleId}`] as { matchCount: number; lastUsed: string };
    expect(stats.matchCount).toBe(2);
  });

  it('sets lastUsed to a non-null ISO string', async () => {
    const ruleId = 'usage-lastused-id';
    await recordRuleUsage(ruleId);
    const result = await browser.storage.local.get(`stats-${ruleId}`);
    const stats = result[`stats-${ruleId}`] as { matchCount: number; lastUsed: string };
    expect(stats.lastUsed).not.toBeNull();
    expect(typeof stats.lastUsed).toBe('string');
    // Should be parseable as a date
    expect(new Date(stats.lastUsed).toString()).not.toBe('Invalid Date');
  });

  it('uses browser.storage.local — does NOT write to browser.storage.sync', async () => {
    const ruleId = 'usage-local-check-id';
    await recordRuleUsage(ruleId);
    // Verify it exists in local
    const localResult = await browser.storage.local.get(`stats-${ruleId}`);
    expect(localResult[`stats-${ruleId}`]).toBeDefined();
    // Verify it does NOT exist in sync
    const syncResult = await browser.storage.sync.get(`stats-${ruleId}`);
    expect(syncResult[`stats-${ruleId}`]).toBeUndefined();
  });
});
