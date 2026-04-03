# Phase 3: Injected Panel UI - Research

**Researched:** 2026-04-03
**Domain:** Chrome Extension Shadow DOM UI / WXT content script UI / Vanilla TypeScript panel
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Right sidebar overlay, fixed position (not draggable), 400px wide
- Minimize [−] and close [×] buttons in header
- Click on matched item row expands to show full details and [Edit] link to override fields
- Panel shows claim context (month/year) and item counts in header
- 400ms delay between bulk POST submissions to prevent server flooding
- Progress indicator: "Submitting 3/6..." text with progress bar during bulk submit
- After all submissions: show summary ("5 submitted, 1 failed") with [Reload Page] button
- Failed items show inline red error text with [Retry] button
- Successful items transition to green check, greyed out, "Submitted" label
- Category dropdown: native `<select>` element with most-used categories sorted to top
- "Save as rule" checkbox: checked by default
- Editable match pattern field: only shown when "Save as rule" is checked
- Form validation: on submit (not real-time) — validates VAT and required fields
- Vendor name pre-filled from smart vendor extraction (lib/vendor-extractor.ts)
- Category defaults to "Subscriptions" (NominalId 68)

### Claude's Discretion
- Shadow DOM styling approach (CSS-in-JS vs inline styles vs stylesheet)
- Panel animation/transitions
- Color scheme and typography (should be clean and readable, not match CK portal's dated design)
- Internal component structure and state management approach

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PANEL-01 | Shadow DOM floating panel injected on CK ExpenseItems pages, isolated from portal CSS | WXT `createShadowRootUi` with `position: 'overlay'` from a second isolated-world content script; `inheritStyles: false` (default) resets portal CSS leakage |
| PANEL-02 | Panel displays matched items with date, amount, rule name, category, vendor, and VAT summary | Pure DOM rendering from `MatchResult.matched` array; NominalId-to-label map needed |
| PANEL-03 | User can submit individual matched items via per-row [Submit] button | Calls `submitExpense()` from `lib/ck-api.ts`; button disabled during in-flight request |
| PANEL-04 | User can submit all matched items in bulk via [Submit All] button with progress indicator | Sequential loop with 400ms `setTimeout` delay; text counter + `<progress>` element |
| PANEL-05 | Submitted items show green success state; failed items show error with [Retry] button | Local per-item state object; update element classList/innerHTML on result |
| PANEL-06 | Panel shows claim context (month/year) and item counts (matched/unmatched) in header | claimId parsed from URL; month/year from SuspenseItem dates |
| PANEL-07 | Dry-run / preview mode toggle shows what would be submitted without actually submitting | Boolean flag checked before calling `submitExpense()`; UI toggle in panel header |
| PANEL-08 | Foreign currency amounts displayed alongside GBP amounts where present in bank descriptions | Parse "Rate: X.XXXX" and "$XX.XX" patterns from description; display as "(USD 25.00)" hint |
| UNMT-01 | Unmatched items show an inline assignment form with category dropdown, reason, vendor, and VAT fields | Expandable `<div>` toggled by [Assign & Submit] click; native `<select>` for categories |
| UNMT-02 | "Save as rule" checkbox (default checked) auto-creates a new rule from the manual submission | On submit: call `addRule()` from `lib/rules-store.ts` with generated rule |
| UNMT-03 | Auto-derived match pattern from vendor name is shown and editable before saving | `<input type="text">` pre-filled from `extractVendor()` output, lowercased and regex-escaped |
| UNMT-04 | Category dropdown shows most-used categories at the top | Sort NominalId list by `matchCount` from `getRuleStats()`; hardcode top-5 defaults for first run |
| UNMT-05 | VAT divisibility hint shown when gross amount is divisible by 1.2 | `Math.abs(amount / 1.2 - Math.round(amount / 1.2)) < 0.01` check; show hint text in form |
</phase_requirements>

---

## Summary

Phase 3 builds the visible face of the extension: a Shadow DOM floating panel injected into the CK portal. The core technical challenge is that the existing content script (`ck-portal.content.ts`) runs in `world: 'MAIN'` to access jQuery and DataTables — but WXT's `createShadowRootUi` requires a `ContentScriptContext`, which is only available in isolated-world scripts (because it internally calls `browser.runtime.getURL()` to load CSS). This means the phase requires **two content script entrypoints** on the same page: the existing MAIN world script for portal interaction, and a new isolated-world script for Shadow DOM UI and `browser.storage` access.

Communication between the two worlds uses custom DOM events on a shared script element (the WXT `injectScript` pattern). The isolated-world script mounts the panel, calls `browser.storage.sync` to load rules, receives suspense item data from the MAIN world via custom events, runs `matchExpenses()` and `buildPayload()` locally, then calls `submitExpense()` — which is a plain `fetch()` call and works identically in either world.

All UI is vanilla TypeScript + imported CSS injected into the shadow root via `cssInjectionMode: 'ui'`. No UI framework is needed or desired for an extension of this scale. State is managed with a simple plain object updated by event handlers, with targeted DOM mutations (no virtual DOM, no re-renders of unchanged rows).

**Primary recommendation:** Add a second entrypoint `entrypoints/ck-panel.content.ts` (isolated world, `cssInjectionMode: 'ui'`) that mounts the Shadow DOM panel. The existing MAIN world script's job expands to: read suspense items, then fire a custom event with the data; the panel script receives this event, does matching, and owns all UI.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| WXT | 0.20.20 (installed) | `createShadowRootUi` + content script lifecycle | Already in project; provides CSS injection, context management, and shadow root setup with one function call |
| TypeScript | 5.7 (installed) | Type-safe DOM manipulation | Already in project; panel state types needed |
| Vitest | 4.1.2 (installed) | Unit tests for pure panel logic | Already in project; `passWithNoTests` already configured |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none — no new deps needed) | — | — | All required functionality is in WXT + existing lib/ modules |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Vanilla DOM | React/Vue/Svelte in shadow root | Frameworks add 50-200KB; this panel has ~20 DOM nodes total — framework overhead not justified |
| Custom event bridge | `chrome.runtime.sendMessage` for cross-world comms | Runtime messaging is async and adds latency; custom events on the script element are synchronous and simpler for this use case |
| Inline CSS strings | Imported `.css` file with `cssInjectionMode: 'ui'` | WXT auto-injects imported CSS into the shadow root; inline strings are harder to maintain |

