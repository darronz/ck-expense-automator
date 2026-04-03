# Architecture Research

**Domain:** Chrome Extension (Manifest V3) — DOM automation + rule-based form submission
**Researched:** 2026-04-03
**Confidence:** HIGH (sourced from official Chrome developer documentation and verified patterns)

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                    EXTENSION PAGES (privileged)                  │
│                                                                  │
│  ┌──────────────┐   ┌──────────────────┐   ┌────────────────┐   │
│  │   popup.html │   │   options.html   │   │  background.js │   │
│  │   popup.js   │   │   options.js     │   │ (service worker│   │
│  │  (ephemeral) │   │  (full page UI)  │   │  event-driven) │   │
│  └──────┬───────┘   └────────┬─────────┘   └───────┬────────┘   │
│         │                   │                      │            │
│         └───────────────────┴──────────────────────┘            │
│                         chrome APIs                              │
│              (storage, tabs, runtime, scripting)                 │
├──────────────────────────────────────────────────────────────────┤
│                   SHARED STORAGE LAYER                           │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  chrome.storage.sync  (rules, config — syncs across devices│  │
│  │  100KB total / 8KB per item limit)                         │  │
│  └────────────────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────────────┤
│              CONTENT SCRIPT (isolated world on CK page)          │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  content.js  →  expense-engine.js  →  ck-api.js            │  │
│  │    reads DOM      matches rules       POSTs to portal       │  │
│  │                                                             │  │
│  │  ┌──────────────────────────────────────────────────────┐  │  │
│  │  │  Shadow DOM Panel (panel.js + panel.html + panel.css) │  │  │
│  │  │  floating overlay injected into CK page body         │  │  │
│  │  └──────────────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────────┘  │
│                      ↕ same-origin fetch()                       │
├──────────────────────────────────────────────────────────────────┤
│                  EXTERNAL (Churchill Knight portal)              │
│                                                                  │
│  ┌─────────────────────────┐   ┌───────────────────────────┐    │
│  │  ASP.NET MVC page       │   │  POST /ExpenseItems/Create │    │
│  │  jQuery + DataTables    │   │  (form submission target)  │    │
│  └─────────────────────────┘   └───────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Implementation |
|-----------|----------------|----------------|
| `manifest.json` | Declares permissions, content script injection rules, page action | Static JSON — Manifest V3 |
| `content.js` | Entry point: waits for CK page ready, initialises panel, orchestrates reading suspense items | Injected by manifest on matching URLs |
| `expense-engine.js` | Matches suspense items against rules, calculates VAT, builds form payloads | Pure logic module, imported by content.js |
| `ck-api.js` | Interacts with jQuery DataTable to read suspense IDs, submits via fetch POST | Wraps CK portal specifics |
| `rules-store.js` | CRUD wrapper around chrome.storage.sync for ExpenseRule objects | Shared by content script, popup, and options page |
| `panel.js` + `panel.html` + `panel.css` | Floating panel UI injected into CK page via Shadow DOM | Rendered inside a Shadow DOM host to prevent CSS bleed |
| `popup.html` + `popup.js` | Extension icon popup — shows status, item counts, links to options | Ephemeral; re-created on each open |
| `options.html` + `options.js` | Full rule management page — add/edit/delete/import/export rules | Persistent tab; full chrome API access |
| `background.js` | Optional service worker — badge updates, install-time defaults | Event-driven; wakes only when needed |

## Recommended Project Structure

```
ck-expense-automator/
├── manifest.json              # MV3 config, content_scripts, permissions
├── background.js              # Service worker (badge, onInstalled)
├── content.js                 # Content script entry point
├── popup.html                 # Popup shell
├── popup.js                   # Popup logic (reads storage, sends messages)
├── popup.css                  # Popup styles
├── options.html               # Options page shell
├── options.js                 # Rule management logic
├── options.css                # Options styles
├── lib/
│   ├── expense-engine.js      # Match logic + VAT calc + form payload builder
│   ├── ck-api.js              # DataTable reader + fetch POST submitter
│   └── rules-store.js         # chrome.storage.sync CRUD wrapper
├── ui/
│   ├── panel.js               # Panel component (Shadow DOM mount, event handling)
│   ├── panel.html             # Panel HTML template (loaded via fetch + getURL)
│   └── panel.css              # Panel styles (scoped inside Shadow DOM)
└── icons/
    ├── icon-16.png
    ├── icon-48.png
    └── icon-128.png
```

