# Phase 1: Foundation and Data Layer - Research

**Researched:** 2026-04-03
**Domain:** WXT Chrome Extension Framework, chrome.storage.sync, TypeScript, Regex Matching Engine
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
None — all implementation choices are at Claude's discretion for this pure infrastructure phase.

### Claude's Discretion
- WXT project structure and configuration
- TypeScript strictness settings
- chrome.storage.sync key structure (single array vs per-rule keys)
- Expense engine API design
- Default rule set from CLAUDE.md examples
- Smart vendor extraction regex patterns

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PORT-01 | Content script injects via MAIN world and can access the page's jQuery and DataTables instances | WXT `world: "MAIN"` content script entrypoint with `runAt: "document_idle"` + polling/MutationObserver to detect `$.fn.dataTable` |
| RULE-01 | User can define expense rules with regex pattern, category (NominalId), vendor, description, and VAT settings | `ExpenseRule` TypeScript interface defined in `lib/rules-store.ts` |
| RULE-02 | Rules are stored in chrome.storage.sync and persist across sessions and devices | Single `rules` key in `chrome.storage.sync`; 8 default rules ≈ 2KB, well within 8192-byte per-item limit |
| RULE-03 | Default example rules are pre-loaded on extension install | `browser.runtime.onInstalled` listener in `background.ts` with `details.reason === 'install'` check |
| RULE-04 | Expense engine matches bank descriptions against enabled rules using regex (case-insensitive by default) | `new RegExp(rule.matchPattern, rule.matchFlags ?? 'i').test(description)` pattern |
| RULE-05 | VAT is validated client-side before submission (VAT > 0 and ≤ 20% of net amount) | `vat > 0 && vat <= (gross - vat) * 0.20` formula verified from CLAUDE.md |
| RULE-06 | Expense engine constructs complete form payload with all required fields (Id, ExpenseClaimId, dates, NominalId, etc.) | `URLSearchParams` payload builder with all 20 form fields from CLAUDE.md spec |
| RULE-07 | Smart vendor extraction parses bank descriptions to identify vendor name from ONLINE PAYMENT, DIRECT DEBIT, CARD SUBSCRIPTION, and APPLE PAY patterns | Regex with named capture groups — pattern documented in Code Examples section |
| RULE-08 | Rule usage statistics (matchCount, lastUsed) are tracked in chrome.storage.local | Separate `chrome.storage.local` key to avoid polluting sync storage with mutable stats |
</phase_requirements>

---

## Summary

Phase 1 establishes the complete technical foundation: WXT-scaffolded Chrome extension project with TypeScript, a content script running in MAIN world context to access the CK portal's jQuery/DataTables instances, the rules storage layer using chrome.storage.sync, and the core expense matching and payload-building engine.

The critical technical decision is **MAIN world injection**. Content scripts run in an isolated world by default, meaning they cannot access `window.$` or `window.jQuery` that the CK portal loads. WXT supports `world: "MAIN"` directly on content script entrypoints (Chromium-only, which is acceptable since this is a Chrome extension). This is the correct approach — use it directly rather than the `injectScript` two-file workaround (which is for cross-browser support, not needed here).

Storage is straightforward: the entire rules array fits comfortably within chrome.storage.sync's 8KB per-item limit (~2KB for 8-10 typical rules). Store as a single `rules` key. Rule usage statistics (matchCount, lastUsed) go in chrome.storage.local since they change on every match and don't need cross-device sync.

**Primary recommendation:** Scaffold with `npx wxt@latest init`, select Vanilla TypeScript template, configure MAIN world content script in the entrypoint file, and implement `rules-store.ts` and `expense-engine.ts` as plain TypeScript modules (no framework needed for this phase).

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| wxt | 0.20.20 | Chrome extension build framework with HMR, MV3, TypeScript | Replaces manual MV3 wiring; file-based manifest generation; Vitest integration built-in |
| TypeScript | 5.x (via wxt) | Type safety | WXT ships its own tsconfig; extends it for strict mode |
| @wxt-dev/browser | 0.1.38 | Type-safe browser API access | Ships with WXT 0.20+; replaces @types/webextension-polyfill |