**Installation:** No new packages needed. All functionality is available via WXT 0.20.20, TypeScript 5.7, and existing lib/ modules.

---

## Architecture Patterns

### Recommended Project Structure

```
entrypoints/
├── ck-portal.content.ts    # EXISTING: world: 'MAIN' — jQuery/DataTables access
│                           # NEW: also fires 'ck:items-ready' custom event with SuspenseItem[]
├── ck-panel.content.ts     # NEW: world: 'ISOLATED' — Shadow DOM panel + storage access
│                           # cssInjectionMode: 'ui'
└── background.ts           # EXISTING: unchanged

ui/
├── panel.ts                # NEW: createPanel(container) — builds DOM tree, returns controller
├── panel.css               # NEW: imported by ck-panel.content.ts, injected into shadow root
└── matched-item.ts         # NEW (optional): renders a single matched item row
```

### Pattern 1: Two-Entrypoint World Split

**What:** MAIN world script handles all jQuery/DataTables interaction. Isolated world script owns all Shadow DOM UI and browser.storage access. They communicate via a custom event on a DOM element.

**When to use:** Whenever a Chrome extension needs both page-JS access (MAIN world) and extension API access (isolated world) simultaneously.

**The bridge pattern (verified from WXT official docs):**

MAIN world script fires the data event after reading suspense items:
```typescript
// entrypoints/ck-portal.content.ts (MAIN world — existing file, extended)
const items = await readSuspenseItems(claimId);
document.dispatchEvent(new CustomEvent('ck:items-ready', {
  detail: { claimId, items },
  bubbles: false,
}));
```

