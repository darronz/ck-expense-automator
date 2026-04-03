# CK Expense Automator — Chrome Extension

## Project Overview

A Chrome extension that automates expense claim entry on the Churchill Knight & Associates accountancy portal (`portal.churchill-knight.co.uk`). It injects into the "Add Items" page, reads unmapped suspense items from the user's business bank account, matches them against user-defined rules, and submits them as expenses — either in bulk or one by one with review.

Churchill Knight is a UK umbrella/limited company accountancy service used by thousands of freelancers and contractors. Their portal's expense UI is painful: each item requires 8+ form interactions, date picker clicks, and scrolling. This extension reduces that to a single click for recurring expenses.

## Target Users

UK freelancers/contractors who use Churchill Knight to manage their limited company accounts. Non-technical users — the extension must be installable from the Chrome Web Store with zero configuration beyond defining their expense rules.

## The Problem

Each month, the user must:
1. Navigate to their expense claim on the CK portal
2. For each bank transaction (suspense item), manually:
   - Select "Business account" payment type
   - Tick "Map to Suspense Item(s)"
   - Find and tick the correct suspense item in a paginated DataTable
   - Pick the date via a date picker (which triggers an AJAX call to load categories)
   - Select an expense category from a dropdown
   - Enter reason, vendor, amount, VAT
   - Click "Add Expense(s)"
3. Repeat for 10-20 items per month

Most of these are **recurring** (same vendor, same category, every month) — internet, phone, subscriptions, etc.

## Technical Architecture

### Extension Structure
```
ck-expense-automator/
├── manifest.json          # Manifest V3
├── content.js             # Content script injected on CK portal
├── popup.html             # Extension popup (rule management)
├── popup.js               # Popup logic
├── popup.css              # Popup styles
├── options.html           # Full options page (rule editor, import/export)
├── options.js
├── options.css
├── background.js          # Service worker (optional, for badge updates etc.)
├── lib/
│   ├── expense-engine.js  # Core matching + submission logic
│   ├── ck-api.js          # Churchill Knight portal interaction layer
│   └── rules-store.js     # chrome.storage.sync wrapper for rules
├── ui/
│   ├── panel.js           # Injected side panel UI on the CK page
│   ├── panel.css
│   └── panel.html         # Template for the injected panel
├── icons/
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
└── CLAUDE.md              # This file
```

### Manifest V3 Configuration
- **Permissions**: `storage`, `activeTab`
- **Host permissions**: `https://portal.churchill-knight.co.uk/*`
- **Content scripts**: Injected on `https://portal.churchill-knight.co.uk/ExpenseItems/*`

## Churchill Knight Portal — Technical Details

### Page: Add Expense Items
**URL pattern**: `https://portal.churchill-knight.co.uk/ExpenseItems/Create?claimId={claimId}`

This is an ASP.NET MVC page with a standard HTML form. **No CSRF token**.

### Form POST Endpoint
`POST /ExpenseItems/Create?claimId={claimId}`

Content-Type: `application/x-www-form-urlencoded`

### Form Fields (all required unless noted)