### Supporting (Testing)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | 4.1.2 | Unit test runner | Testing expense-engine.ts and rules-store.ts logic without a browser |
| @webext-core/fake-browser | 1.3.4 | In-memory browser API mock | Provided by WXT's `WxtVitest()` plugin — no manual mocking needed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| WXT `world: "MAIN"` | `injectScript` two-file pattern | `injectScript` is for cross-browser support; Chrome-only makes direct `world: "MAIN"` cleaner |
| Single `rules` key in storage.sync | Per-rule keys (`rule-{uuid}`) | Per-rule keys allow granular quota management but add complexity; single key is fine for 8-30 rules |
| chrome.storage.local for stats | chrome.storage.sync for stats | Stats change on every match; don't waste sync write quota; local is correct for ephemeral counters |

**Installation:**
```bash
npx wxt@latest init ck-expense-automator
# Select: Vanilla TypeScript
npm install
```

**Version verification:**
```bash
npm view wxt version        # 0.20.20 (verified 2026-04-03)
npm view vitest version     # 4.1.2 (verified 2026-04-03)
npm view @webext-core/fake-browser version  # 1.3.4 (verified 2026-04-03)
```

---

## Architecture Patterns

### Recommended Project Structure

WXT uses an `entrypoints/` directory for all extension entry points. Source utilities live in `utils/` (auto-imported) or explicit `lib/` directory.

```
ck-expense-automator/
├── entrypoints/
│   ├── background.ts          # Service worker — onInstalled, default rules seeding
│   └── ck-portal.content.ts   # MAIN world content script on ExpenseItems pages
├── lib/
│   ├── rules-store.ts         # chrome.storage.sync CRUD + default rules
│   ├── expense-engine.ts      # Regex matching, VAT calculation, payload builder
│   └── vendor-extractor.ts    # Smart vendor extraction from bank descriptions
├── public/
│   └── icons/                 # icon-16.png, icon-48.png, icon-128.png
├── tests/
│   ├── expense-engine.test.ts
│   ├── rules-store.test.ts
│   └── vendor-extractor.test.ts
├── wxt.config.ts              # Manifest, permissions, host_permissions
├── vitest.config.ts           # WxtVitest() plugin
├── tsconfig.json              # Extends .wxt/tsconfig.json
└── package.json
```

### Pattern 1: MAIN World Content Script (WXT)

**What:** Configure the content script entrypoint with `world: "MAIN"` so it runs in the page's JavaScript context, gaining direct access to `window.$`, `window.jQuery`, `window.DataTable`, etc.

**When to use:** Whenever you need access to page-level JavaScript objects loaded by the host page — mandatory for interacting with the CK portal's jQuery DataTables.

**Example:**
```typescript
// entrypoints/ck-portal.content.ts
// Source: https://wxt.dev/api/reference/wxt/interfaces/mainworldcontentscriptentrypointoptions

export default defineContentScript({
  matches: ['https://portal.churchill-knight.co.uk/ExpenseItems/*'],
  world: 'MAIN',
  runAt: 'document_idle',

  main() {
    // Direct access to page jQuery and DataTables
    waitForDataTable().then((dt) => {
      // dt is the DataTables API instance
    });
  }
});
```

**IMPORTANT limitation:** `world: "MAIN"` content scripts have **no access to extension APIs** (`browser.storage`, `browser.runtime`, etc.). All data must be passed via:
- CustomEvents dispatched on `window`
- `window.postMessage` to a companion isolated-world content script
- Or, for Phase 1 (no submission yet), the MAIN world script can read suspense items and return data via events

For Phase 1 (data layer only), the content script merely needs to confirm `$('#DataTables_Table_1').DataTable()` works. No storage access is needed from MAIN world in this phase — storage is accessed from background/popup (isolated contexts).

### Pattern 2: Wait for DataTable Availability

**What:** The CK portal's DataTable is not present on initial DOM load. It appears after user interaction (selecting Payment Type). For Phase 1 verification purposes, poll for `$.fn.dataTable`.

**When to use:** Any time you need to verify MAIN world jQuery access before the DataTable is activated.