Isolated world panel script listens for the data:
```typescript
// entrypoints/ck-panel.content.ts (NEW — isolated world)
export default defineContentScript({
  matches: ['https://portal.churchill-knight.co.uk/ExpenseItems/*'],
  cssInjectionMode: 'ui',
  // world defaults to 'ISOLATED' — no need to specify

  async main(ctx) {
    const ui = await createShadowRootUi(ctx, {
      name: 'ck-expense-panel',
      position: 'overlay',
      anchor: 'body',
      alignment: 'top-right',
      zIndex: 999999,
      isolateEvents: ['keyup', 'keydown', 'keypress'],
      onMount(container, shadow, shadowHost) {
        // Apply fixed positioning to the shadow host (outside shadow root)
        shadowHost.style.cssText = 'position: fixed; top: 0; right: 0; width: 400px; height: 100vh; z-index: 999999; pointer-events: none;';
        createPanel(container, ctx);
        return container;
      },
    });
    ui.mount();

    // Listen for suspense items from the MAIN world script
    ctx.addEventListener(document, 'ck:items-ready', (event) => {
      if (event instanceof CustomEvent) {
        handleItemsReady(event.detail);
      }
    });
  },
});
```

**Source:** WXT official docs — https://wxt.dev/guide/essentials/content-scripts.html and verified from installed type definitions at `node_modules/wxt/dist/utils/content-script-ui/shadow-root.d.mts`

### Pattern 2: Shadow Root UI with Overlay Position

**What:** `createShadowRootUi` with `position: 'overlay'` attaches a 0x0 anchor point at the specified alignment, then the UI expands from there. The `shadowHost` element is the outer container whose styles are NOT isolated — use this for positioning. The `uiContainer` inside the shadow root IS isolated.

**Key detail from source inspection of `shadow-root.d.mts`:**
- `shadowHost` — the `HTMLElement` added to DOM; NOT inside shadow root; safe to apply `position: fixed` here
- `uiContainer` — the `HTMLElement` inside the shadow root where panel content goes
- `shadow` — the `ShadowRoot` itself

**Fixed sidebar approach:**
```typescript
onMount(container, shadow, shadowHost) {
  // shadowHost is outside shadow root — apply positioning here
  Object.assign(shadowHost.style, {
    position: 'fixed',
    top: '0',
    right: '0',
    width: '400px',
    height: '100vh',
    zIndex: '999999',
    pointerEvents: 'none',
  });
  // container (uiContainer) is inside shadow root — apply panel styles here
  container.style.pointerEvents = 'auto';
  // ... build panel DOM
}
```

**Source:** WXT 0.20.20 type definitions at `node_modules/wxt/dist/utils/content-script-ui/types.d.mts` and `shadow-root.d.mts`

### Pattern 3: Vanilla DOM State Management

**What:** A plain object holds panel state. Event handlers mutate state and call targeted DOM update functions. No virtual DOM diffing needed for ~20 nodes.

**When to use:** Small isolated UIs where state changes are discrete and predictable (submit button clicked, item succeeds/fails, form expanded/collapsed).

```typescript
// ui/panel.ts
interface PanelState {
  items: Array<{ item: SuspenseItem; rule: ExpenseRule | null }>;
  submitting: boolean;
  submittedCount: number;
  failedCount: number;
  dryRun: boolean;
  expandedItemId: string | null;
}

// Only update the specific row that changed — no full re-render
function markItemSuccess(state: PanelState, itemId: string): void {
  const row = document.getElementById(`ck-row-${itemId}`);
  if (row) {
    row.classList.add('ck-success');
    row.querySelector('.ck-submit-btn')?.remove();
    // ... update text
  }
}
```

### Pattern 4: CSS Isolation via Shadow Root

**What:** All panel styles live in `ui/panel.css`, imported at the top of `ck-panel.content.ts`. WXT's `cssInjectionMode: 'ui'` automatically injects this CSS into the shadow root. Portal styles do not leak in (`all: initial` reset applied by default in WXT 0.20.x).

