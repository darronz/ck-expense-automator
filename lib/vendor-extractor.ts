// lib/vendor-extractor.ts
// Smart vendor extraction from Starling bank description strings.
// Pure function — no browser API calls.

/**
 * Pattern: [prefix regex, capture group index for the vendor portion]
 * Each pattern matches a common Starling bank transaction format.
 * The vendor capture is the text immediately after the payment type keyword.
 */
const VENDOR_PATTERNS: Array<[RegExp, number]> = [
  // "ONLINE PAYMENT SUPABASE $25.00, Rate: 1.3390" → vendor = "SUPABASE"
  [/^ONLINE PAYMENT\s+(.+?)(?:\s+\$[\d.,]+.*)?$/im, 1],
  // "DIRECT DEBIT Virgin Media 760869601001" → vendor = "Virgin Media"
  [/^DIRECT DEBIT\s+(.+?)(?:\s+\d{6,})?$/im, 1],
  // "CARD SUBSCRIPTION LinkedInPreA 70807384" → vendor = "LinkedInPreA"
  [/^CARD SUBSCRIPTION\s+(.+?)(?:\s+\d{6,})?$/im, 1],
  // "APPLE PAY Apple 123456" → vendor = "Apple"
  [/^APPLE PAY\s+(.+?)(?:\s+\d{6,})?$/im, 1],
];

/**
 * Remove trailing reference numbers (6 or more consecutive digits) from a vendor name.
 * Example: "Virgin Media 760869601001" → "Virgin Media"
 */
function stripTrailingNumbers(raw: string): string {
  return raw.replace(/\s+\d{6,}$/, '').trim();
}

/**
 * Extract the vendor name from a Starling bank description string.
 *
 * Starling descriptions have the format:
 *   Line 1: "Ref: Starling Account: XXXXXXXX, SortCode: XX-XX-XX"
 *   Line 2: "ONLINE PAYMENT SUPABASE $25.00, Rate: 1.3390"
 *        or "DIRECT DEBIT Virgin Media 760869601001"
 *        or "CARD SUBSCRIPTION LinkedInPreA 70807384"
 *        or "APPLE PAY Apple 123456"
 *
 * Returns null if no recognised pattern is found.
 */
export function extractVendor(description: string): string | null {
  // Strip the Starling reference prefix (first line) and work with the rest
  const lines = description.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) {
    return null;
  }

  // The meaningful content starts on line 2
  const content = lines.slice(1).join(' ');

  for (const [pattern, groupIdx] of VENDOR_PATTERNS) {
    const match = content.match(pattern);
    if (match?.[groupIdx]) {
      return stripTrailingNumbers(match[groupIdx].trim());
    }
  }

  return null;
}