**Example:**
```typescript
// Source: CLAUDE.md + MDN MutationObserver best practices

function waitForDataTable(timeoutMs = 10000): Promise<boolean> {
  return new Promise((resolve, reject) => {
    // Check immediately
    if (typeof $ !== 'undefined' && $.fn && $.fn.dataTable) {
      resolve(true);
      return;
    }

    const start = Date.now();
    const interval = setInterval(() => {
      if (typeof $ !== 'undefined' && $.fn && $.fn.dataTable) {
        clearInterval(interval);
        resolve(true);
      }
      if (Date.now() - start > timeoutMs) {
        clearInterval(interval);
        reject(new Error('jQuery DataTables not found within timeout'));
      }
    }, 100);
  });
}
```

### Pattern 3: rules-store.ts (chrome.storage.sync CRUD)

**What:** Typed wrapper around chrome.storage.sync for rule CRUD operations. Single `rules` key holds the full array.

**When to use:** All rule reads/writes go through this module — never access storage directly from engine or UI code.

**Example:**
```typescript
// Source: https://developer.chrome.com/docs/extensions/reference/api/storage

const STORAGE_KEY = 'rules';

export async function getRules(): Promise<ExpenseRule[]> {
  const result = await browser.storage.sync.get(STORAGE_KEY);
  return (result[STORAGE_KEY] as ExpenseRule[]) ?? [];
}

export async function saveRules(rules: ExpenseRule[]): Promise<void> {
  await browser.storage.sync.set({ [STORAGE_KEY]: rules });
}

export async function addRule(rule: ExpenseRule): Promise<void> {
  const rules = await getRules();
  rules.push(rule);
  await saveRules(rules);
}
```

### Pattern 4: Background onInstalled Default Rules

**What:** The background service worker handles the `onInstalled` event to seed default rules on first install.

**Example:**
```typescript
// entrypoints/background.ts
// Source: https://wxt.dev/guide/essentials/entrypoints.html

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install') {
      const existing = await browser.storage.sync.get('rules');
      if (!existing.rules) {
        await browser.storage.sync.set({ rules: DEFAULT_RULES });
      }
    }
  });
});
```

### Pattern 5: VAT Validation

**What:** Client-side VAT validation before any submission attempt. The CK portal rule: VAT must be > 0 and ≤ 20% of Net Amount (Gross - VAT).

**Example:**
```typescript
// Source: CLAUDE.md — "VAT Validation Rule" section

export function validateVat(gross: number, vat: number): { valid: boolean; error?: string } {
  if (vat <= 0) {
    return { valid: false, error: 'VAT must be greater than 0' };
  }
  const net = gross - vat;
  const maxVat = net * 0.20;
  if (vat > maxVat) {
    return { 
      valid: false, 
      error: `VAT £${vat.toFixed(2)} exceeds maximum £${maxVat.toFixed(2)} (20% of net £${net.toFixed(2)})` 
    };
  }
  return { valid: true };
}
```

### Pattern 6: Form Payload Builder

**What:** Constructs the complete URLSearchParams payload for a CK portal form POST, including the ASP.NET double-checkbox pattern.

**Example:**
```typescript
// Source: CLAUDE.md — "Form Fields" and "ASP.NET Hidden Field Pattern" sections

export function buildPayload(params: ExpenseSubmission): URLSearchParams {
  const form = new URLSearchParams();
  form.append('Id', '0');
  form.append('ExpenseClaimId', params.claimId);
  form.append('AccountingTypeId', '2');
  form.append('ExpenseDates', params.date);           // dd/mm/yyyy
  form.append('FirstExpenseDate', params.isoDate);     // yyyy-mm-dd
  form.append('LastExpenseDate', params.isoDate);      // yyyy-mm-dd
  form.append('VisibleDate', '');
  form.append('NominalId', params.nominalId);
  form.append('Description', params.description);
  form.append('PurchasedFrom', params.purchasedFrom);
  form.append('ExpensePaymentTypeId', '2');            // Business account
  form.append('ActiveUserCompanyFrsRegistered', 'False');
  form.append('ActiveUserCompanyVatRegistered', 'True');
  form.append('GrossAmountPaid', params.grossAmount.toString());
  // ASP.NET checkbox double-field pattern
  form.append('HasVatReceipt', params.hasVat ? 'true' : 'false');
  form.append('HasVatReceipt', 'false');
  form.append('VatAmountPaid', (params.vatAmount ?? 0).toString());
  form.append('NetAmountPaid', (params.grossAmount - (params.vatAmount ?? 0)).toString());
  form.append('MappedSuspenseItemIds', params.suspenseItemId);
  form.append('IsHavingSuspenseItems', 'True');
  form.append('IsMappedToSuspenseItems', 'true');
  form.append('IsMappedToSuspenseItems', 'false');
  form.append('PreviousPage', params.previousPage);
  return form;
}
```

