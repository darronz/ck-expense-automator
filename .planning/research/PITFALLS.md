# Pitfalls Research

**Domain:** Chrome Extension — Third-Party Portal Form Automation (ASP.NET MVC / jQuery DataTables)
**Researched:** 2026-04-03
**Confidence:** HIGH (verified against official Chrome Extensions docs and known MV3 constraints)

---

## Critical Pitfalls

### Pitfall 1: Content Script Isolated World Cannot Access Page jQuery or DataTables

**What goes wrong:**
Content scripts in Chrome extensions run in an "isolated world" — a private JavaScript execution context that shares the DOM with the host page but has no access to the page's JavaScript variables, functions, or libraries. Writing code like `$('#DataTables_Table_1').DataTable()` in the content script will throw `ReferenceError: $ is not defined` even though the CK portal has already loaded jQuery and DataTables. This is the single most likely cause of a complete feature failure in this project.

**Why it happens:**
Developers assume that since the DOM is shared, page scripts are also accessible. They are not. The content script's `window` is a completely different object than the page's `window`. The CK portal's `$` (jQuery) and `$.fn.dataTable` exist only in the page's world.

**How to avoid:**
Use `world: "MAIN"` injection to run code in the page's execution context. There are two approaches:

1. **Static manifest declaration (preferred for this project):** In `manifest.json`, declare the content script with `"world": "MAIN"`. This runs the script directly alongside page JS. Downside: no access to `chrome.*` APIs in that script file.
2. **Two-script approach:** Keep one script in ISOLATED world (has `chrome.*` access) and inject a second thin helper script with `world: "MAIN"` to bridge into the page's jQuery/DataTables. Communicate between them via `window.postMessage` or shared DOM attributes.

For this project, the DataTables interaction (`dt.page.len(-1).draw(false)`, `dt.row(idx).select()`, `$('#MappedSuspenseItemIds').val()`) all require the page's jQuery instance. The MAIN world approach is mandatory for those operations.

**Warning signs:**
- `ReferenceError: $ is not defined` in the browser console on the CK portal tab
- `$('#DataTables_Table_1').DataTable is not a function` errors
- The suspense items panel renders but shows zero items despite them being visible on the page

**Phase to address:**
Foundation phase (first working content script). Must be resolved before any DataTables interaction is attempted.

---

### Pitfall 2: DataTables Row Iteration Side-Effects Leave the Form in a Dirty State

**What goes wrong:**
The CK portal's suspense items DataTable uses the DataTables Select extension: selecting a row via `dt.row(idx).select()` populates the hidden field `#MappedSuspenseItemIds` and visually ticks the row's checkbox in the real form. If the reading loop is interrupted (exception, early exit), or if cleanup code (`dt.rows().deselect()` + `$('#MappedSuspenseItemIds').val('')`) is skipped, the page form is left in a modified state. The next natural form submission by the user would include phantom pre-selected suspense items, potentially submitting an expense against the wrong bank transaction.

**Why it happens:**
Developers write a reading loop, but don't treat state cleanup as critical path. An unhandled promise rejection or a DataTables API error mid-loop leaves the side effect in place.

**How to avoid:**
Wrap the entire read loop in a try/finally block. The finally block unconditionally deselects all rows and clears the hidden field:
```javascript
try {
  // iterate rows
} finally {
  dt.rows().deselect();
  $('#MappedSuspenseItemIds').val('');
  // reset Payment Type and checkboxes if they were changed
}
```
Do not read state at `document_start` — wait until the DataTable is fully initialised before touching it. Use a MutationObserver or a polling check against `$.fn.dataTable` availability before starting the read operation.

**Warning signs:**
- Suspense items showing as already-ticked on manual inspection after the extension panel loads
- `#MappedSuspenseItemIds` has a non-empty value when no rows should be selected
- Submission of an expense that maps to the wrong bank transaction (incorrect reconciliation)

**Phase to address:**
Suspense item reading phase. Must have the finally-cleanup pattern before any real data is read.

---

### Pitfall 3: Triggering the DataTable Before Required UI Interactions Fire

**What goes wrong:**
The CK "Add Items" form has a strict UI precondition: the suspense items DataTable (`#DataTables_Table_1`) only appears after the user selects "Business account" as the Payment Type AND ticks the "Map to Suspense Item(s)" checkbox. These two interactions trigger DOM mutations that load and render the DataTable. If the content script tries to read from `#DataTables_Table_1` on page load without first triggering this sequence, the table does not exist — the extension silently shows zero items.