**Key WXT behavior (verified from `shadow-root.d.mts`):**
- `inheritStyles: false` (default) — WXT adds `all: initial` before your CSS. `rem` units still work (relative to page `<html>` font-size). CSS custom properties defined outside can be accessed inside.
- `mode: 'open'` (default) — shadow root is inspectable in DevTools

**CSS reset implication:** Every element inside the shadow root starts from `all: initial`. You must explicitly set `display`, `box-sizing`, `font-family` etc. on your panel's root element. This is a feature (isolation) not a bug.

### Anti-Patterns to Avoid

- **Modifying portal DOM from the panel script:** The isolated world and MAIN world both access the same DOM, but only the MAIN world script should interact with the CK form elements. The panel script owns only its shadow root.
- **Calling `browser.storage` from the MAIN world script:** MAIN world scripts do not have extension API access. All storage reads/writes must stay in the isolated world `ck-panel.content.ts`.
- **Doing `submitExpense()` calls from MAIN world:** `submitExpense()` uses `fetch()` with `credentials: 'same-origin'` — this works identically in both worlds, but since the panel (isolated world) coordinates submissions, it should own these calls.
- **Using `position: 'modal'` for the panel:** Modal uses `position: fixed` centered in viewport, overlaying everything. The spec requires a right sidebar; use `position: 'overlay'` with manual `shadowHost` positioning instead.
- **Re-rendering the full panel on each state change:** With ~20 DOM nodes, targeted mutations (`element.textContent`, `classList.add/remove`) are cleaner and faster than destroying/rebuilding the panel.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Shadow root lifecycle / CSS injection | Manual `attachShadow()` + fetch CSS | `createShadowRootUi` from WXT | Handles CSS network fetch, `onInvalidated` cleanup, and cross-browser `attachShadow` wrapping |
| Content script invalidation handling | `try/catch` around all async ops | `ctx.onInvalidated()` + `ctx.setTimeout()` | Extension updates invalidate content scripts mid-execution; WXT context safely cancels pending timers and removes the UI |
| VAT calculation and validation | Re-implement in panel | `validateVat()` + `calculateVatFromPercentage()` from `lib/expense-engine.ts` | Already tested; re-implementing introduces divergence |
| Vendor name extraction | String parsing in panel | `extractVendor()` from `lib/vendor-extractor.ts` | Already tested with all four Starling patterns |
| Rule storage CRUD | `localStorage` or inline storage calls | `getRules()`, `addRule()` from `lib/rules-store.ts` | Already handles byte-count guards, sync storage semantics |
| Expense form payload | Building URLSearchParams manually | `buildPayload()` from `lib/expense-engine.ts` | ASP.NET double-field checkbox pattern already implemented and tested |
| HTTP submission | Re-implementing fetch | `submitExpense()` from `lib/ck-api.ts` | Session expiry detection, validation error parsing already tested |

**Key insight:** The previous two phases built all the logic expressly to be consumed by this phase. The panel's job is UI orchestration, not business logic.

---

## Common Pitfalls

### Pitfall 1: createShadowRootUi Called from MAIN World
**What goes wrong:** `createShadowRootUi` internally calls `browser.runtime.getURL()` to fetch the CSS file. In MAIN world, `browser` is undefined. The call throws with "browser is not defined" or silently fails to load styles.
**Why it happens:** The MAIN world script shares the page's JS context, not the extension's.
**How to avoid:** `createShadowRootUi` must only be called from the isolated-world `ck-panel.content.ts`. The existing `ck-portal.content.ts` stays MAIN world and never imports from `wxt/utils/content-script-ui/shadow-root`.
**Warning signs:** TypeError: Cannot read properties of undefined (reading 'runtime') at extension startup.