### Pattern 7: Smart Vendor Extraction

**What:** Parse Starling bank description text to extract the likely vendor name. The format always has a prefix line ("Ref: Starling Account: XXXXXXXX, SortCode: XX-XX-XX") followed by the meaningful payment line.

**Example:**
```typescript
// Source: CLAUDE.md — "Suspense Item Description Format" section

const VENDOR_PATTERNS: Array<[RegExp, number]> = [
  // [pattern, capture group index for vendor]
  [/^ONLINE PAYMENT\s+(.+?)(?:\s+\$[\d.]+.*)?$/im, 1],
  [/^DIRECT DEBIT\s+(.+?)(?:\s+\d+)?$/im, 1],
  [/^CARD SUBSCRIPTION\s+(.+?)(?:\s+\d+)?$/im, 1],
  [/^APPLE PAY\s+(.+?)(?:\s+\d+)?$/im, 1],
];

export function extractVendor(description: string): string | null {
  // Strip the Starling reference prefix (first line)
  const lines = description.split('\n').map(l => l.trim()).filter(Boolean);
  // The meaningful content is on line 2+
  const content = lines.slice(1).join(' ');

  for (const [pattern, groupIdx] of VENDOR_PATTERNS) {
    const match = content.match(pattern);
    if (match?.[groupIdx]) {
      // Normalise: title case, strip trailing numbers/currency
      return normaliseVendorName(match[groupIdx].trim());
    }
  }
  return null;
}

function normaliseVendorName(raw: string): string {
  // Remove trailing reference numbers like "760869601001"
  return raw.replace(/\s+\d{6,}$/, '').trim();
}
```

### Anti-Patterns to Avoid

- **Accessing `browser.*` from `world: "MAIN"` content script:** MAIN world scripts have no extension API access. Any storage reads/writes must happen in background or isolated-world scripts.
- **Storing rule stats in chrome.storage.sync:** Write rate is limited to 120/min. Match events can be frequent. Use `chrome.storage.local` for `matchCount`/`lastUsed`.
- **Stringifying rules with `JSON.stringify` and comparing byte length manually:** Just keep the rule array under ~50 rules total; at ~200 bytes per rule, 50 rules = ~10KB — this exceeds the 8KB per-item limit. If users may have >30 rules, switch to per-rule keys (one `rule-{uuid}` key each) as a safety net. For v1 with 8 defaults and typical 20-rule sets, the single-key approach is fine.
- **Running `document_start` timing for MAIN world script:** `document_idle` is correct — jQuery and DataTables are loaded by the page, so the script must wait for the page to finish loading.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Extension build pipeline, manifest generation, HMR | Custom webpack/rollup config | WXT 0.20.20 | MV3 service worker quirks, content script bundling, web_accessible_resources automation are complex; WXT handles all of it |
| Browser API types and mocking | Custom `chrome` type definitions | @wxt-dev/browser + @webext-core/fake-browser (via WxtVitest plugin) | Types aligned with actual Chrome APIs; fake browser provides complete in-memory implementation |
| Large rules array chunking | Manual split across multiple storage keys | Keep rules under 8KB (≤ 30 rules with current schema) | The per-rule schema is ~200 bytes; 30 rules = ~6KB — comfortably within limit. Add quota check + warning if needed in v2. |

**Key insight:** WXT eliminates the most error-prone parts of MV3 development (service worker registration, content script worlds, web_accessible_resources). Don't fight the framework.

---

## Common Pitfalls

