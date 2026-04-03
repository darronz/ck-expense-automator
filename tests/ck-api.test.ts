// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  parseDateToISO,
  parseAmount,
  parseValidationErrors,
  detectSessionExpiry,
} from '../lib/ck-api';

// ---------------------------------------------------------------------------
// parseDateToISO
// ---------------------------------------------------------------------------

describe('parseDateToISO', () => {
  it('converts 13/03/2026 to 2026-03-13', () => {
    expect(parseDateToISO('13/03/2026')).toBe('2026-03-13');
  });

  it('converts 01/01/2024 to 2024-01-01', () => {
    expect(parseDateToISO('01/01/2024')).toBe('2024-01-01');
  });

  it('converts 31/12/2023 to 2023-12-31', () => {
    expect(parseDateToISO('31/12/2023')).toBe('2023-12-31');
  });
});

// ---------------------------------------------------------------------------
// parseAmount
// ---------------------------------------------------------------------------

describe('parseAmount', () => {
  it('strips £ symbol and returns float', () => {
    expect(parseAmount('£18.67')).toBe(18.67);
  });

  it('parses plain number string', () => {
    expect(parseAmount('18.67')).toBe(18.67);
  });

  it('strips commas and returns float for £1,234.56', () => {
    expect(parseAmount('£1,234.56')).toBe(1234.56);
  });

  it('returns 0 for empty string', () => {
    expect(parseAmount('')).toBe(0);
  });

  it('returns 0 for non-numeric string', () => {
    expect(parseAmount('not a number')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// parseValidationErrors
// ---------------------------------------------------------------------------

describe('parseValidationErrors', () => {
  it('extracts multiple li items from .validation-summary-errors', () => {
    const html = `
      <div class="validation-summary-errors">
        <ul>
          <li>The VAT amount is too high.</li>
          <li>Amount is required.</li>
        </ul>
      </div>`;
    const errors = parseValidationErrors(html);
    expect(errors).toEqual(['The VAT amount is too high.', 'Amount is required.']);
  });

  it('extracts text from .field-validation-error span', () => {
    const html = `<span class="field-validation-error">The Description field is required.</span>`;
    const errors = parseValidationErrors(html);
    expect(errors).toEqual(['The Description field is required.']);
  });

  it('combines .validation-summary-errors and .field-validation-error without duplicates', () => {
    const html = `
      <div class="validation-summary-errors">
        <ul><li>The VAT amount is too high.</li></ul>
      </div>
      <span class="field-validation-error">The VAT amount is too high.</span>
      <span class="field-validation-error">The Description field is required.</span>`;
    const errors = parseValidationErrors(html);
    // The shared message must not be duplicated
    expect(errors).toContain('The VAT amount is too high.');
    expect(errors).toContain('The Description field is required.');
    expect(errors.filter((e) => e === 'The VAT amount is too high.')).toHaveLength(1);
  });

  it('returns empty array for clean HTML with no error classes', () => {
    const html = `<html><body><p>All good</p></body></html>`;
    expect(parseValidationErrors(html)).toEqual([]);
  });

  it('returns empty array when only .validation-summary-valid class present', () => {
    const html = `
      <div class="validation-summary-valid">
        <ul><li>Some item</li></ul>
      </div>`;
    expect(parseValidationErrors(html)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// detectSessionExpiry
// ---------------------------------------------------------------------------

describe('detectSessionExpiry', () => {
  function makeResponse(redirected: boolean, url: string): Response {
    return { redirected, url } as unknown as Response;
  }

  it('returns true when redirected to /Account/Login', () => {
    const r = makeResponse(true, 'https://portal.churchill-knight.co.uk/Account/Login');
    expect(detectSessionExpiry(r)).toBe(true);
  });

  it('returns true when redirected to /Login path', () => {
    const r = makeResponse(true, 'https://portal.churchill-knight.co.uk/Login');
    expect(detectSessionExpiry(r)).toBe(true);
  });

  it('returns true when redirected to a different domain (left portal)', () => {
    const r = makeResponse(true, 'https://other-site.com/page');
    expect(detectSessionExpiry(r)).toBe(true);
  });

  it('returns false when redirected to portal expense page (PRG success)', () => {
    const r = makeResponse(true, 'https://portal.churchill-knight.co.uk/ExpenseItems/Create?claimId=12345');
    expect(detectSessionExpiry(r)).toBe(false);
  });

  it('returns false when not redirected', () => {
    const r = makeResponse(false, 'https://portal.churchill-knight.co.uk/ExpenseItems/Create?claimId=12345');
    expect(detectSessionExpiry(r)).toBe(false);
  });
});