### Pitfall 2: CSS All-Initial Reset Breaks Panel Layout
**What goes wrong:** `all: initial` resets `display` on divs to `inline`, making the panel layout collapse.
**Why it happens:** WXT 0.20.x applies `all: initial` as the first rule inside the shadow root (when `inheritStyles: false`, which is the default).
**How to avoid:** In `panel.css`, the first rule should explicitly set `display`, `box-sizing`, `font-family` on the panel root element: `.ck-panel { display: flex; flex-direction: column; box-sizing: border-box; font-family: system-ui, sans-serif; ... }`. Do not assume any CSS defaults.
**Warning signs:** Panel renders as a collapsed zero-height element, or all children are inline.

### Pitfall 3: `browser.storage` Unavailable for Rule CRUD at Submit Time
**What goes wrong:** When the user clicks [Submit] with "Save as rule" checked, `addRule()` is called but fails because it uses `browser.storage.sync` — which is only accessible in isolated world.
**Why it happens:** If any submission logic accidentally runs in the MAIN world script, the storage call fails.
**How to avoid:** All submission orchestration, rule saving, and storage reads must live in `ck-panel.content.ts` (isolated world). The MAIN world script's only job is to read suspense items and fire the `ck:items-ready` event.
**Warning signs:** Silent failure where rules appear to save but don't persist; "browser is not defined" errors.

### Pitfall 4: Custom Event Race Condition
**What goes wrong:** The isolated-world panel script fires before the MAIN world script dispatches `ck:items-ready`, causing the event listener to miss the data.
**Why it happens:** Both scripts run at `document_idle`, but execution order is not guaranteed between worlds.
**How to avoid:** Use a "late subscriber" pattern — when the panel registers its listener, also check if the data was already dispatched by reading a DOM attribute or a `window.__ckItemsReady` flag set by the MAIN script. Or: have the MAIN script fire the event after a short delay, and have the panel retry listening with a timeout. Simplest approach: MAIN world sets `window.__ckExpenseData` on the `window` object (accessible from both worlds via shared DOM) and fires the event; panel checks `window.__ckExpenseData` on mount before registering the event listener.
**Warning signs:** Panel mounts but shows "Loading..." forever; no items displayed.

### Pitfall 5: Shadow Host z-index Conflicts with CK Portal Overlays
**What goes wrong:** The CK portal's jQuery UI dialogs or DataTables dropdowns render at high z-index values and appear over the panel.
**Why it happens:** The CK portal uses jQuery UI which typically uses z-index values of 1000-1100 for modals.
**How to avoid:** Set `zIndex: 999999` on the shadow host. The WXT API exposes `zIndex` as an option for overlay position type. Also set it on the `shadowHost` directly in `onMount` as a belt-and-suspenders measure.
**Warning signs:** Panel is hidden behind portal dropdowns or date pickers.

### Pitfall 6: Inline Form VAT Validation Feedback
**What goes wrong:** User enters VAT amount exceeding 20% of net; submits; server rejects with 422; error is shown but user doesn't understand why.
**Why it happens:** The CONTEXT.md specifies form validation on submit (not real-time), but the VAT constraint is non-obvious.
**How to avoid:** On submit validation, use `validateVat()` to check client-side and show a specific error: "VAT £X.XX exceeds maximum £Y.YY (20% of net £Z.ZZ)". The `validateVat()` function already formats this message.
**Warning signs:** Repeated failed submissions from users who don't understand the CK portal's VAT rule.

### Pitfall 7: Category Dropdown "Most Used" Sorting on First Run
**What goes wrong:** `getRuleStats()` returns empty stats on first install. The "most used" sort has no data to sort by.
**Why it happens:** `recordRuleUsage()` only writes stats after a rule has been used at least once.
**How to avoid:** Hardcode a "frequent defaults" list for the first few categories: Subscriptions (68), Telephone (48), Travel (52), Insurance (62), Computer equipment (114). Display these at the top before any usage data exists. After usage data accumulates, sort by `matchCount` descending.
**Warning signs:** On fresh install, category dropdown shows alphabetical order with no familiar categories near the top.

---

## Code Examples

Verified patterns from official sources and installed WXT type definitions:

