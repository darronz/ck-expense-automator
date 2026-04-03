# Project Research Summary

**Project:** CK Expense Automator — Chrome Extension
**Domain:** Chrome Manifest V3 browser extension — DOM automation, portal form submission, client-side rule engine
**Researched:** 2026-04-03
**Confidence:** HIGH

## Executive Summary

The CK Expense Automator is a purpose-built Chrome extension that automates monthly expense claim entry on the Churchill Knight accountancy portal. Expert practice for this type of targeted portal automation is clear: inject a Shadow DOM panel into the target page, read portal state via the page's own jQuery/DataTables API (using MAIN world injection), and submit expenses directly via `fetch()` POST using the authenticated session cookie — bypassing the multi-step form UI entirely. The WXT framework (v0.20.x) with TypeScript is the right build tool choice, providing Vite-based HMR and type-safe Chrome API wrappers without the maintenance risk of Plasmo or the boilerplate of a manual Manifest V3 setup.

The recommended approach is a 5-layer architecture: a rules storage module (chrome.storage.sync), a pure matching engine, a CK-specific API module, a Shadow DOM panel UI, and the extension scaffolding (popup, options page, service worker). Building in this dependency order is mandatory — nothing works until suspense items can be read from the DataTable, and the DataTable cannot be read without first solving the isolated world problem. The core value proposition — matching bank transactions to rules and submitting them with a single click — is achievable in a focused v1 build without requiring any server component or AI assistance.

The primary risk is technical, not product: Chrome's content script isolated world silently prevents access to the page's jQuery and DataTables instances. This must be solved in Phase 1 before any other work proceeds, or the entire feature set is blocked. Secondary risks are the ASP.NET form submission pattern (checkbox double-field requirement, 200 OK does not mean success) and Chrome storage quota constraints. All risks are well-understood and have documented solutions. Overall project risk is low given the detailed portal documentation available in CLAUDE.md.

## Key Findings

### Recommended Stack

