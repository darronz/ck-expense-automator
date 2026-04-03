import { describe, it, expect } from 'vitest';
import { extractVendor } from '../lib/vendor-extractor';

describe('extractVendor', () => {
  it('parses ONLINE PAYMENT descriptions', () => {
    const result = extractVendor(
      'Ref: Starling Account: 12345678, SortCode: 00-00-00\nONLINE PAYMENT SUPABASE $25.00, Rate: 1.3390'
    );
    expect(result).not.toBeNull();
    // Should return "SUPABASE" or normalised equivalent (dollar amount stripped)
    expect(result!.toLowerCase()).toContain('supabase');
  });

  it('parses DIRECT DEBIT descriptions and strips trailing reference numbers', () => {
    const result = extractVendor(
      'Ref: Starling Account: 12345678, SortCode: 00-00-00\nDIRECT DEBIT Virgin Media 760869601001'
    );
    expect(result).not.toBeNull();
    // Trailing 12-digit number should be stripped
    expect(result).toBe('Virgin Media');
  });

  it('parses CARD SUBSCRIPTION descriptions and strips trailing reference numbers', () => {
    const result = extractVendor(
      'Ref: Starling Account: 12345678, SortCode: 00-00-00\nCARD SUBSCRIPTION LinkedInPreA 70807384'
    );
    expect(result).not.toBeNull();
    // Trailing 8-digit number should be stripped
    expect(result).toBe('LinkedInPreA');
  });

  it('parses APPLE PAY descriptions and strips trailing reference numbers', () => {
    const result = extractVendor(
      'Ref: Starling Account: 12345678, SortCode: 00-00-00\nAPPLE PAY Apple 123456'
    );
    expect(result).not.toBeNull();
    // Trailing 6-digit number should be stripped
    expect(result).toBe('Apple');
  });

  it('returns null for unrecognised description patterns', () => {
    const result = extractVendor(
      'Ref: Starling Account: 12345678, SortCode: 00-00-00\nSOMETHING UNRECOGNISED'
    );
    expect(result).toBeNull();
  });

  it('handles multi-line descriptions correctly (ignores first Ref: line)', () => {
    // The first line is always the Starling reference line — vendor is on line 2
    const result = extractVendor(
      'Ref: Starling Account: 87654321, SortCode: 20-00-00\nDIRECT DEBIT Three 447700900123'
    );
    expect(result).not.toBeNull();
    expect(result!.toLowerCase()).toContain('three');
  });

  it('returns null when no second line is present', () => {
    const result = extractVendor('Ref: Starling Account: 12345678, SortCode: 00-00-00');
    expect(result).toBeNull();
  });
});