### Structure Rationale

- **`lib/`:** Pure logic modules with no DOM or Chrome API dependencies (except rules-store). This makes them testable in isolation and shareable between content script, popup, and options page.
- **`ui/`:** Panel UI files grouped together because they form a single deployable unit (the injected overlay). Keeping them separate from `lib/` enforces the boundary between UI and logic.
- **Flat root:** `popup.*` and `options.*` at root matches Chrome extension convention; bundlers and `web-accessible-resources` declarations expect predictable paths.

## Architectural Patterns

### Pattern 1: Shadow DOM Isolation for Injected Panel

**What:** Attach a Shadow DOM host to the CK page body. Mount all panel HTML inside the shadow root. Apply all panel CSS within the shadow root.

**When to use:** Always, when injecting any UI onto a third-party page. The CK portal uses Bootstrap/jQuery CSS globally. Without Shadow DOM, its styles bleed into the panel and vice versa.

**Trade-offs:** Prevents all CSS leakage in both directions. Shadow DOM `open` mode is easier to debug during development. The `all: initial;` CSS reset inside the shadow root ensures a clean baseline.

**Example:**
```javascript
// panel.js
const host = document.createElement('div');
host.id = 'ck-automator-host';
document.body.appendChild(host);

const shadow = host.attachShadow({ mode: 'open' });

// Load panel HTML via chrome.runtime.getURL
const panelUrl = chrome.runtime.getURL('ui/panel.html');
const html = await fetch(panelUrl).then(r => r.text());
shadow.innerHTML = html;

// Inject panel CSS inside shadow root
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = chrome.runtime.getURL('ui/panel.css');
shadow.appendChild(link);
```

### Pattern 2: Storage-First State (No Global Variables in Service Worker)

**What:** Never store state in module-level variables inside the service worker or content script. Always read from `chrome.storage.sync` when state is needed.

**When to use:** Required for all persistent data (rules, config). The service worker can terminate after 30 seconds of inactivity — any in-memory state is lost.

**Trade-offs:** Adds async reads on each operation but eliminates the class of bug where rules disappear after the worker restarts. Content scripts persist for the tab's lifetime, but synchronising with storage ensures popup and options page changes are reflected without a page reload.

**Example:**
```javascript
// rules-store.js
export async function getRules() {
  const { rules } = await chrome.storage.sync.get({ rules: [] });
  return rules;
}

export async function saveRule(rule) {
  const rules = await getRules();
  const existing = rules.findIndex(r => r.id === rule.id);
  if (existing >= 0) rules[existing] = rule;
  else rules.push(rule);
  await chrome.storage.sync.set({ rules });
}
```

### Pattern 3: Message Passing for Cross-Component Coordination

**What:** Use `chrome.runtime.sendMessage` (content script → background/popup) and `chrome.tabs.sendMessage` (popup → content script in active tab) for all cross-boundary communication.

**When to use:** Popup needs to ask content script for current item counts. Popup needs to tell content script to show/hide panel. Content script notifies background to update badge count.

**Trade-offs:** `runtime.sendMessage` cannot target a specific tab (broadcasts to extension pages). `tabs.sendMessage` requires knowing the tab ID (get from `chrome.tabs.query({ active: true, currentWindow: true })`). As of Chrome 146, rejected promises propagate correctly from `onMessage` handlers.

**Example:**
```javascript
// popup.js — ask content script for status
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
const status = await chrome.tabs.sendMessage(tab.id, { action: 'getStatus' });
// status = { matched: 5, unmatched: 1, submitted: 0 }
```

```javascript
// content.js — respond to popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getStatus') {
    sendResponse(currentStatus);
    return false; // synchronous response
  }
  if (request.action === 'togglePanel') {
    panel.toggle();
    return false;
  }
});
```

### Pattern 4: Direct fetch() POST (Skip UI Simulation)

**What:** Submit expenses by constructing the form payload programmatically and POSTing via `fetch()` with `credentials: 'same-origin'`. Do not simulate clicking the CK form fields.

**When to use:** The CK portal has no CSRF token. The session cookie is automatically included by the browser due to `credentials: 'same-origin'`. This approach avoids the fragile 8+ step UI interaction sequence.