| Field | Type | Description | Example |
|---|---|---|---|
| `Id` | hidden | Always `0` for new items | `0` |
| `ExpenseClaimId` | hidden | Claim ID from URL | `275672` |
| `AccountingTypeId` | hidden | Always `2` | `2` |
| `ExpenseDates` | text | Date dd/mm/yyyy | `13/03/2026` |
| `FirstExpenseDate` | hidden | ISO date yyyy-mm-dd | `2026-03-13` |
| `LastExpenseDate` | hidden | ISO date yyyy-mm-dd | `2026-03-13` |
| `VisibleDate` | hidden | Empty string | `` |
| `NominalId` | select | Category ID (see below) | `68` |
| `Description` | text | Reason for expense | `Cloud DB` |
| `PurchasedFrom` | text | Vendor name | `Supabase` |
| `ExpensePaymentTypeId` | select | `2` = Business account | `2` |
| `ActiveUserCompanyFrsRegistered` | hidden | `False` | `False` |
| `ActiveUserCompanyVatRegistered` | hidden | `True` | `True` |
| `GrossAmountPaid` | text | Gross amount | `18.67` |
| `HasVatReceipt` | checkbox | `true` or `false` | `false` |
| `HasVatReceipt` | hidden | ASP.NET always sends `false` as second value | `false` |
| `VatAmountPaid` | text | VAT amount (if HasVatReceipt) | `12.00` |
| `NetAmountPaid` | text | Net = Gross - VAT | `60.00` |
| `MappedSuspenseItemIds` | hidden | Comma-separated suspense IDs | `102783` |
| `IsHavingSuspenseItems` | hidden | `True` | `True` |
| `IsMappedToSuspenseItems` | checkbox | `true` when mapping | `true` |
| `IsMappedToSuspenseItems` | hidden | ASP.NET pattern | `false` |
| `PreviousPage` | hidden | Referrer URL | (current URL) |

### AJAX Endpoint: Get Categories
```
GET /ExpenseItems/GetAllCategories?expenseClaimId={claimId}&selectedExpenseDates={dd%2Fmm%2Fyyyy}
```
Returns the list of available expense categories for a given date. The NominalId dropdown is disabled until this fires. **For direct POST submissions, we can skip this and use known NominalId values directly.**

### Expense Category IDs (NominalId)

These are the key ones — the full list has ~60 options:

| NominalId | Category |
|---|---|
| `48` | Telephone |
| `50` | Stationery |
| `51` | Advertising |
| `52` | Travel |
| `53` | Subsistence |
| `55` | Fuel |
| `61` | Licenses |
| `62` | Insurance |
| `64` | Maintenance & repairs |
| `65` | Staff training |
| `68` | Subscriptions |
| `69` | Office equipment |
| `70` | Computer peripherals |
| `72` | Consultancy fees |
| `74` | Books and publications |
| `78` | Legal & Professional fees |
| `81` | Entertainment |
| `83` | Promotional cost |
| `85` | Bank charges |
| `114` | Computer equipment cost |

### Suspense Items Table

The suspense items (unmapped bank transactions) are rendered in a jQuery DataTable with id `DataTables_Table_1` and class `suspenseitems-table`.

**Key behaviours:**
- The table only appears after selecting Payment Type = "Business account" AND ticking "Map to Suspense Item(s)"
- It uses DataTables Select extension — clicking a row's checkbox cell triggers `dt.row(idx).select()` which populates the hidden field `#MappedSuspenseItemIds` with the suspense item's numeric ID
- The table is paginated (default 5 per page). Use `dt.page.len(-1).draw(false)` to show all rows
- Each row contains: checkbox cell (td.select-checkbox), date, description (bank reference text), amount

**Reading suspense item IDs programmatically:**
```javascript
const dt = $('#DataTables_Table_1').DataTable();
dt.page.len(-1).draw(false);
dt.rows().every(function(idx) {
  dt.rows().deselect();
  dt.row(idx).select();
  const suspenseId = $('#MappedSuspenseItemIds').val();
  // ... read row data from DOM cells
});
dt.rows().deselect();
$('#MappedSuspenseItemIds').val('');
```

### Suspense Item Description Format
Bank transaction descriptions follow this pattern:
```
Ref: Starling Account: XXXXXXXX, SortCode: XX-XX-XX
ONLINE PAYMENT SUPABASE $25.00, Rate: 1.3390
```
or:
```
Ref: Starling Account: XXXXXXXX, SortCode: XX-XX-XX
DIRECT DEBIT Virgin Media 760869601001
```
or:
```
Ref: Starling Account: XXXXXXXX, SortCode: XX-XX-XX
CARD SUBSCRIPTION LinkedInPreA 70807384
```

The matching keywords are in the second/third lines — vendor names, payment types, reference numbers.