### Shadow Root UI Entrypoint (Isolated World)
```typescript
// entrypoints/ck-panel.content.ts
// Source: WXT 0.20.20 type definitions (node_modules/wxt/dist/utils/content-script-ui/shadow-root.d.mts)
import './ui/panel.css';

export default defineContentScript({
  matches: ['https://portal.churchill-knight.co.uk/ExpenseItems/*'],
  cssInjectionMode: 'ui',
  // world defaults to 'ISOLATED' — correct for storage access

  async main(ctx) {
    const ui = await createShadowRootUi(ctx, {
      name: 'ck-expense-panel',
      position: 'overlay',
      anchor: 'body',
      alignment: 'top-right',
      zIndex: 999999,
      isolateEvents: ['keyup', 'keydown', 'keypress'],
      onMount(container, shadow, shadowHost) {
        // Position the shadow host as a fixed right sidebar
        Object.assign(shadowHost.style, {
          position: 'fixed',
          top: '0',
          right: '0',
          width: '400px',
          height: '100vh',
          zIndex: '999999',
          pointerEvents: 'none',
        });
        container.style.pointerEvents = 'auto';
        createPanel(container, ctx);
      },
    });
    ui.mount();
  },
});
```

### Custom Event Bridge from MAIN World
```typescript
// In entrypoints/ck-portal.content.ts (MAIN world) — addition to existing file
// After readSuspenseItems() completes:
const items = await readSuspenseItems(claimId);
// Store on window for late-subscribing isolated world script
(window as any).__ckExpenseData = { claimId, items };
document.dispatchEvent(new CustomEvent('ck:items-ready', {
  detail: { claimId, items },
  bubbles: false,
}));
```

### Receiving Data in Isolated World Panel
```typescript
// In entrypoints/ck-panel.content.ts main() — after ui.mount()
// Check for data already dispatched before we registered the listener
const existingData = (window as any).__ckExpenseData;
if (existingData) {
  handleItemsReady(existingData);
} else {
  ctx.addEventListener(document, 'ck:items-ready' as any, (event: Event) => {
    if (event instanceof CustomEvent) handleItemsReady(event.detail);
  });
}
```

### VAT Divisibility Hint (UNMT-05)
```typescript
// Source: Logic derived from CLAUDE.md spec
function isLikelyVatInclusive(amount: number): boolean {
  // Amount is divisible by 1.2 if amount / 1.2 is very close to an integer
  const divided = amount / 1.2;
  return Math.abs(divided - Math.round(divided)) < 0.01;
}
// Usage in inline form render:
// if (isLikelyVatInclusive(item.amount)) show hint "This amount may include 20% VAT (£X.XX)"
```

### Bulk Submit with 400ms Delay
```typescript
// Source: CONTEXT.md locked decision — 400ms between submissions
async function submitAll(
  matchedItems: Array<{ item: SuspenseItem; rule: ExpenseRule }>,
  claimId: string,
  dryRun: boolean,
  onProgress: (done: number, total: number) => void,
  onItemResult: (itemId: string, result: SubmissionResult) => void,
): Promise<void> {
  for (let i = 0; i < matchedItems.length; i++) {
    const { item, rule } = matchedItems[i];
    if (!dryRun) {
      const payload = buildPayload({ /* ... */ });
      const result = await submitExpense(claimId, payload);
      onItemResult(item.id, result);
    }
    onProgress(i + 1, matchedItems.length);
    if (i < matchedItems.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 400));
    }
  }
}
```

### Foreign Currency Extraction (PANEL-08)
```typescript
// Source: CLAUDE.md description format examples
function extractForeignCurrency(description: string): string | null {
  // Matches: "$25.00, Rate: 1.3390" or "EUR 45.00, Rate: 0.8500"
  const match = description.match(/\$[\d.]+|[A-Z]{3}\s+[\d.]+/);
  return match ? match[0] : null;
}
```