**Trade-offs:** Bypasses the AJAX `GetAllCategories` call — acceptable because NominalId values are known static constants. Bypasses client-side validation on the CK form — requires replicating the VAT validation rule in the extension (`VAT <= 20% of net`).

## Data Flow

### Primary Flow: Read and Match Suspense Items

```
CK page loads (ExpenseItems/Create)
    ↓
content.js: wait for jQuery + DataTables ready
    ↓
ck-api.js: programmatically select "Business account"
         + tick "Map to Suspense Items"
         + wait for DataTable to render
    ↓
ck-api.js: iterate DataTable rows via DataTables API
         → extract { suspenseId, date, description, amount }
         → reset form state (deselect all)
    ↓
expense-engine.js: load rules from chrome.storage.sync
                 → test each description against rule.matchPattern (regex)
                 → compute VAT amounts
                 → produce { matched[], unmatched[] }
    ↓
panel.js: render matched items + unmatched items in Shadow DOM panel
```

### Secondary Flow: Submit a Matched Item

```
User clicks [Submit] or [Submit All]
    ↓
panel.js: validate VAT client-side (VAT <= 20% of net)
    ↓
ck-api.js: build URLSearchParams payload
         → POST fetch() to /ExpenseItems/Create?claimId=X
         → credentials: 'same-origin'
    ↓
On success (200): mark item as submitted (green check)
On failure (non-200 or redirect to login): show error + [Retry]
    ↓
After all items complete: show summary + [Reload Page] button
```

### Secondary Flow: Assign Unmatched Item

```
User clicks [Assign & Submit] on unmatched item
    ↓
panel.js: expand inline form (category dropdown, reason, vendor, VAT)
        → pre-fill vendor from description parsing
    ↓
User fills fields, optionally checks "Save as rule"
    ↓
panel.js → expense-engine.js: validate + build payload
    ↓
ck-api.js: POST fetch() (same as matched flow)
    ↓
If "Save as rule" checked:
  rules-store.js: create new ExpenseRule with derived matchPattern
                → chrome.storage.sync.set
```

### State Management

```
chrome.storage.sync
    ↓ (read on init + on storage.onChanged)
content.js (in-memory state for current session)
    ↓                      ↑
panel.js          rules-store.js (write on new rule creation)
  (UI renders           ↑
   from state)    options.js (full CRUD — writes trigger storage.onChanged)
                       ↑
                  popup.js (read-only status display)
```

The `chrome.storage.onChanged` listener in the content script allows the panel to reflect rule changes made in the options page without reloading the CK tab.

## Build Order (Phase Dependencies)

The components have clear dependency layers. Build in this order:

1. **`rules-store.js`** — no dependencies; required by everything else
2. **`lib/expense-engine.js`** — depends on rules-store; pure logic with no DOM
3. **`lib/ck-api.js`** — depends on expense-engine payloads; requires CK portal DOM
4. **`ui/panel.*`** — depends on expense-engine results; requires ck-api for submission
5. **`content.js`** — wires ck-api + panel together; the integration layer
6. **`popup.*`** — depends on storage and content script message protocol
7. **`options.*`** — depends on rules-store; independent of content script
8. **`background.js`** — depends on storage; optional badge/install defaults

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Churchill Knight portal | `fetch()` POST with `credentials: 'same-origin'` | No CSRF token needed; session cookie auto-attached |
| CK DataTables | jQuery DataTables API (`$('#DataTables_Table_1').DataTable()`) | Must wait for `$.fn.dataTable` to exist before calling |
| CK AJAX categories endpoint | NOT used — NominalId values are hardcoded | Avoids round-trip; static values are stable |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| popup.js ↔ content.js | `chrome.tabs.sendMessage` (popup → content); `chrome.runtime.sendMessage` (content → background for badge) | Popup must query active tab ID first |
| options.js ↔ content.js | `chrome.storage.onChanged` (storage change events) | No direct messaging needed; storage is the bus |
| content.js ↔ panel.js | Direct function calls (same JS context) | Panel is a module within the content script bundle, not a separate document |
| all components ↔ rules | `rules-store.js` API (async chrome.storage.sync wrapper) | Single source of truth; all reads go through this module |

## Anti-Patterns

### Anti-Pattern 1: Global Variables for State in Service Worker