### Submitting via fetch (no page reload)
```javascript
const formData = new URLSearchParams();
formData.append('Id', '0');
// ... append all fields ...

const response = await fetch(`/ExpenseItems/Create?claimId=${claimId}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: formData.toString(),
  credentials: 'same-origin'
});
// Returns 200 on success, redirects to same page
```

### VAT Validation Rule
The portal enforces: **VAT must be > 0 and ≤ 20% of Net Amount Paid**. The Net Amount = Gross - VAT. So if Gross is £72 and VAT is £12, Net = £60 and 20% of £60 = £12 ✓. If the VAT exceeds this, the form rejects with a validation error.

## Expense Rules Schema

Rules are stored in `chrome.storage.sync` for per-user persistence and cross-device sync.

```typescript
interface ExpenseRule {
  id: string;                    // UUID
  name: string;                  // Human-readable name, e.g. "Virgin Media Internet"
  matchPattern: string;          // Regex pattern to match against suspense description
  matchFlags?: string;           // Regex flags (default: 'i' for case-insensitive)
  nominalId: string;             // Category ID
  description: string;           // Reason for expense
  purchasedFrom: string;         // Vendor name
  hasVat: boolean;               // Whether to tick Has VAT Receipt
  vatAmount: number | null;      // Fixed VAT amount, or null
  vatPercentage: number | null;  // VAT as percentage of gross (alternative to fixed amount)
  enabled: boolean;              // Toggle rule on/off
  createdAt: string;             // ISO date
  lastUsed?: string;             // ISO date of last match
  matchCount?: number;           // How many times this rule has been used
}

