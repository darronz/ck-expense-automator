// lib/rules-store.ts
// chrome.storage.sync CRUD wrapper for ExpenseRule management.
// Rule usage statistics go to chrome.storage.local (not sync) — see RULE-08.

import type { ExpenseRule, RuleStats } from './types';

const STORAGE_KEY = 'rules';
const STATS_KEY_PREFIX = 'stats-';

// Soft limit: console.warn at 25 rules, throw hard error at 35.
// At ~200 bytes/rule, 35 rules ≈ 7KB — approaching the 8192 per-item limit.
const WARN_RULE_COUNT = 25;
const HARD_RULE_COUNT = 35;

// DEFAULT_RULES — all 8 rules from CLAUDE.md, each with a stable UUID generated at module load time.
export const DEFAULT_RULES: ExpenseRule[] = [
  {
    id: crypto.randomUUID(),
    name: 'Virgin Media Internet',
    matchPattern: 'virgin\\s*media',
    matchFlags: 'i',
    nominalId: '48',
    description: 'Internet',
    purchasedFrom: 'Virgin Media Business',
    hasVat: true,
    vatAmount: 12.0,
    vatPercentage: null,
    enabled: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: crypto.randomUUID(),
    name: 'Supabase',
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
  },
  {
    id: crypto.randomUUID(),
    name: 'LinkedIn Premium',
    matchPattern: 'linkedin',
    matchFlags: 'i',
    nominalId: '68',
    description: 'LinkedIn Premium',
    purchasedFrom: 'LinkedIn',
    hasVat: false,
    vatAmount: null,
    vatPercentage: null,
    enabled: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: crypto.randomUUID(),
    name: 'Claude AI',
    matchPattern: 'claude\\.ai',
    matchFlags: 'i',
    nominalId: '68',
    description: 'AI Assistant',
    purchasedFrom: 'Anthropic',
    hasVat: false,
    vatAmount: null,
    vatPercentage: null,
    enabled: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: crypto.randomUUID(),
    name: 'Apple Developer Program',
    matchPattern: 'APPLE\\.COM.*\\$99',
    matchFlags: 'i',
    nominalId: '68',
    description: 'Apple Developer Program',
    purchasedFrom: 'Apple',
    hasVat: false,
    vatAmount: null,
    vatPercentage: null,
    enabled: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: crypto.randomUUID(),
    name: 'Three Mobile',
    matchPattern: 'three\\s*\\d{9,}',
    matchFlags: 'i',
    nominalId: '48',
    description: 'Mobile phone',
    purchasedFrom: 'Three',
    hasVat: true,
    vatAmount: null,
    vatPercentage: 20,
    enabled: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: crypto.randomUUID(),
    name: 'iCloud+',
    matchPattern: 'APPLE\\s*(PAY|STORE)\\s*.*R496',
    matchFlags: 'i',
    nominalId: '68',
    description: 'iCloud+',
    purchasedFrom: 'Apple',
    hasVat: false,
    vatAmount: null,
    vatPercentage: null,
    enabled: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: crypto.randomUUID(),
    name: 'Twilio',
    matchPattern: 'twilio',
    matchFlags: 'i',
    nominalId: '68',
    description: 'SMS/Voice API',
    purchasedFrom: 'Twilio',
    hasVat: false,
    vatAmount: null,
    vatPercentage: null,
    enabled: true,
    createdAt: new Date().toISOString(),
  },
];

/**
 * Read all rules from chrome.storage.sync.
 * Returns an empty array if no rules have been saved yet.
 */
export async function getRules(): Promise<ExpenseRule[]> {
  const result = await browser.storage.sync.get(STORAGE_KEY);
  return (result[STORAGE_KEY] as ExpenseRule[]) ?? [];
}

/**
 * Overwrite the rules array in chrome.storage.sync.
 * Includes a byte-count guard:
 *   - Warns at > 25 rules (soft limit)
 *   - Throws at > 35 rules (approaching 8192-byte per-item limit)
 */
export async function saveRules(rules: ExpenseRule[]): Promise<void> {
  if (rules.length > HARD_RULE_COUNT) {
    throw new Error(
      `Rules storage limit approaching — delete some rules before adding more (${rules.length} rules)`
    );
  }
  if (rules.length > WARN_RULE_COUNT) {
    console.warn(
      `[CK Expense Automator] Warning: ${rules.length} rules stored. Consider cleaning up to stay well below the 35-rule limit.`
    );
  }
  await browser.storage.sync.set({ [STORAGE_KEY]: rules });
}

/**
 * Append a new rule to the existing rules array.
 */
export async function addRule(rule: ExpenseRule): Promise<void> {
  const rules = await getRules();
  rules.push(rule);
  await saveRules(rules);
}

/**
 * Replace an existing rule (matched by id) with an updated version.
 * If no rule with the given id exists, the update is a no-op.
 */
export async function updateRule(updatedRule: ExpenseRule): Promise<void> {
  const rules = await getRules();
  const index = rules.findIndex(r => r.id === updatedRule.id);
  if (index !== -1) {
    rules[index] = updatedRule;
    await saveRules(rules);
  }
}

/**
 * Remove a rule by id. If no matching id exists, the operation is a no-op.
 */
export async function deleteRule(ruleId: string): Promise<void> {
  const rules = await getRules();
  const filtered = rules.filter(r => r.id !== ruleId);
  await saveRules(filtered);
}

/**
 * Increment matchCount and update lastUsed for a rule.
 * Uses browser.storage.local — NOT storage.sync — because these change
 * on every match and don't need cross-device sync (see RULE-08).
 */
export async function recordRuleUsage(ruleId: string): Promise<void> {
  const key = `${STATS_KEY_PREFIX}${ruleId}`;
  const existing = await browser.storage.local.get(key);
  const stats = (existing[key] as RuleStats) ?? { matchCount: 0, lastUsed: null };
  await browser.storage.local.set({
    [key]: {
      matchCount: stats.matchCount + 1,
      lastUsed: new Date().toISOString(),
    },
  });
}