The extension should be built with WXT 0.20.x as the build framework, TypeScript 5.x throughout, and vanilla TypeScript DOM construction for all UI (no React or Vue). WXT replaces manual Manifest V3 wiring, provides content script HMR, and includes built-in type-safe storage and messaging utilities. Plasmo is explicitly ruled out (maintenance mode, Parcel-based). CRXJS is a secondary option only if existing Vite config requirements preclude WXT. Chrome storage should use `chrome.storage.sync` (via WXT's storage module) for rules, ensuring cross-device sync — with rule statistics (matchCount, lastUsed) stored in `chrome.storage.local` to avoid hitting the 8KB-per-item sync quota.

**Core technologies:**
- Manifest V3: Extension platform — MV2 fully unsupported since June 2025; only path to Chrome Web Store
- TypeScript 5.x: Language — @types/chrome catches API typos and form field name mismatches before runtime
- WXT 0.20.x: Build framework — active maintenance (7.9k stars), Vite HMR, file-based entrypoints, built-in storage/messaging
- Shadow DOM (`attachShadow`): Panel isolation — prevents Bootstrap CSS from the CK portal bleeding into the injected panel and vice versa
- vanilla TypeScript DOM: Content script UI — no framework overhead; panel is simple enough that React adds 40-80KB with no benefit

### Expected Features

The full feature set is well-defined. MVP is achievable without deferring anything critical.

**Must have (table stakes):**
- Suspense item extraction from DataTable — the core mechanic; nothing else works without this
- Regex rule matching against bank descriptions — primary value proposition
- Injected floating panel with matched/unmatched items display — where the work happens
- Individual [Submit] and [Submit All] bulk submission via fetch() POST — the actual time-saver
- Submission result feedback (success/failure/retry) — trust and error handling
- Unmatched item inline form with "save as rule" checkbox — handles items rules don't cover
- VAT client-side validation (VAT <= 20% of net) — prevents wasted server round-trips on invalid data
- Session expiry detection — graceful failure, not silent breakage
- chrome.storage.sync rule persistence — rules survive browser restarts and sync across devices
- Options page: add/edit/delete/enable/disable rules with default rules pre-loaded
- Extension popup with current page status and item counts

**Should have (competitive differentiators):**
- Smart vendor extraction from bank descriptions (strips Starling prefix, parses ONLINE PAYMENT/DIRECT DEBIT/CARD SUBSCRIPTION patterns)
- Dry-run / preview mode — essential for trust-building, especially early users
- Rule usage statistics (matchCount, lastUsed) — helps users audit whether rules are firing
- "Test rule" feature in options — paste a bank description and verify which rule matches
- Import/export rules as JSON — backup and cross-device sharing
- Most-used categories floating to top of inline form dropdown

**Defer (v2+):**
- Badge notification for new suspense items (MV3 service worker polling is unreliable)
- Firefox port (validate Chrome demand first)
- Personal account expense flow (entirely different form workflow)
- AI/ML rule suggestions (supervised "save as rule" covers the need more reliably)
- Bulk CSV rule import (edge case not serving the typical solo freelancer)

### Architecture Approach

The extension follows a clean 4-context MV3 architecture: content script (injected into CK portal, handles all portal interaction and hosts the panel), extension pages (popup, options — full chrome API access), service worker (thin event handler for badge updates and install-time defaults only), and shared storage (chrome.storage.sync as the single source of truth for rules). The content script has its own in-memory state for the current session; all persistent state goes through rules-store.js. The `chrome.storage.onChanged` event propagates rule changes from the options page into the content script without a tab reload.

**Major components:**
1. `rules-store.js` — chrome.storage.sync CRUD wrapper; no dependencies; required by everything
2. `lib/expense-engine.js` — pure matching logic + VAT calculation + form payload builder; no DOM/Chrome API deps; testable in isolation
3. `lib/ck-api.js` — DataTable row reader (MAIN world) + fetch() POST submitter; all CK portal specifics isolated here
4. `ui/panel.*` (Shadow DOM) — floating overlay panel; renders engine results; handles user interactions
5. `content.js` — integration layer: waits for portal ready, wires ck-api + panel, listens for popup messages
6. `popup.*` — ephemeral status display; reads storage + sends messages to content script via tabs.sendMessage
7. `options.*` — full rule CRUD page; writes to storage (triggers onChanged in content script)
8. `background.js` — event-driven service worker; badge text + onInstalled defaults only; zero in-memory state

### Critical Pitfalls

1. **Content script isolated world blocks jQuery/DataTables access** — Use `world: "MAIN"` in the manifest content script declaration. This is a hard blocker; without it, `$` is undefined and zero suspense items are read. Must be resolved in Phase 1 before anything else.

2. **DataTable row iteration leaves the CK form in a dirty state** — Wrap the entire read loop in a try/finally block that unconditionally calls `dt.rows().deselect()` and clears `#MappedSuspenseItemIds`. A failed loop without cleanup means the user's next manual submission maps to wrong bank transactions.

3. **DataTable does not exist on page load without UI triggers** — Must programmatically set Payment Type to "Business account" and tick "Map to Suspense Items", fire change events, and wait for the table to appear via MutationObserver before any row iteration.

4. **ASP.NET checkbox double-field pattern** — Every checkbox field requires two appended values (e.g., `HasVatReceipt=true&HasVatReceipt=false`). Missing the pattern causes silent submission failures. Verify the extension's POST body against a captured real browser POST in DevTools before going live.

5. **HTTP 200 does not mean submission succeeded** — The CK portal returns 200 for both success and server-side validation failures. Parse the response body for ASP.NET validation error markers (`field-validation-error`, `validation-summary-errors`). Never treat a 200 response as unconditional success.

## Implications for Roadmap

Based on research, the dependency chain is rigid and dictates phase order. Build in this sequence or risk expensive rework.

### Phase 1: Foundation and MAIN World Injection
**Rationale:** The isolated world pitfall is a total blocker. If `world: "MAIN"` is not confirmed working before any other code is written, every subsequent phase will be built on a broken foundation. Service worker architecture must also be established with zero in-memory state from the start — retrofitting this later is high-cost.
**Delivers:** WXT project scaffold, TypeScript config, manifest.json with correct host permissions and MAIN world content script, verified `$('#DataTables_Table_1').DataTable()` execution on the CK portal, background.js with event-driven-only pattern established.
**Addresses:** Isolated world pitfall (P1), service worker state loss pitfall (P6)
**Avoids:** Building the entire feature set only to discover the DataTable API is inaccessible

### Phase 2: Storage Layer and Rule Engine
**Rationale:** rules-store.js and expense-engine.js have no DOM or Chrome API dependencies (beyond storage). Building them first means the core matching logic is testable in isolation before the portal interaction adds complexity. Storage quota handling and schema versioning must be established now — retrofitting migrations is painful.
**Delivers:** rules-store.js with CRUD + error handling + getBytesInUse quota check; expense-engine.js with regex matching + VAT calculation + form payload construction; default rules pre-loaded on install.
**Addresses:** chrome.storage.sync quota pitfall (P7), schema migration future-proofing
**Implements:** Storage-first state pattern

### Phase 3: Suspense Item Reading
**Rationale:** ck-api.js DataTable interaction is the second hard dependency. With the MAIN world foundation confirmed and the rule engine ready, this phase completes the read side of the loop. The try/finally cleanup pattern must be built here — not retrofitted after the loop is working.
**Delivers:** Programmatic Payment Type + Suspense Items checkbox triggering; MutationObserver-based DataTable readiness detection; full row iteration with try/finally cleanup; extracted `{ suspenseId, date, description, amount }` per item.
**Addresses:** DataTable dirty state pitfall (P2), DataTable trigger sequence pitfall (P3)
**Avoids:** Reading against a pre-populated DevTools session; must test on cold page loads

### Phase 4: Form Submission Core
**Rationale:** With items extracted and rules matched, the submission path is the next critical piece. The ASP.NET checkbox pattern and 200-OK response validation must be solved here before bulk submission is built on top. A single-item submission that correctly handles all edge cases is the required foundation for bulk.
**Delivers:** fetch() POST with `credentials: 'same-origin'`; correct ASP.NET checkbox double-field encoding; response body inspection for validation errors; VAT client-side validation; session expiry detection.
**Addresses:** ASP.NET checkbox pattern pitfall (P4), 200 OK false success pitfall (P5)
**Uses:** URLSearchParams payload construction from expense-engine.js

### Phase 5: Injected Panel UI
**Rationale:** With the data layer (read + write) fully working, the panel UI is a presentation layer built on solid foundations. Shadow DOM must be the first thing established — writing panel CSS without it means all styling work will need rework on the real portal.
**Delivers:** Shadow DOM host attached to CK page body; floating panel with matched/unmatched sections; individual [Submit] per row; [Submit All] bulk button with 400ms inter-request delay; progress indicator; success/error/retry states; loading state on init.
**Addresses:** CSS conflict pitfall (P8), z-index stacking context pitfall (P9), sequential flooding pitfall (P10)
**Implements:** All P1 features from FEATURES.md

### Phase 6: Unmatched Item Inline Form
**Rationale:** Unmatched items are a table stakes feature but depend on the panel being functional. Smart vendor extraction, "save as rule" flow, and the inline category/VAT form build naturally on top of the working panel.
**Delivers:** Inline expand form on unmatched items; smart vendor extraction from bank description patterns; category dropdown with most-used floating to top; VAT amount field with real-time max hint; "save as rule" checkbox (default checked) with auto-derived matchPattern; rule creation on submit.
**Addresses:** UX pitfall — requiring users to write regex manually; surfaces vendor extraction as a differentiator
**Implements:** Unmatched item flow, save-as-rule, smart vendor extraction (P1/P2 features)

### Phase 7: Extension Popup and Options Page
**Rationale:** The popup and options page are independent of the content script's data flow. Options page can be built concurrently with or after Phase 5/6. Popup depends on the content script message protocol being stable.
**Delivers:** Popup with page status (CK portal vs. other), matched/unmatched counts, link to options; Options page with full rule CRUD, enable/disable toggles, rule usage statistics, "test rule" feature, import/export JSON, getBytesInUse display, reset to defaults.
**Implements:** All options page and popup features; rule usage statistics; test rule; import/export

### Phase 8: Polish and Trust Features
**Rationale:** Dry-run mode, foreign currency display, and VAT divisibility hints are low-cost additions that significantly build user trust. Add after the core loop is validated.
**Delivers:** Dry-run / preview mode toggle; foreign currency display in matched item rows; VAT divisibility hint (1.2 pattern); claim context in panel header; "Reload Page" button after all submissions complete; plain-English error messages.
**Implements:** Remaining P2/P3 features from FEATURES.md

### Phase Ordering Rationale

- MAIN world injection (Phase 1) is a hard blocker — no other phase can proceed without verified DataTable API access
- Storage and rule engine (Phase 2) before portal interaction (Phase 3) because pure logic is testable without a portal session
- Single-item submission (Phase 4) before bulk submission and panel (Phase 5) because the panel's [Submit All] button is built on top of the verified single-item path
- Shadow DOM panel (Phase 5) before inline form (Phase 6) because the inline form is a component within the panel
- Options page (Phase 7) last because it depends on the rule storage API being stable and the content script message protocol being defined

### Research Flags

Phases needing deeper research or careful validation during planning:
- **Phase 3 (Suspense Item Reading):** The DataTable trigger sequence (Payment Type select, Suspense Items checkbox, MutationObserver wait) needs careful timing work. Recommend spiking this against the live portal as the first thing in this phase.
- **Phase 4 (Form Submission):** The exact POST body must be validated against a captured real browser submission before any automated submission is considered correct. Recommend capturing a real expense submission in DevTools Network tab as the first step.

Phases with well-documented patterns (can skip additional research):
- **Phase 1 (Foundation):** WXT setup, MAIN world injection, MV3 manifest — all thoroughly documented in official Chrome docs and WXT docs
- **Phase 2 (Storage/Engine):** chrome.storage.sync patterns, regex matching — standard TypeScript, no portal specifics
- **Phase 5 (Panel UI):** Shadow DOM injection pattern is well-established; panel layout is defined in CLAUDE.md
- **Phase 7 (Popup/Options):** Standard extension pages pattern; WXT handles entrypoints

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Chrome official docs + WXT official docs cross-verified; MV2 sunset confirmed; Plasmo maintenance status confirmed |
| Features | HIGH | Target portal documented in detail in CLAUDE.md; feature set derives directly from known form fields and workflow |
| Architecture | HIGH | Official Chrome extension documentation for all patterns; Shadow DOM isolation verified against real extension behaviour |
| Pitfalls | HIGH | All 10 pitfalls sourced from official Chrome docs or verified community reports; isolated world pitfall is the most critical and most reliably documented |

**Overall confidence:** HIGH

### Gaps to Address

- **CK portal category list completeness:** The 20 NominalId values in CLAUDE.md are described as "key ones" from a list of ~60. The full list of available expense categories is unknown. During Phase 2, capture the full list from the `GetAllCategories` AJAX endpoint on the real portal and add all values to the engine's category constants.
- **DataTable trigger timing:** The exact sequence for programmatically triggering the Payment Type dropdown and Suspense Items checkbox to reliably show the DataTable needs empirical validation on the live portal. MutationObserver timeout values are unknown. Spike this early in Phase 3.
- **Response validation pattern:** The exact HTML markers for ASP.NET validation errors in the CK portal's response need to be captured from a real failed submission. Deliberately submit a malformed expense in Phase 4 to capture and document the error response format.
- **Storage key structure:** STACK.md notes a tension between storing all rules under one key (risks 8KB limit) vs. one key per rule (simpler but 512 item limit). Given typical user rule counts (10-30 rules), storing as a single JSON array under one key is safe, but Phase 2 should add a getBytesInUse check with a warning at 60% capacity.

## Sources

### Primary (HIGH confidence)
- [Chrome Manifest V3 Official Docs](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3) — MV3 prohibitions, service worker constraints, isolated world behaviour
- [chrome.storage API Reference](https://developer.chrome.com/docs/extensions/reference/api/storage) — exact quota limits (102KB total, 8KB/item, 512 items)
- [Chrome Extensions: Content Scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts) — MAIN world injection, injection timing
- [Chrome Extensions: Message passing](https://developer.chrome.com/docs/extensions/develop/concepts/messaging) — cross-context communication
- [Chrome Extensions: Service worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle) — termination behaviour, state persistence
- [WXT Framework Comparison](https://wxt.dev/guide/resources/compare) — WXT v0.20.20 feature matrix vs Plasmo vs CRXJS
- [WXT Content Scripts Documentation](https://wxt.dev/guide/essentials/content-scripts) — file-based entrypoints, TypeScript integration
- CLAUDE.md — Churchill Knight portal form fields, AJAX endpoints, NominalId values, DataTable API, ASP.NET checkbox pattern, suspense item description formats

### Secondary (MEDIUM confidence)
- [The 2025 State of Browser Extension Frameworks](https://redreamality.com/blog/the-2025-state-of-browser-extension-frameworks-a-comparative-analysis-of-plasmo-wxt-and-crxjs/) — Plasmo maintenance status, WXT community health
- [Shadow DOM for Extension Style Isolation](https://sweets.chat/blog/article/isolating-styles-in-chrome-extensions-with-shadow-dom) — Shadow DOM injection pattern
- [How to Inject a Global with Web Extensions in MV3 (David Walsh)](https://davidwalsh.name/inject-global-mv3) — MAIN world injection technique
- [Taboola Engineering: Managing Concurrency in Chrome Extensions](https://www.taboola.com/engineering/managing-concurrency-in-chrome-extensions/) — sequential request queuing
- [GMass Blog: Timing Gmail Chrome Extension Content Script](https://www.gmass.co/blog/timing-gmail-chrome-extension-content-script/) — MutationObserver + injection timing
- [5 Best Autofill Chrome Extensions in 2026](https://blaze.today/blog/autofill-chrome-extensions/) — competitor feature baseline
- [CRXJS Unmaintained Discussion](https://github.com/crxjs/chrome-extension-tools/discussions/872) — CRXJS maintenance gap

### Tertiary (LOW confidence)
- [Why Chrome Extensions Get Rejected — Extension Radar](https://www.extensionradar.com/blog/chrome-extension-rejected) — Chrome Web Store rejection reasons (overly broad permissions, remote code) — LOW: single source
- [FillApp — AI Form Filling & Automation](https://fillapp.ai/) — preview/dry-run pattern reference — LOW: competitor product observation only

---
*Research completed: 2026-04-03*
*Ready for roadmap: yes*