interface RulesConfig {
  rules: ExpenseRule[];
  version: number;               // Schema version for migrations
}
```

### Default/Example Rules

```javascript
const DEFAULT_RULES = [
  {
    name: "Virgin Media Internet",
    matchPattern: "virgin\\s*media",
    nominalId: "48",
    description: "Internet",
    purchasedFrom: "Virgin Media Business",
    hasVat: true,
    vatAmount: 12.00,
    vatPercentage: null
  },
  {
    name: "Supabase",
    matchPattern: "supabase",
    nominalId: "68",
    description: "Cloud DB",
    purchasedFrom: "Supabase",
    hasVat: false,
    vatAmount: null,
    vatPercentage: null
  },
  {
    name: "LinkedIn Premium",
    matchPattern: "linkedin",
    nominalId: "68",
    description: "LinkedIn Premium",
    purchasedFrom: "LinkedIn",
    hasVat: false,
    vatAmount: null,
    vatPercentage: null
  },
  {
    name: "Claude AI",
    matchPattern: "claude\\.ai",
    nominalId: "68",
    description: "AI Assistant",
    purchasedFrom: "Anthropic",
    hasVat: false,
    vatAmount: null,
    vatPercentage: null
  },
  {
    name: "Apple Developer Program",
    matchPattern: "APPLE\\.COM.*\\$99",
    nominalId: "68",
    description: "Apple Developer Program",
    purchasedFrom: "Apple",
    hasVat: false,
    vatAmount: null,
    vatPercentage: null
  },
  {
    name: "Three Mobile",
    matchPattern: "three\\s*\\d{9,}",
    nominalId: "48",
    description: "Mobile phone",
    purchasedFrom: "Three",
    hasVat: true,
    vatAmount: null,
    vatPercentage: 20
  },
  {
    name: "iCloud+",
    matchPattern: "APPLE\\s*(PAY|STORE)\\s*.*R496",
    nominalId: "68",
    description: "iCloud+",
    purchasedFrom: "Apple",
    hasVat: false,
    vatAmount: null,
    vatPercentage: null
  },
  {
    name: "Twilio",
    matchPattern: "twilio",
    nominalId: "68",
    description: "SMS/Voice API",
    purchasedFrom: "Twilio",
    hasVat: false,
    vatAmount: null,
    vatPercentage: null
  }
];
```

## UI Design

### Injected Panel (Content Script)

When on the CK Add Items page, the extension injects a floating panel (right sidebar or bottom-right overlay, draggable/resizable) that replaces the native CK workflow entirely.

#### Panel Layout

```
┌─────────────────────────────────────────────────┐
│  CK Expense Automator          [−] [×]          │
│  Claim: 2026 March  •  6 items  •  5 matched    │
├─────────────────────────────────────────────────┤
│                                                  │
│  ✅ MATCHED (5)              [Submit All ▶]      │
│  ─────────────────────────────────────────────── │
│  📅 13/03  £24.99  LinkedIn Premium              │
│     Subscriptions · LinkedIn · No VAT   [Submit] │
│                                                  │
│  📅 09/03  £74.39  Apple Developer Program       │
│     Subscriptions · Apple · No VAT      [Submit] │
│                                                  │
│  📅 05/03  £28.64  Mobile phone                  │
│     Telephone · Three · VAT £4.77       [Submit] │
│  ...                                             │
│                                                  │
│  ❓ UNMATCHED (1)                                │
│  ─────────────────────────────────────────────── │
│  📅 01/03  £20.00  TWILIO.COM                    │
│     [Assign & Submit ▼]                          │
│                                                  │
├─────────────────────────────────────────────────┤
│  Submitted: 0/6  •  Ready                        │
└─────────────────────────────────────────────────┘
```

#### Matched Items

Each matched item shows a compact summary row:
- Date, amount, rule name (derived from the matched rule)
- Category, vendor, VAT status as secondary line
- Individual **[Submit]** button to submit just that one
- Clicking the row expands to show full details and an **[Edit]** link to override any field before submission
- **[Submit All ▶]** button at the section header to bulk-submit every matched item

#### Unmatched Items — Inline Assignment Flow

This is the critical UX for unknown items. When an item has no matching rule, the panel shows an **[Assign & Submit ▼]** button. Clicking it expands an **inline form** directly within the panel row:

```
┌─────────────────────────────────────────────────┐
│  📅 01/03  £20.00  TWILIO.COM                    │
│                                                  │
│  Category:    [Subscriptions        ▼]           │
│  Reason:      [SMS/Voice API         ]           │
│  Vendor:      [Twilio                ]           │
│  Has VAT:     [ ] No                             │
│  VAT Amount:  [                      ]  (greyed) │
│                                                  │
│  ☐ Save as rule for future "TWILIO" matches      │
│                                                  │
│  [Submit]  [Cancel]                              │
└─────────────────────────────────────────────────┘
```

**Inline form behaviour:**
- **Category dropdown** — populated with all known NominalId values, searchable/filterable. Most-used categories float to the top.
- **Reason** — free text, auto-suggested from existing rules if similar vendor detected
- **Vendor** — pre-filled by extracting the vendor keyword from the bank description (e.g. "TWILIO.COM" → "Twilio"). User can edit.
- **Has VAT checkbox** — when ticked, reveals the VAT Amount field and auto-calculates Net
- **VAT Amount** — accepts a fixed amount. Shows a hint: "Max: £X.XX (20% of net)" with real-time validation
- **"Save as rule" checkbox** — checked by default. When checked, after submission the extension auto-creates a new rule in `chrome.storage.sync` with:
  - `matchPattern` derived from the vendor keyword in the description (e.g. `twilio`)
  - All the field values the user just entered
  - The user can edit the auto-generated match pattern before saving
- **[Submit]** — submits this single item immediately and collapses the form back to a success row
- **[Cancel]** — collapses without submitting

**Smart defaults for the inline form:**
- The extension should attempt to extract a likely vendor name from the bank description by stripping the common prefix ("Ref: Starling Account: XXXXXXXX, SortCode: XX-XX-XX") and parsing the remaining text for recognisable patterns:
  - "ONLINE PAYMENT {VENDOR}" → vendor = VENDOR
  - "CARD SUBSCRIPTION {VENDOR}" → vendor = VENDOR
  - "DIRECT DEBIT {VENDOR}" → vendor = VENDOR
  - "APPLE PAY {VENDOR}" → vendor = VENDOR
- Category defaults to "Subscriptions" (most common for recurring items) but is easily changed
- If the amount matches a common VAT-inclusive pattern (divisible by 1.2), hint that VAT might apply

#### Post-Submission States

After each item is submitted (individually or in bulk):
- The row transitions to a **success state**: green check, greyed out, with "✓ Submitted" label
- Failed items show red with error message and a **[Retry]** button
- A progress bar appears during bulk submission: "Submitting 3/6..."
- After all items complete, a summary: "✅ 5 submitted, ❌ 1 failed"
- A **[Reload Page]** button appears to refresh the CK portal and verify the Expense Items table

### Popup (Extension Icon)

Quick access to:
- Current page status (is it a CK expense page? if not, shows "Navigate to CK Expenses to use")
- Count of pending suspense items and matched/unmatched breakdown
- Link to open the full options/rules page
- Quick toggle to show/hide the injected panel

### Options Page

Full rule management:
- List all rules in a table with enable/disable toggles, edit, delete
- Add new rule manually (with the same form as the inline assignment)
- Import/export rules as JSON (for sharing between users or backup)
- Category dropdown populated with all known NominalId values
- "Test rule" feature: paste a sample bank description and see if it matches
- Rule usage statistics: match count, last used date
- "Reset to defaults" button to restore the example rules

## Implementation Notes

### Content Script Injection Strategy
- Use `manifest.json` content_scripts to auto-inject on `https://portal.churchill-knight.co.uk/ExpenseItems/*`
- The content script should wait for the page's jQuery and DataTables to be fully loaded before initialising
- Detection: check for `$('#DataTables_Table_1').length` or `$.fn.dataTable` availability