### Pitfall 1: MAIN World Content Script Has No Extension API Access
**What goes wrong:** Code in `world: "MAIN"` calls `browser.storage.sync.get(...)` and throws `ReferenceError: browser is not defined` (or returns undefined silently).
**Why it happens:** MAIN world scripts run as if they were page scripts. The extension API bridge is only available in isolated-world scripts.
**How to avoid:** Keep all `browser.*` calls in `background.ts` or a separate isolated-world content script. MAIN world script only talks to the page's DOM and JS.
**Warning signs:** `browser is not defined` or `chrome is not defined` errors in the browser console on the CK portal tab.

### Pitfall 2: WXT tsconfig Not Extended
**What goes wrong:** TypeScript can't find `browser`, `defineContentScript`, `defineBackground`, `defineUnlistedScript` global types.
**Why it happens:** WXT generates `.wxt/tsconfig.json` via `wxt prepare` (postinstall). If `tsconfig.json` doesn't extend it, globals aren't registered.
**How to avoid:** `tsconfig.json` must have `{ "extends": ".wxt/tsconfig.json" }`. Run `npm run postinstall` (which calls `wxt prepare`) after any WXT config change.
**Warning signs:** Red squiggles under `defineBackground`, `defineContentScript`, etc.

### Pitfall 3: VAT Percentage Rule Calculation Off-By-One
**What goes wrong:** Rule has `vatPercentage: 20` and the engine calculates `vat = gross * 0.20`, but this fails the portal validation when the VAT exceeds 20% of net.
**Why it happens:** The portal's rule is 20% of **net** (gross - vat), not 20% of gross. For gross £72, max VAT is £12 (= 20% of £60 net), not £14.40 (20% of gross).
**How to avoid:** When `vatPercentage` is set, calculate `vat = gross - gross / (1 + vatPct/100)`. Then validate with the `validateVat()` function.
**Warning signs:** Form submission returns a validation error about VAT amount.

### Pitfall 4: chrome.storage.sync Per-Item 8192 Byte Limit
**What goes wrong:** Adding many rules causes storage writes to silently fail or throw quota exceeded errors.
**Why it happens:** `QUOTA_BYTES_PER_ITEM` is 8192 bytes, measured as `JSON.stringify(value).length + key.length`.
**How to avoid:** For Phase 1, the single-key approach is fine with up to ~30 rules. Add a byte-count guard in `saveRules()`: estimate size before writing and throw a descriptive error if approaching limit.
**Warning signs:** `chrome.runtime.lastError` mentioning quota; storage writes fail silently.

### Pitfall 5: Background Service Worker Timing with onInstalled
**What goes wrong:** Default rules are not seeded because `onInstalled` fires before the service worker's async storage call completes, or the event is missed.
**Why it happens:** MV3 service workers can terminate between events. If the worker is not active when `onInstalled` fires, the listener might be missed.
**How to avoid:** `onInstalled` is guaranteed to fire immediately after install while the worker is alive. Use `await` for the storage write: `await browser.storage.sync.set(...)` inside an `async` listener. WXT's `defineBackground` supports this correctly.
**Warning signs:** Extension installs without default rules; storage is empty on first run.

### Pitfall 6: Regex Compilation Errors in User Rules
**What goes wrong:** A rule with an invalid `matchPattern` (e.g. unclosed parenthesis) crashes the entire matching loop.
**Why it happens:** `new RegExp(pattern)` throws `SyntaxError` for invalid patterns.
**How to avoid:** Wrap regex compilation in try/catch in `expense-engine.ts`. Log a warning and skip the rule rather than crashing.
**Warning signs:** Matching returns no results for items that should match; errors in extension background logs.

---

## Code Examples

Verified patterns from official sources and CLAUDE.md specification:

### wxt.config.ts — Complete Phase 1 Configuration
```typescript
// Source: https://wxt.dev/guide/essentials/config/manifest
import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'CK Expense Automator',
    description: 'Automate expense claim entry on the Churchill Knight portal',
    permissions: ['storage', 'activeTab'],
    host_permissions: ['https://portal.churchill-knight.co.uk/*'],
  },
});
```

### vitest.config.ts — WXT Testing Plugin
```typescript
// Source: https://wxt.dev/guide/essentials/unit-testing
import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    globals: true,
  },
});
```

