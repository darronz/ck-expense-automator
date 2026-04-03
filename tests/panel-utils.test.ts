// tests/panel-utils.test.ts
// Unit tests for all panel-utils.ts exports

import { describe, it, expect } from 'vitest';
import {
  CATEGORIES,
  DEFAULT_TOP_CATEGORIES,
  extractForeignCurrency,
  isLikelyVatInclusive,
  sortCategoriesByUsage,
  getCategoryLabel,
  deriveMatchPattern,
} from '../ui/panel-utils';

describe('CATEGORIES', () => {
  it('contains 20 categories', () => {
    expect(CATEGORIES).toHaveLength(20);
  });

  it('each entry has id and label', () => {
    for (const cat of CATEGORIES) {
      expect(cat).toHaveProperty('id');
      expect(cat).toHaveProperty('label');
      expect(typeof cat.id).toBe('string');
      expect(typeof cat.label).toBe('string');
    }
  });

  it('includes Subscriptions (68)', () => {
    expect(CATEGORIES.some(c => c.id === '68' && c.label === 'Subscriptions')).toBe(true);
  });

  it('includes Telephone (48)', () => {
    expect(CATEGORIES.some(c => c.id === '48' && c.label === 'Telephone')).toBe(true);
  });
});

describe('DEFAULT_TOP_CATEGORIES', () => {
  it('contains exactly 5 entries', () => {
    expect(DEFAULT_TOP_CATEGORIES).toHaveLength(5);
  });

  it('starts with Subscriptions (68)', () => {
    expect(DEFAULT_TOP_CATEGORIES[0]).toBe('68');
  });

  it('contains the expected defaults in order', () => {
    expect(DEFAULT_TOP_CATEGORIES).toEqual(['68', '48', '52', '62', '114']);
  });
});

describe('extractForeignCurrency', () => {
  it('extracts USD amount from SUPABASE description', () => {
    expect(
      extractForeignCurrency('ONLINE PAYMENT SUPABASE $25.00, Rate: 1.3390'),
    ).toBe('$25.00');
  });

  it('returns null for GBP-only DIRECT DEBIT description', () => {
    expect(
      extractForeignCurrency('DIRECT DEBIT Virgin Media 760869601001'),
    ).toBeNull();
  });

  it('extracts EUR amount from card subscription description', () => {
    expect(
      extractForeignCurrency('CARD SUBSCRIPTION LinkedInPreA EUR 45.00, Rate: 0.8500'),
    ).toBe('EUR 45.00');
  });

  it('extracts USD from description with multi-line format', () => {
    const desc = 'Ref: Starling Account: 12345678, SortCode: 12-34-56\nONLINE PAYMENT SUPABASE $25.00, Rate: 1.3390';
    expect(extractForeignCurrency(desc)).toBe('$25.00');
  });

  it('returns null for empty string', () => {
    expect(extractForeignCurrency('')).toBeNull();
  });

  it('returns null when no foreign currency present', () => {
    expect(extractForeignCurrency('DIRECT DEBIT Apple Store 123456789')).toBeNull();
  });
});

describe('isLikelyVatInclusive', () => {
  it('returns true for 72 (72/1.2 = 60 exactly)', () => {
    expect(isLikelyVatInclusive(72)).toBe(true);
  });

  it('returns false for 20 (20/1.2 = 16.666...)', () => {
    expect(isLikelyVatInclusive(20)).toBe(false);
  });

  it('returns false for 18.67 (not divisible by 1.2)', () => {
    expect(isLikelyVatInclusive(18.67)).toBe(false);
  });

  it('returns true for 12 (12/1.2 = 10)', () => {
    expect(isLikelyVatInclusive(12)).toBe(true);
  });

  it('returns true for 24 (24/1.2 = 20)', () => {
    expect(isLikelyVatInclusive(24)).toBe(true);
  });

  it('returns false for 0', () => {
    expect(isLikelyVatInclusive(0)).toBe(false);
  });
});

describe('sortCategoriesByUsage', () => {
  it('returns DEFAULT_TOP_CATEGORIES first when no usage data', () => {
    const result = sortCategoriesByUsage(['68', '48', '52', '62', '114', '50'], {});
    // Top 5 defaults should appear first in their default order
    expect(result.slice(0, 5)).toEqual(['68', '48', '52', '62', '114']);
    // Non-default '50' appended after
    expect(result).toContain('50');
  });

  it('sorts by usage count descending when data exists', () => {
    const result = sortCategoriesByUsage(['68', '48', '52'], { '52': 5, '48': 3 });
    expect(result[0]).toBe('52');
    expect(result[1]).toBe('48');
    expect(result[2]).toBe('68');
  });

  it('items not in DEFAULT_TOP_CATEGORIES and with no usage sort after defaults', () => {
    const result = sortCategoriesByUsage(['68', '48', '52', '62', '114', '50'], {});
    expect(result.indexOf('50')).toBeGreaterThan(result.indexOf('114'));
  });

  it('handles empty allIds array', () => {
    expect(sortCategoriesByUsage([], {})).toEqual([]);
  });

  it('handles allIds with a single entry', () => {
    expect(sortCategoriesByUsage(['68'], {})).toEqual(['68']);
  });
});

describe('getCategoryLabel', () => {
  it('returns "Subscriptions" for id 68', () => {
    expect(getCategoryLabel('68')).toBe('Subscriptions');
  });

  it('returns "Telephone" for id 48', () => {
    expect(getCategoryLabel('48')).toBe('Telephone');
  });

  it('returns "Unknown (999)" for unknown id', () => {
    expect(getCategoryLabel('999')).toBe('Unknown (999)');
  });

  it('returns "Unknown ()" for empty string', () => {
    expect(getCategoryLabel('')).toBe('Unknown ()');
  });

  it('returns "Computer equipment cost" for id 114', () => {
    expect(getCategoryLabel('114')).toBe('Computer equipment cost');
  });
});

describe('deriveMatchPattern', () => {
  it('lowercases "Supabase" to "supabase"', () => {
    expect(deriveMatchPattern('Supabase')).toBe('supabase');
  });

  it('lowercases "Virgin Media" to "virgin media"', () => {
    expect(deriveMatchPattern('Virgin Media')).toBe('virgin media');
  });

  it('escapes dot in "APPLE.COM" to "apple\\.com"', () => {
    expect(deriveMatchPattern('APPLE.COM')).toBe('apple\\.com');
  });

  it('preserves digits in "Three 123456789"', () => {
    expect(deriveMatchPattern('Three 123456789')).toBe('three 123456789');
  });

  it('escapes asterisk in vendor name', () => {
    expect(deriveMatchPattern('Test*Name')).toBe('test\\*name');
  });

  it('escapes plus sign in vendor name', () => {
    expect(deriveMatchPattern('C++')).toBe('c\\+\\+');
  });

  it('escapes parentheses in vendor name', () => {
    expect(deriveMatchPattern('Apple (UK)')).toBe('apple \\(uk\\)');
  });

  it('returns empty string for empty input', () => {
    expect(deriveMatchPattern('')).toBe('');
  });
});
