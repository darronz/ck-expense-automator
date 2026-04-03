// ui/panel-utils.ts
// Pure utility functions for the CK Expense Automator panel.
// No browser API calls — safe for unit testing in Node/jsdom.

/**
 * All known expense categories from the CK portal (NominalId → label).
 * Source: CLAUDE.md NominalId table.
 */
export const CATEGORIES: Array<{ id: string; label: string }> = [
  { id: '48', label: 'Telephone' },
  { id: '50', label: 'Stationery' },
  { id: '51', label: 'Advertising' },
  { id: '52', label: 'Travel' },
  { id: '53', label: 'Subsistence' },
  { id: '55', label: 'Fuel' },
  { id: '61', label: 'Licenses' },
  { id: '62', label: 'Insurance' },
  { id: '64', label: 'Maintenance & repairs' },
  { id: '65', label: 'Staff training' },
  { id: '68', label: 'Subscriptions' },
  { id: '69', label: 'Office equipment' },
  { id: '70', label: 'Computer peripherals' },
  { id: '72', label: 'Consultancy fees' },
  { id: '74', label: 'Books and publications' },
  { id: '78', label: 'Legal & Professional fees' },
  { id: '81', label: 'Entertainment' },
  { id: '83', label: 'Promotional cost' },
  { id: '85', label: 'Bank charges' },
  { id: '114', label: 'Computer equipment cost' },
];

/**
 * Default top categories for first-run (before usage stats exist).
 * Ordering reflects common recurring freelancer expenses.
 */
export const DEFAULT_TOP_CATEGORIES: string[] = ['68', '48', '52', '62', '114'];

/**
 * Extract a foreign currency amount from a Starling bank description string.
 *
 * Matches patterns like:
 *   "$25.00" (USD prefix)
 *   "EUR 45.00" (ISO currency code + space + amount)
 *
 * Returns null if no foreign currency pattern is found (GBP-only transaction).
 */
export function extractForeignCurrency(description: string): string | null {
  const match = description.match(/\$[\d.]+|[A-Z]{3}\s+[\d.]+/);
  return match ? match[0] : null;
}

/**
 * Return true if the given GBP amount is likely VAT-inclusive (divisible by 1.2).
 *
 * Uses a tolerance of 0.01 to handle floating-point arithmetic imprecision.
 * A return value of true means the user may want to enter VAT = amount / 6
 * (i.e. 20% VAT means gross = net * 1.2, so VAT = gross / 6).
 */
export function isLikelyVatInclusive(amount: number): boolean {
  if (amount === 0) return false;
  const divided = amount / 1.2;
  return Math.abs(divided - Math.round(divided)) < 0.01;
}

/**
 * Sort a list of NominalId strings by usage frequency, descending.
 *
 * Sorting rules:
 * 1. IDs with usage counts > 0 are sorted descending by count.
 * 2. IDs with no usage data fall back to DEFAULT_TOP_CATEGORIES ordering
 *    (top 5 defaults first, remaining sorted alphabetically by label).
 *
 * All IDs in allIds are preserved in the output; none are dropped.
 */
export function sortCategoriesByUsage(
  allIds: string[],
  usageCounts: Record<string, number>,
): string[] {
  const hasUsage = (id: string) => (usageCounts[id] ?? 0) > 0;

  // Partition into used and unused
  const used = allIds.filter(hasUsage);
  const unused = allIds.filter(id => !hasUsage(id));

  // Sort used IDs descending by count; ties resolved by DEFAULT_TOP_CATEGORIES order
  used.sort((a, b) => {
    const diff = (usageCounts[b] ?? 0) - (usageCounts[a] ?? 0);
    if (diff !== 0) return diff;
    // tie-break: DEFAULT_TOP_CATEGORIES order (lower index wins)
    const ai = DEFAULT_TOP_CATEGORIES.indexOf(a);
    const bi = DEFAULT_TOP_CATEGORIES.indexOf(b);
    const aOrder = ai === -1 ? Number.MAX_SAFE_INTEGER : ai;
    const bOrder = bi === -1 ? Number.MAX_SAFE_INTEGER : bi;
    return aOrder - bOrder;
  });

  // Sort unused IDs: DEFAULT_TOP_CATEGORIES first (in order), then alphabetical by label
  unused.sort((a, b) => {
    const ai = DEFAULT_TOP_CATEGORIES.indexOf(a);
    const bi = DEFAULT_TOP_CATEGORIES.indexOf(b);
    // Both in defaults: maintain defaults order
    if (ai !== -1 && bi !== -1) return ai - bi;
    // Only a in defaults: a comes first
    if (ai !== -1) return -1;
    // Only b in defaults: b comes first
    if (bi !== -1) return 1;
    // Neither in defaults: alphabetical by label
    const aLabel = getCategoryLabel(a);
    const bLabel = getCategoryLabel(b);
    return aLabel.localeCompare(bLabel);
  });

  return [...used, ...unused];
}

/**
 * Look up the human-readable label for a NominalId.
 * Returns 'Unknown (nominalId)' if the ID is not in the CATEGORIES list.
 */
export function getCategoryLabel(nominalId: string): string {
  const cat = CATEGORIES.find(c => c.id === nominalId);
  return cat ? cat.label : `Unknown (${nominalId})`;
}

/**
 * Derive a regex match pattern from a vendor name.
 *
 * Transformation:
 * 1. Lowercase the vendor string
 * 2. Escape all regex special characters: . * + ? ^ $ { } [ ] | ( ) \
 *
 * Result is suitable for use as an ExpenseRule.matchPattern value.
 */
export function deriveMatchPattern(vendor: string): string {
  return vendor
    .toLowerCase()
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