### NominalId Category Map
```typescript
// Source: CLAUDE.md NominalId table — use this in the dropdown
const CATEGORIES: Array<{ id: string; label: string }> = [
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
// Default "most used" order for first run (before usage stats exist):
const DEFAULT_TOP_CATEGORIES = ['68', '48', '52', '62', '114'];
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual `attachShadow()` + CSS fetch | `createShadowRootUi()` from WXT | WXT 0.18+ | Eliminates CSS injection boilerplate and lifecycle management |
| `world: 'MAIN'` for all content script code | Split: MAIN for page JS, ISOLATED for extension APIs | Chrome MV3 | MAIN world lacks extension APIs; isolation is required for `browser.storage` |
| `chrome.runtime.sendMessage` for cross-world comms | Custom DOM events on document | Always available | Lower latency, simpler for same-page communication |
| Background script for UI orchestration | Content script owns UI directly | MV3 service worker model | Service workers can't directly manipulate page DOM; content scripts are the right layer |

**Deprecated/outdated:**
- Background page (MV2): replaced by service worker in MV3; this project correctly uses `background.ts` as a service worker
- `manifest_version: 2`: not used; project is MV3 from the start

---

## Open Questions

1. **Exact timing of MAIN world `ck:items-ready` event relative to isolated world panel mount**
   - What we know: Both scripts run at `document_idle`; MAIN world reads suspense items asynchronously (up to 5 seconds for DataTable MutationObserver)
   - What's unclear: Whether the isolated-world panel always registers its event listener before the MAIN world fires the event
   - Recommendation: Implement the `window.__ckExpenseData` fallback pattern (store data on window object before firing event; panel checks for it on mount). This safely handles both orderings.

2. **CK portal z-index values for modals and dropdowns**
   - What we know: jQuery UI typically uses z-index 1000-1100 for dialogs; DataTables dropdowns vary
   - What's unclear: The exact z-index stack of the CK portal without live inspection
   - Recommendation: Use `zIndex: 999999` on the shadow host as a safe maximum; test on the live portal and lower if needed.

3. **Rule stats access for category sorting (UNMT-04)**
   - What we know: `recordRuleUsage()` writes stats keyed by rule ID; `getRuleStats()` is not yet exported from `rules-store.ts`
   - What's unclear: Whether the existing stats data structure is sufficient for "most used category" sorting, or whether a per-NominalId usage count is needed
   - Recommendation: During implementation, either add a `getCategoryUsageCounts()` function to `rules-store.ts`, or compute category frequency from rule stats at panel load time (count how many rules with each NominalId have been used, weighted by matchCount).

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.2 |
| Config file | `vitest.config.ts` (root, uses `WxtVitest()` plugin) |
| Quick run command | `npm test -- --reporter=dot` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PANEL-01 | Shadow DOM panel injects on CK page | manual-only | — inspect DevTools | N/A — DOM injection untestable in jsdom |
| PANEL-02 | Panel renders matched items correctly | unit | `npm test -- tests/panel.test.ts` | Wave 0 |
| PANEL-03 | Per-row submit calls submitExpense once | unit | `npm test -- tests/panel.test.ts` | Wave 0 |
| PANEL-04 | Bulk submit fires with 400ms delay | unit | `npm test -- tests/panel.test.ts` | Wave 0 |
| PANEL-05 | Success/failure states update correctly | unit | `npm test -- tests/panel.test.ts` | Wave 0 |
| PANEL-06 | Header shows correct claim context and counts | unit | `npm test -- tests/panel.test.ts` | Wave 0 |
| PANEL-07 | Dry-run skips submitExpense calls | unit | `npm test -- tests/panel.test.ts` | Wave 0 |
| PANEL-08 | Foreign currency parsed from description | unit | `npm test -- tests/panel-utils.test.ts` | Wave 0 |
| UNMT-01 | Inline form expands for unmatched items | manual-only | — inspect DOM in DevTools | N/A — Shadow DOM expansion untestable in jsdom |
| UNMT-02 | Save-as-rule calls addRule with correct fields | unit | `npm test -- tests/panel.test.ts` | Wave 0 |
| UNMT-03 | Auto-derived match pattern shown in editable input | unit | `npm test -- tests/panel-utils.test.ts` | Wave 0 |
| UNMT-04 | Most-used categories appear first in dropdown | unit | `npm test -- tests/panel-utils.test.ts` | Wave 0 |
| UNMT-05 | VAT hint shown when amount divisible by 1.2 | unit | `npm test -- tests/panel-utils.test.ts` | Wave 0 |

**Note on manual-only items:** PANEL-01 and UNMT-01 require live browser interaction (Shadow DOM attachment and dynamic CSS). The underlying utility functions they depend on (createShadowRootUi, DOM expansion toggle) are WXT/browser APIs; testing the utility functions is done by testing the panel logic functions they call.

### Sampling Rate
- **Per task commit:** `npm test` (full suite, < 5 seconds)
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/panel.test.ts` — covers PANEL-02 through PANEL-07, UNMT-02
- [ ] `tests/panel-utils.test.ts` — covers PANEL-08, UNMT-03, UNMT-04, UNMT-05 (pure utility functions)
- [ ] `ui/panel.ts` — main panel module (does not exist yet)
- [ ] `ui/panel.css` — panel stylesheet (does not exist yet)

