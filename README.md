# CK Expense Automator

A Chrome extension that automates expense claim entry on the Churchill Knight & Associates portal. It reads unmapped bank transactions, matches them against user-defined rules, and submits them as categorised expenses.

## The Problem

Each month, CK portal users must manually enter multiple expense items. Each item requires 8+ form interactions: selecting payment type, ticking checkboxes, picking dates, choosing categories, entering amounts and VAT. Most of these are recurring expenses (internet, phone, subscriptions) with the same values every month.

## What This Does

- Scans the CK portal's suspense items table with one click
- Matches bank transactions against your regex rules (vendor, category, VAT treatment)
- Submits matched expenses directly via the portal's API — no page reloads
- Handles unmatched items with an inline assignment form that can save new rules
- Full rule management via the extension's options page (add, edit, delete, import/export)

## Install

### From Source

```bash
git clone <repo-url>
cd ck-expense-automator
npm install
npx wxt build
```

Then in Chrome:
1. Go to `chrome://extensions`
2. Enable **Developer Mode**
3. Click **Load unpacked** and select `.output/chrome-mv3`

### Rules Setup

The extension starts with no rules. Define your own or import a JSON file:

1. Right-click the extension icon and select **Options**
2. Click **Add Rule** to create rules manually, or
3. Click **Import JSON** to load a rules file

Each rule needs:
- **Name** — human-readable label (e.g. "Virgin Media Internet")
- **Match Pattern** — regex to match against bank descriptions (e.g. `virgin\s*media`)
- **Category** — expense category (Telephone, Subscriptions, Travel, etc.)
- **Vendor** — who you're paying
- **VAT** — whether to include VAT and the amount or percentage

### Example Rules JSON

```json
[
  {
    "name": "Virgin Media Internet",
    "matchPattern": "virgin\\s*media",
    "nominalId": "48",
    "description": "Internet",
    "purchasedFrom": "Virgin Media Business",
    "hasVat": true,
    "vatAmount": 12.00,
    "enabled": true
  },
  {
    "name": "Claude AI",
    "matchPattern": "claude\\.ai",
    "nominalId": "68",
    "description": "AI Assistant",
    "purchasedFrom": "Anthropic",
    "hasVat": false,
    "enabled": true
  }
]
```

## Usage

1. Navigate to your expense claim on the CK portal (`/ExpenseItems/Create?claimId=...`)
2. The panel appears centered on the page
3. Click **Scan Items** to read your unmapped bank transactions
4. **Matched items** appear with their assigned category, vendor, and VAT — click **Submit** individually or **Submit All**
5. **Unmatched items** can be expanded with `+` to assign a category, reason, and vendor inline
6. After submitting, reload the page to see the updated expense table

## Development

```bash
npm install
npx wxt dev          # dev mode with HMR
npx vitest run       # run tests
npx wxt build        # production build
```

### Project Structure

```
entrypoints/
  ck-portal.content.ts   # MAIN world — reads DataTable via page jQuery
  ck-panel.content.ts    # ISOLATED world — Shadow DOM panel
  background.ts          # Service worker — onInstall setup
  popup/                 # Extension popup
  options/               # Rule management page
lib/
  types.ts               # Shared interfaces
  rules-store.ts         # chrome.storage.sync CRUD
  expense-engine.ts      # Matching, VAT calculation, payload builder
  ck-api.ts              # Portal interaction (DataTable + fetch POST)
  vendor-extractor.ts    # Bank description parser
ui/
  panel.ts               # Panel DOM builder and state
  panel-utils.ts         # Pure utilities (categories, currency, VAT hints)
  panel.css              # Shadow DOM styles
```

### Architecture

The extension uses two content scripts in different Chrome worlds:

- **MAIN world** (`ck-portal.content.ts`) — accesses the page's jQuery and DataTables API to read suspense items. Cannot use Chrome extension APIs.
- **ISOLATED world** (`ck-panel.content.ts`) — mounts the Shadow DOM panel and has access to `chrome.storage` and `chrome.runtime`. Communicates with the MAIN world via `window.postMessage`.

## Tech Stack

- [WXT](https://wxt.dev) 0.20.x — Chrome extension framework (Manifest V3)
- TypeScript 5.x — strict mode
- Vitest — unit testing
- Shadow DOM — CSS isolation from the CK portal
- chrome.storage.sync — rule persistence across devices

## License

MIT