### Reading Suspense Items
The content script must:
1. Programmatically set Payment Type to "Business account" (or read existing value)
2. Check/set "Map to Suspense Items" checkbox
3. Wait for the suspense items DataTable to load (it loads via DOM manipulation, not AJAX)
4. Iterate through all rows using the DataTables API to extract IDs and descriptions
5. Reset the form state after reading (deselect all, clear MappedSuspenseItemIds)

### Submission Strategy
Use `fetch()` with `credentials: 'same-origin'` to POST directly. This:
- Uses the existing authenticated session (no cookie extraction needed)
- Avoids page reloads between submissions
- Allows rapid sequential submission with progress reporting

After all submissions complete, reload the page once to refresh the Expense Items table.

### Error Handling
- If a POST returns non-200, report the error and continue with remaining items
- Validate VAT amounts client-side before submission (must be ≤ 20% of net)
- Handle session expiry gracefully (detect redirect to login page)

### ASP.NET Hidden Field Pattern
ASP.NET MVC checkbox fields always send two values: the checkbox value AND a hidden field with `false`. This is so the server receives `false` when the checkbox is unchecked (since unchecked checkboxes don't submit). Always append both:
```javascript
formData.append('HasVatReceipt', hasVat ? 'true' : 'false');
formData.append('HasVatReceipt', 'false');
```

## Development Setup

```bash
# Clone and develop
cd ck-expense-automator

# Load as unpacked extension in Chrome:
# 1. Go to chrome://extensions
# 2. Enable Developer Mode
# 3. Click "Load unpacked"
# 4. Select the project directory

# After code changes, click the refresh icon on the extension card
# For content script changes, also reload the CK portal tab
```

## Testing

- Test with the actual CK portal (requires a real account)
- The dry-run mode should preview all matches without submitting
- Test edge cases: items with foreign currency conversions (amount shows as e.g. "$25.00, Rate: 1.3390"), items with no VAT, items with VAT at exactly 20%

## Future Enhancements

- Auto-detect new expense claim periods and notify user
- Rule suggestions based on unmatched items (learn from manual entries)
- Bulk rule import from CSV (for accountants managing multiple clients)
- Support for personal account expenses (non-suspense item mapping)
- Firefox extension port