**What people do:** Store matched items, submission progress, or session data in module-level variables in `background.js`.

**Why it's wrong:** The service worker terminates after 30 seconds of inactivity. All in-memory state is wiped. The next event triggers a fresh start with empty variables.

**Do this instead:** Store any state that must persist across service worker restarts in `chrome.storage.local`. Keep the service worker stateless — it should only react to events and read from storage.

### Anti-Pattern 2: Injecting Panel CSS Directly into the CK Page

**What people do:** Append a `<style>` or `<link>` tag to `document.head` for the panel's styles.

**Why it's wrong:** CK portal uses Bootstrap. The extension's CSS will conflict with Bootstrap's global selectors. Bootstrap's CSS will also affect the panel's layout unexpectedly. Results are inconsistent across portal updates.

**Do this instead:** Mount the panel inside a Shadow DOM. Inject the CSS link element inside the shadow root. Use `all: initial;` as the first rule in `panel.css` to reset inherited styles.

### Anti-Pattern 3: Simulating UI Clicks to Submit Expenses

**What people do:** Use `element.click()` to trigger the Payment Type dropdown, check boxes, and click the CK form's submit button.

**Why it's wrong:** Requires 8+ sequential steps with timing delays. Brittle — any CK portal UI update breaks it. Causes page reloads between items. DataTable state resets on each submission.

**Do this instead:** Build the form payload directly with URLSearchParams and submit via `fetch()`. The portal has no CSRF token; `credentials: 'same-origin'` is sufficient.

### Anti-Pattern 4: Registering Event Listeners Asynchronously in Service Worker

**What people do:**
```javascript
// WRONG
chrome.storage.sync.get('config').then(config => {
  chrome.runtime.onMessage.addListener(handler); // registered inside a promise
});
```

**Why it's wrong:** In MV3, the service worker re-initialises on each event. If a listener is registered inside an async callback, the service worker may receive the event before the listener registers — and miss it entirely.

**Do this instead:** Register all event listeners synchronously at the top level of `background.js`. Read config asynchronously only inside the listener handler.

### Anti-Pattern 5: Sending Messages to Content Script from Popup Without Checking Tab

**What people do:** Call `chrome.runtime.sendMessage()` from the popup expecting the content script to receive it.

**Why it's wrong:** `runtime.sendMessage` goes to extension pages (background, options) — not to content scripts. Content scripts in the active tab require `tabs.sendMessage`.

**Do this instead:** Always query the active tab first, then use `chrome.tabs.sendMessage(tab.id, message)`.

## Scaling Considerations

This extension has no server component and no multi-user concerns. Scaling is about storage limits and rule set size.

| Concern | Constraint | Mitigation |
|---------|------------|------------|
| Rule storage | 100KB total sync storage, 8KB per item | Each rule is ~300-500 bytes; 100 rules ≈ 40KB. Well within limits for typical users. |
| Sync quota | chrome.storage.sync throttled at ~1800 ops/min | Rule saves happen rarely (user-initiated). Not a concern. |
| Submission rate | Sequential fetch() calls — no parallelism | 10-20 items/month; 1-2 seconds per POST. Total < 1 minute. |
| DataTable iteration | Requires show-all rows before iteration | 20-50 suspense items max — `page.len(-1)` is safe at this scale. |

## Sources

- [Chrome Extensions — Manifest V3 overview](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3) — HIGH confidence
- [Chrome Extensions — Content Scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts) — HIGH confidence
- [Chrome Extensions — Message passing](https://developer.chrome.com/docs/extensions/develop/concepts/messaging) — HIGH confidence
- [Chrome Extensions — Service worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle) — HIGH confidence
- [Isolating Styles in Chrome Extensions with Shadow DOM](https://sweets.chat/blog/article/isolating-styles-in-chrome-extensions-with-shadow-dom) — MEDIUM confidence
- [Deep Dive into Chrome Extensions: Lifecycle to Dataflow](https://sriniously.xyz/blog/chrome-extension) — MEDIUM confidence
- [Chrome Extension MV3 Cheatsheet](https://gist.github.com/theluckystrike/7a05054b6b20cb309f8e1fca5a744caf) — MEDIUM confidence

---
*Architecture research for: Chrome Extension (MV3) — CK Expense Automator*
*Researched: 2026-04-03*