**Why it happens:**
Developers inspect the fully-loaded page in DevTools (where the table is already visible because they've previously interacted with it) and assume it's always present on load.

**How to avoid:**
The content script must programmatically trigger both UI interactions before attempting to read the table:
1. Set `#ExpensePaymentTypeId` to value `2` (Business account) and fire a `change` event
2. Ensure the "Map to Suspense Items" checkbox is checked and fire a `change` event
3. Wait for the DataTable container to appear using a MutationObserver with a timeout
4. Only then iterate rows

Alternatively, test on a fresh page load with DevTools closed to verify the table loading sequence. Never assume the table is pre-populated.

**Warning signs:**
- `$('#DataTables_Table_1').length === 0` on page load
- Panel consistently shows "0 suspense items" on first load but shows items after manual interaction
- DataTables API not found error: `Cannot read properties of undefined (reading 'page')`

**Phase to address:**
Suspense item reading phase. Write the UI trigger sequence before the reading loop.

---

### Pitfall 4: ASP.NET Hidden Field Duplicate Pattern Breaks Submission

**What goes wrong:**
ASP.NET MVC's model binding requires checkboxes to always submit a value — even when unchecked. To achieve this, ASP.NET renders both a real checkbox input and a hidden input with the same name and value `false`. When the checkbox is checked, the request contains `FieldName=true&FieldName=false`; when unchecked, only `FieldName=false` is submitted. If the extension's `fetch()` POST only appends the logical value (e.g., `formData.append('HasVatReceipt', 'false')` once), the server-side model binder may behave unexpectedly — in some ASP.NET versions it treats a missing second value as a validation anomaly, or conversely treats a single `true` without the trailing `false` differently.

**Why it happens:**
Developers inspect a form submission in browser DevTools and see one value for unchecked fields, missing the subtlety that checked fields have two entries. They replicate only the value without the duplicate pattern.

**How to avoid:**
For every checkbox field, always append two values regardless of the checked state:
```javascript
// HasVatReceipt: checked
formData.append('HasVatReceipt', 'true');
formData.append('HasVatReceipt', 'false');

// HasVatReceipt: unchecked
formData.append('HasVatReceipt', 'false');
formData.append('HasVatReceipt', 'false');

// IsMappedToSuspenseItems: always mapped
formData.append('IsMappedToSuspenseItems', 'true');
formData.append('IsMappedToSuspenseItems', 'false');
```

Capture a real browser form submission using DevTools Network tab and compare the raw request body against the extension's constructed body byte-for-byte before going live.

**Warning signs:**
- Server returns HTTP 200 but the expense never appears in the claim
- Server returns a validation error mentioning the checkbox field
- Behaviour differs between submissions with VAT vs. without VAT

**Phase to address:**
Form submission core phase. Verify the exact POST body against a captured real request before any automated submission.

---

### Pitfall 5: Fetch POST Returning 200 Does Not Mean Submission Succeeded

**What goes wrong:**
The CK portal's `/ExpenseItems/Create` endpoint is an ASP.NET MVC action that returns HTTP 200 for both a successful submission (redirects internally, re-renders the page) AND for a validation failure (returns the form HTML with error messages embedded). Treating any non-network-error response as success will silently skip failed expenses.

**Why it happens:**
Standard REST API mental model: 200 = success, 4xx/5xx = failure. ASP.NET MVC server-side validation failures render the same page with errors, not a 4xx response code.

**How to avoid:**
After each `fetch()` POST, inspect the response body. Success indicators to check for:
- The response URL after following redirects (a redirect back to the same Create URL suggests re-render after validation failure vs. redirect to the listing page on success)
- Absence of known ASP.NET validation error patterns (e.g., `field-validation-error`, `validation-summary-errors` CSS classes in the returned HTML)
- Presence of a success redirect to the expense listing page

Implement a response parser that checks for server-side validation messages and surfaces them in the extension UI with the specific field that failed.

**Warning signs:**
- Submitted expenses not appearing in the CK portal expense list
- Extension panel shows "submitted successfully" but the claim count on the portal hasn't changed
- VAT validation failures being silently ignored

**Phase to address:**
Form submission core phase. Build response validation before building the bulk-submit feature.

---

### Pitfall 6: Service Worker State Loss Between Events (Background Script)

**What goes wrong:**
In Manifest V3, background scripts are service workers that terminate after approximately 30 seconds of inactivity. Any in-memory state (JavaScript variables, arrays, partial results, pending submission queues) is lost when the worker terminates. If the extension stores matched items or submission progress in a background script variable, that data vanishes silently. On the next event, the worker restarts with blank state.

**Why it happens:**
Developers familiar with MV2 persistent background pages expect global variables to survive between events. The MV3 service worker model is fundamentally different.

**How to avoid:**
For this project, the content script does all the heavy work and has its own persistent in-page execution context (it lives as long as the page tab is open). The service worker (background.js) should contain:
- No state beyond transient badge update logic
- No in-progress submission tracking
- Event listeners registered at the top level only (not inside async callbacks)

All state (matched items, submission progress, rules) belongs in the content script or `chrome.storage`. The service worker is a thin coordinator only.

Additionally, `setTimeout` and `setInterval` in the service worker will be cancelled on termination. Use `chrome.alarms` if any scheduled background work is needed.

**Warning signs:**
- Badge count resets unexpectedly
- Background-to-content messaging fails intermittently
- Features that work when DevTools is open (which keeps the service worker alive) but fail when DevTools is closed

**Phase to address:**
Initial architecture phase. Establish the rule that no state lives in the service worker before writing any background.js logic.

---

### Pitfall 7: chrome.storage.sync Quota Exceeded Silently Corrupts Rule Data

**What goes wrong:**
`chrome.storage.sync` has a 102,400 byte total quota, 8,192 bytes per item, and a maximum of 512 items. If rules grow large (many rules with long regex patterns, descriptions, match history), writes silently fail — `chrome.runtime.lastError` is set but only caught if the callback explicitly checks it. In promise-based code, an unhandled rejected promise drops the write silently. The user sees their rules disappear or fail to update with no error message.

**Why it happens:**
Developers test with 5-10 small rules and never hit the limit. Production users with 50+ rules or large match history data hit the per-item limit. The async write appears to succeed without visible error unless explicitly handled.

**How to avoid:**
- Store all rules as a single JSON array under one key (not one key per rule) — this maximises the 8KB-per-item limit efficiency
- Keep `matchCount` and `lastUsed` statistics in `chrome.storage.local` (5 MB limit, no sync) not in `chrome.storage.sync`
- Wrap all `storage.sync.set()` calls in explicit error handling: `try { await chrome.storage.sync.set(...) } catch (e) { showUserError('Rules save failed: ' + e.message) }`
- Use `chrome.storage.sync.getBytesInUse()` on the options page to display current usage
- Cap the rules array at a sensible limit (e.g., 200 rules) with a user-visible warning

**Warning signs:**
- Rules saved in the options page disappear after closing and reopening
- `chrome.runtime.lastError: QUOTA_BYTES_PER_ITEM quota exceeded` in the console
- Options page shows rules but the content script sees an older version

**Phase to address:**
Storage layer phase (rules-store.js). Add quota checking and error surfacing before the first beta release.

---

### Pitfall 8: Injected Panel CSS Conflicts with and Is Overridden by the Host Page

**What goes wrong:**
The CK portal loads its own Bootstrap-based CSS. When the extension injects panel HTML into the page DOM, the portal's CSS rules cascade onto the panel's elements. Bootstrap's `.btn`, `.form-control`, and general element resets (`* { box-sizing: border-box }`, `a { color: ... }`) alter the panel's appearance. Conversely, the panel's own CSS may accidentally override CK portal styles, breaking the portal's own form elements or DataTable layout.

**Why it happens:**
Extension developers style the panel in isolation during development and don't test against the actual host page's CSS. Specificity and cascade order are invisible until the panel is injected into the real portal.

**How to avoid:**
Use a Shadow DOM for the injected panel. Creating the panel as a Shadow Host with `element.attachShadow({ mode: 'open' })` encapsulates all panel CSS inside the shadow boundary. No host styles bleed in; no panel styles bleed out. This is the correct approach for Chrome extension injected UI.

If Shadow DOM is not used, prefix all panel CSS class names with a unique namespace (`ckea-panel`, `ckea-btn`, etc.) and use high-specificity selectors to resist cascade overrides.

**Warning signs:**
- Panel buttons look like CK portal buttons with unexpected Bootstrap styling
- Panel font sizes, colours, or spacing differ between test (standalone HTML) and production (injected)
- CK portal's DataTable or form stops functioning after the panel is injected

**Phase to address:**
UI panel phase. Shadow DOM must be established as the injection pattern before any panel CSS is written.

---

### Pitfall 9: Panel Z-Index Trapped by Host Page Stacking Contexts

**What goes wrong:**
The injected panel uses `position: fixed` and a high `z-index` (e.g., 9999) expecting to float above all page content. However, if the CK portal has any ancestor element with a CSS `transform`, `filter`, `opacity < 1`, or `will-change` property, that element creates a new stacking context. A `position: fixed` child of a transformed ancestor is positioned relative to that ancestor, not the viewport, and its z-index is scoped within that stacking context — effectively trapping the panel behind portal UI elements.

**Why it happens:**
`position: fixed` is assumed to always be viewport-relative. This is only true when no transformed ancestor exists. CSS transforms and similar properties create stacking contexts that change this behaviour.

**How to avoid:**
Attach the panel element directly to `document.body` as a direct child, not nested inside any portal element. This minimises the risk of being trapped in a sub-stacking context. Use `z-index: 2147483647` (max 32-bit integer) for maximum priority. Test by scrolling the CK portal and verifying the panel stays in the correct viewport position.

**Warning signs:**
- Panel appears in unexpected positions (top-left instead of bottom-right)
- Panel scrolls with the page instead of staying fixed
- Portal modal dialogs or dropdowns appear over the panel despite the panel having a higher z-index

**Phase to address:**
UI panel phase. Verify panel positioning on the actual CK portal, not on a blank test page.

---

### Pitfall 10: Sequential Bulk Submission Without Rate Limiting Triggers Server-Side Flooding

**What goes wrong:**
The extension submits all matched expenses sequentially via `fetch()`. With no delay between requests, submitting 15+ expenses sends 15 POST requests to the CK portal in rapid succession (potentially within 1-2 seconds). ASP.NET web applications commonly have server-side request rate limiting or connection pool limits. Too-rapid requests may result in HTTP 429 responses, connection resets, or garbled responses that are misinterpreted as success.

**Why it happens:**
Sequential async/await makes the code look like requests run one-by-one with appropriate pauses. In reality, `await fetch(...)` resolves as soon as the response arrives — with a fast local network to the portal, 15 requests can complete in under a second.

**How to avoid:**
Add a deliberate small delay (300-500ms) between consecutive submissions:
```javascript
for (const item of matchedItems) {
  await submitExpense(item);
  await new Promise(resolve => setTimeout(resolve, 400));
}
```
This is also better UX — users can see each item transition to "submitted" state individually rather than all at once.

**Warning signs:**
- Some expenses in a bulk submission fail with network errors despite good connectivity
- Server returns HTTP 503 or connection reset errors mid-batch
- Expenses appear in the portal but some are duplicated (retry after false failure)

**Phase to address:**
Bulk submission phase. Build the delay into the submission loop from the start.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hard-code all NominalId category values instead of fetching from the AJAX endpoint | No network round-trip needed per submission | If CK adds or changes categories, extension silently submits wrong category | Acceptable for v1 — note in code that these must be kept in sync |
| Store all extension state in content script closure variables | Simple code, no async storage reads | State lost on page refresh; user must reload panel | Never acceptable for rules; acceptable for transient submission progress |
| Use `document_idle` injection timing without a DataTable readiness check | Simpler setup | Race condition if DataTable loads after idle fires | Never acceptable |
| Single `rules` key in `chrome.storage.sync` with no version field | Simple reads/writes | Cannot migrate schema without destructive reset | Acceptable only if version field is added from day one |
| Skip error body inspection on `fetch()` POST responses | Simpler submission logic | Silent failures appear as successes to the user | Never acceptable |
| Inject panel as inline `<div>` without Shadow DOM | Faster initial development | CSS bleed-in from portal breaks panel appearance | Acceptable only for prototype/proof-of-concept, must be fixed before any real testing on portal |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| CK portal DataTables | Calling `$('#DataTables_Table_1').DataTable()` from isolated world content script | Inject into MAIN world so the page's jQuery instance is used |
| CK portal DataTables | Reading all rows without triggering Payment Type = Business account first | Programmatically set the payment type select and fire change event before table access |
| CK portal form POST | Treating HTTP 200 response as unconditional success | Parse response body for ASP.NET validation error markers |
| CK portal session | Not handling redirect-to-login response during bulk submit | Check `response.url` after fetch — if it redirected to `/Account/Login`, show session expired error and stop |
| ASP.NET checkbox fields | Appending only the logical checkbox value | Always append both `HasVatReceipt=<value>` and `HasVatReceipt=false` per ASP.NET convention |
| chrome.storage.sync writes | Fire-and-forget `storage.sync.set()` without await/catch | Always await and catch storage writes; surface errors to user |
| Panel Shadow DOM + Chrome extension CSP | Trying to load stylesheet via `<link href="chrome-extension://...">` inside Shadow DOM | Use `chrome.runtime.getURL()` to get extension-internal URLs; attach CSSStyleSheet via `adoptedStyleSheets` |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Reading DataTables row-by-row with select/deselect on every row | Visible flicker in the portal's DataTable during read; slow scan of 20+ items | Cache row data during a single `rows().every()` pass using DataTables row data API rather than re-selecting | With 20+ suspense items, noticeable DOM thrashing |
| Injecting large panel HTML as innerHTML string | Fine for small panels; becomes slow with complex rule lists | Use DocumentFragment or template element | With 50+ rules in the options page |
| Storing full match history per rule in chrome.storage.sync | Sync quota exceeded; write failures | Keep only `matchCount` (number) and `lastUsed` (ISO date string) in sync; move full history to `chrome.storage.local` | With 20+ rules used over many months |
| Re-reading all suspense items from the DataTable on every user interaction | Unnecessary DataTable iteration; risks form state side-effects | Read once on panel initialisation; cache in content script memory | On every panel re-render |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Storing user financial data (expense amounts, descriptions) in `chrome.storage.sync` long-term | Sync storage travels through Google's servers; financial data should not accumulate there | Only persist rule definitions (patterns, categories) — never store the portal's actual transaction data; it lives only in memory during a session |
| Injecting remotely-hosted JavaScript into the MAIN world | Chrome Web Store rejection; remote code execution risk | All scripts must be bundled with the extension; no dynamic script loading from CDNs or external URLs |
| Using `eval()` or `new Function()` anywhere in the extension | Violates Manifest V3 Content Security Policy; immediate store rejection | Never use eval; use standard DOM APIs and pre-built rule matching functions |
| Broad `host_permissions` with `<all_urls>` | Chrome Web Store rejection for over-broad permissions | Use specific host pattern: `https://portal.churchill-knight.co.uk/*` only |
| Logging raw bank transaction descriptions to `console.log` in production | Financial data visible in browser console to anyone with DevTools open | Strip or truncate sensitive data from production console output; use a debug flag |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Showing the panel immediately on page load before suspense items are read | User sees "0 items" flash before real data loads — erodes confidence | Show a loading state ("Scanning for suspense items...") until the DataTable read completes |
| Bulk submitting all items with no per-item confirmation option | Non-technical user accidentally submits wrong categorisation for all items; no way to undo | Default to single-item submit; make "Submit All" a secondary prominent action with a confirmation step |
| Requiring the user to manually enter regex patterns for rules | Non-technical users don't know regex syntax; extension remains unusable for the target audience | Auto-generate `matchPattern` from the vendor name they type; show the generated pattern and let them approve it |
| Silent success state — panel disappears after all items submitted | User cannot verify what was submitted | Transition to a "Submitted N expenses" summary with a reload button; keep the summary visible until user dismisses |
| Options page with no "test this rule against a sample description" feature | Users write rules blindly; discover mismatches only after incorrect submissions | Build the rule tester into the options page before encouraging users to write custom rules |
| Error messages showing raw HTTP status codes | "Error: 503" is meaningless to a non-technical user | Map known error states to plain English ("The CK portal is busy — try again in a moment") |

---

## "Looks Done But Isn't" Checklist

- [ ] **MAIN World injection:** Extension appears to work in DevTools console testing but fails on actual page because `$` is not defined in isolated world — verify `world: "MAIN"` is set in manifest or injection call
- [ ] **DataTable state cleanup:** Read loop appears to work but leaves rows selected — verify `dt.rows().deselect()` and `$('#MappedSuspenseItemIds').val('')` execute in finally block
- [ ] **Response validation:** Submissions return 200 and panel shows success — verify by checking portal page after bulk submit that all expenses actually appear in the claim
- [ ] **chrome.storage error handling:** Rules save without visible error — verify by running `getBytesInUse()` and intentionally exceeding quota in a test to confirm error is surfaced to user
- [ ] **Panel CSS isolation:** Panel looks correct on test HTML page — verify on actual CK portal page that Bootstrap styles do not bleed in
- [ ] **VAT validation:** Client-side validation accepts values — verify edge case where gross £10, VAT £2 is accepted but gross £10, VAT £2.01 is rejected with a clear message
- [ ] **Session expiry handling:** Bulk submit completes without error in active session — verify behaviour when session expires mid-batch (simulate by manually clearing cookies during submission)
- [ ] **Import/export JSON round-trip:** Export produces JSON — verify that importing that same JSON back produces exactly the same rule set (check for UUID preservation, date fields, enabled state)

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| MAIN world injection not implemented, DataTables inaccessible | MEDIUM | Refactor content script injection to use MAIN world; likely requires re-testing all DataTable interaction code |
| ASP.NET double-field pattern wrong, submissions silently fail | LOW | Update formData construction; verify against captured real request body; re-test all submission paths |
| chrome.storage.sync quota exceeded, rules lost | MEDIUM | Migrate stats to chrome.storage.local; rebuild lost rules from user's memory or rule export (if export was built); implement quota guard going forward |
| Panel CSS corrupted by host page styles | LOW–MEDIUM | Refactor panel to use Shadow DOM; all existing panel CSS must be scoped inside shadow boundary |
| Bulk submission floods server, some items fail | LOW | Add inter-request delay; implement retry logic for failed items |
| Service worker state dependency discovered mid-development | HIGH | Audit all background.js state; migrate to content script or chrome.storage; rewrite affected features |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Isolated world / no page jQuery access | Phase 1: Content script foundation | Verify `$('#DataTables_Table_1').DataTable()` executes without error from injected script |
| DataTable side-effects / dirty form state | Phase 2: Suspense item reading | Manually inspect form state after read loop; confirm MappedSuspenseItemIds is empty |
| Missing UI trigger before DataTable access | Phase 2: Suspense item reading | Test on fresh page load (not re-loaded), verify items appear correctly |
| ASP.NET checkbox double-field pattern | Phase 3: Form submission core | Compare extension POST body against captured real browser POST using DevTools |
| 200 OK ≠ success | Phase 3: Form submission core | Submit one item with deliberate VAT error; verify extension shows failure not success |
| Service worker state loss | Phase 1: Project architecture | Code review — verify no state variables in background.js before any feature is built |
| chrome.storage.sync quota | Phase 2: Storage layer (rules-store.js) | Test with 100 rules; confirm getBytesInUse; trigger quota error in test |
| Panel CSS conflicts | Phase 4: UI panel | Inject panel on actual CK portal; screenshot comparison with test page rendering |
| Z-index stacking context trap | Phase 4: UI panel | Verify panel position is fixed to viewport; test with CK portal modals open |
| Sequential submission flooding | Phase 5: Bulk submission | Submit 10+ items in bulk; monitor Network tab for errors; verify portal has all items |

---

## Sources

- [Chrome Extensions: Content Scripts (official)](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts) — isolated world behaviour, MAIN world injection, injection timing
- [Chrome Extensions: Manifest V3 What's New](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3) — service worker constraints, persistent background removal
- [Chrome Extensions: Migrate to Service Workers](https://developer.chrome.com/docs/extensions/develop/migrate/to-service-workers) — service worker termination, state persistence requirements
- [Chrome Extensions: chrome.storage API reference](https://developer.chrome.com/docs/extensions/reference/api/storage) — exact quota limits (102KB total, 8KB/item, 512 items, 120 writes/min)
- [Chromium Security: Extension Content Script Fetches](https://www.chromium.org/Home/chromium-security/extension-content-script-fetches/) — cross-origin fetch from content scripts
- [Chrome Developers Blog: The Top Layer (z-index)](https://developer.chrome.com/blog/what-is-the-top-layer) — stacking context and z-index behaviour
- [How to Inject a Global with Web Extensions in MV3 (David Walsh)](https://davidwalsh.name/inject-global-mv3) — MAIN world injection technique
- [GMass Blog: Timing Gmail Chrome Extension Content Script](https://www.gmass.co/blog/timing-gmail-chrome-extension-content-script/) — MutationObserver + injection timing patterns
- [Taboola Engineering: Managing Concurrency in Chrome Extensions](https://www.taboola.com/engineering/managing-concurrency-in-chrome-extensions/) — sequential request queuing, lock mechanisms
- [Why Chrome Extensions Get Rejected — Extension Radar](https://www.extensionradar.com/blog/chrome-extension-rejected) — Chrome Web Store rejection reasons (overly broad permissions, remote code)
- [MoldStud: Common Manifest File Issues](https://moldstud.com/articles/p-top-10-common-manifest-file-issues-in-chrome-extensions-how-to-fix-them-easily) — permission declaration errors, syntax issues

---
*Pitfalls research for: Chrome Extension — CK Portal Expense Automation*
*Researched: 2026-04-03*