### VAT Calculation for Percentage Rules
```typescript
// When rule.vatPercentage is set (e.g. 20 for standard UK VAT):
// gross / (1 + rate/100) = net; vat = gross - net
function calculateVatFromPercentage(gross: number, vatPct: number): number {
  const net = gross / (1 + vatPct / 100);
  return parseFloat((gross - net).toFixed(2));
}
// Example: gross=72, vatPct=20 → net=60, vat=12 ✓
```

### Regex Match with Error Safety
```typescript
// Source: CLAUDE.md ExpenseRule schema + standard JS best practice
function matchRule(rule: ExpenseRule, description: string): boolean {
  if (!rule.enabled) return false;
  try {
    const regex = new RegExp(rule.matchPattern, rule.matchFlags ?? 'i');
    return regex.test(description);
  } catch (err) {
    console.warn(`Invalid regex in rule "${rule.name}": ${rule.matchPattern}`, err);
    return false;
  }
}
```

### Rule Usage Stats Update (chrome.storage.local)
```typescript
// Source: CLAUDE.md RULE-08 — stats in local, not sync

export async function recordRuleUsage(ruleId: string): Promise<void> {
  const key = `stats-${ruleId}`;
  const existing = await browser.storage.local.get(key);
  const stats = existing[key] as RuleStats ?? { matchCount: 0, lastUsed: null };
  await browser.storage.local.set({
    [key]: {
      matchCount: stats.matchCount + 1,
      lastUsed: new Date().toISOString(),
    },
  });
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual webpack config for MV3 | WXT framework with file-based manifest | 2023-2024 | Eliminates most MV3 boilerplate; HMR works |
| @types/webextension-polyfill | @wxt-dev/browser (based on @types/chrome) | WXT 0.20 (March 2026) | MV3-accurate types, no auto-generated names |
| jest-chrome for testing | @webext-core/fake-browser via WxtVitest plugin | WXT 0.19+ | Zero-config in-memory browser API — no manual mocks |
| `world` in manifest.json content_scripts | `world: "MAIN"` in WXT entrypoint defineContentScript | Chrome 102+ / WXT 0.x | Direct page context access for jQuery/DataTables |

**Deprecated/outdated:**
- `@types/webextension-polyfill`: Replaced in WXT 0.20 by `@wxt-dev/browser`. Do not add to package.json.
- `jest-chrome`: Superseded by `vitest-chrome` and more cleanly by WXT's built-in fake browser.
- Webpack-based MV3 extensions: WXT (Vite-based) is the standard for new projects in 2025-2026.

---

## Open Questions

1. **MAIN world content script — can it reliably call DataTables on `document_idle`?**
   - What we know: The CK portal loads jQuery and DataTables as page scripts; at `document_idle` they should be present in `window`
   - What's unclear: Whether the DataTable instance (`#DataTables_Table_1`) is *initialized* at `document_idle` or only after user interaction (selecting Payment Type = Business Account)
   - Recommendation: Phase 1 task 01-01 verifies that `typeof $ !== 'undefined'` and `$.fn.dataTable` truthy at `document_idle`. The DataTable *row iteration* (which requires activation) is Phase 2. Phase 1 only needs to confirm jQuery/DataTables API is accessible.

2. **Single `rules` key size ceiling**
   - What we know: 8 default rules stringify to approximately 2KB. The schema is ~200 bytes per rule.
   - What's unclear: At what rule count does the user hit the 8192-byte limit? Answer: ~35-40 rules.
   - Recommendation: Add a soft limit check in `saveRules()` with a console warning at 25 rules, hard error at 35. Document in comments.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.2 |