---

## Sources

### Primary (HIGH confidence)
- WXT 0.20.20 installed type definitions — `node_modules/wxt/dist/utils/content-script-ui/shadow-root.d.mts` (complete `ShadowRootContentScriptUiOptions` interface, all options verified)
- WXT 0.20.20 installed type definitions — `node_modules/wxt/dist/utils/content-script-ui/types.d.mts` (ContentScriptOverlayAlignment, zIndex, autoMount API)
- WXT 0.20.20 installed type definitions — `node_modules/wxt/dist/utils/content-script-context.d.mts` (ContentScriptContext, onInvalidated, setTimeout wrappers)
- WXT 0.20.20 installed type definitions — `node_modules/wxt/dist/utils/inject-script.d.mts` (injectScript, modifyScript, script element return)
- WXT 0.20.20 installed type definitions — `node_modules/wxt/dist/types.d.mts` (IsolatedWorldContentScriptDefinition, MainWorldContentScriptDefinition, cssInjectionMode options)
- Existing `lib/types.ts` — SuspenseItem, MatchResult, SubmissionResult interfaces (current project)
- Existing `lib/expense-engine.ts` — matchExpenses, buildPayload, validateVat, calculateVatFromPercentage (current project)
- Existing `lib/vendor-extractor.ts` — extractVendor (current project)
- Existing `lib/rules-store.ts` — getRules, addRule, recordRuleUsage (current project)
- Existing `lib/ck-api.ts` — submitExpense (current project)
- CLAUDE.md NominalId table — all category IDs and labels verified from project specification

### Secondary (MEDIUM confidence)
- WXT official docs https://wxt.dev/guide/essentials/content-scripts.html — createShadowRootUi usage pattern with cssInjectionMode: 'ui'
- WXT official docs https://wxt.dev/guide/key-concepts/content-script-ui.html — overlay position and alignment options
- WXT API reference https://wxt.dev/api/reference/wxt/utils/content-script-ui/shadow-root/functions/createshadowrootui — async function signature and ContentScriptContext requirement
- Chrome for Developers https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts — isolated world has access to chrome.storage; MAIN world does not have extension APIs

### Tertiary (LOW confidence)
- WebSearch results on WXT custom event cross-world pattern — consistent with installed type definitions but not from a single canonical doc URL

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — WXT installed version verified; no new dependencies needed
- Architecture: HIGH — Verified directly from installed type definitions; MAIN/isolated world split confirmed necessary from source code analysis of `shadow-root.ts` (it calls `browser.runtime.getURL`)
- Pitfalls: HIGH for CSS reset and MAIN world API access (verified from types); MEDIUM for z-index values (requires live portal testing)
- State management approach: HIGH — simple object mutation with targeted DOM updates is well-established for small isolated UIs

**Research date:** 2026-04-03
**Valid until:** 2026-05-03 (WXT 0.20.x is stable; Chrome extension APIs are stable)