| Config file | `vitest.config.ts` (Wave 0 creates it) |
| Quick run command | `npx vitest run` |
| Full suite command | `npx vitest run --coverage` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PORT-01 | MAIN world can access `$` and `$.fn.dataTable` | manual | Manual verification on live CK portal | ❌ Wave 0 |
| RULE-01 | ExpenseRule interface accepted by storage | unit | `npx vitest run tests/rules-store.test.ts` | ❌ Wave 0 |
| RULE-02 | Rules survive browser.storage.sync.set/get roundtrip | unit | `npx vitest run tests/rules-store.test.ts` | ❌ Wave 0 |
| RULE-03 | Default rules seeded on install (details.reason === 'install') | unit | `npx vitest run tests/rules-store.test.ts` | ❌ Wave 0 |
| RULE-04 | matchRule returns true/false for various descriptions | unit | `npx vitest run tests/expense-engine.test.ts` | ❌ Wave 0 |
| RULE-05 | validateVat rejects VAT > 20% of net | unit | `npx vitest run tests/expense-engine.test.ts` | ❌ Wave 0 |
| RULE-06 | buildPayload returns all 20 required form fields | unit | `npx vitest run tests/expense-engine.test.ts` | ❌ Wave 0 |
| RULE-07 | extractVendor handles ONLINE PAYMENT, DIRECT DEBIT, CARD SUBSCRIPTION, APPLE PAY | unit | `npx vitest run tests/vendor-extractor.test.ts` | ❌ Wave 0 |
| RULE-08 | recordRuleUsage increments matchCount in storage.local | unit | `npx vitest run tests/rules-store.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run`
- **Per wave merge:** `npx vitest run --coverage`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/expense-engine.test.ts` — covers RULE-04, RULE-05, RULE-06
- [ ] `tests/rules-store.test.ts` — covers RULE-01, RULE-02, RULE-03, RULE-08
- [ ] `tests/vendor-extractor.test.ts` — covers RULE-07
- [ ] `vitest.config.ts` — WxtVitest plugin configuration
- [ ] Framework install: `npm install --save-dev vitest @vitest/coverage-v8` — if not included in WXT init

PORT-01 is manual-only: requires a real CK portal session to verify MAIN world jQuery access. Cannot be automated without the live portal.

---

## Sources

### Primary (HIGH confidence)
- [WXT Installation Guide](https://wxt.dev/guide/installation.html) — scaffold command, version 0.20.20, TypeScript templates
- [WXT Content Scripts](https://wxt.dev/guide/essentials/content-scripts.html) — `world: "MAIN"` configuration, limitations
- [WXT MainWorldContentScriptEntrypointOptions](https://wxt.dev/api/reference/wxt/interfaces/mainworldcontentscriptentrypointoptions) — interface definition and properties
- [WXT TypeScript Configuration](https://wxt.dev/guide/essentials/config/typescript) — tsconfig extension, path aliases
- [WXT Manifest Configuration](https://wxt.dev/guide/essentials/config/manifest) — host_permissions, web_accessible_resources
- [WXT Project Structure](https://wxt.dev/guide/essentials/project-structure) — entrypoints directory layout
- [WXT Unit Testing](https://wxt.dev/guide/essentials/unit-testing) — WxtVitest plugin, fake-browser storage
- [Chrome Storage API](https://developer.chrome.com/docs/extensions/reference/api/storage) — QUOTA_BYTES (102400), QUOTA_BYTES_PER_ITEM (8192), write rate limits
- CLAUDE.md — form field specification, NominalId values, bank description formats, VAT rule, ASP.NET checkbox pattern, ExpenseRule schema, DEFAULT_RULES

### Secondary (MEDIUM confidence)
- [npm: wxt@0.20.20](https://www.npmjs.com/package/wxt) — verified version and publish date (2026-03-17)
- [npm: @webext-core/fake-browser@1.3.4](https://www.npmjs.com/package/@webext-core/fake-browser) — verified version
- [npm: vitest@4.1.2](https://www.npmjs.com/package/vitest) — verified version
- [WXT Entrypoints](https://wxt.dev/guide/essentials/entrypoints.html) — defineBackground, defineUnlistedScript patterns
- [GitHub WXT Discussion #523](https://github.com/wxt-dev/wxt/discussions/523) — injectScript pattern for cross-browser (confirmed not needed here)

### Tertiary (LOW confidence)
- General WebSearch results on chrome.storage.sync best practices — confirmed against official Chrome docs

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions verified against npm registry
- Architecture: HIGH — WXT official docs confirm all patterns
- MAIN world access: HIGH — WXT interface documented; caveat (no extension API) verified
- Pitfalls: HIGH — derived from official quotas + CLAUDE.md portal-specific details
- VAT calculation: HIGH — formula taken directly from CLAUDE.md portal specification

**Research date:** 2026-04-03
**Valid until:** 2026-05-03 (WXT is actively maintained; check for 0.20.x patch releases)
