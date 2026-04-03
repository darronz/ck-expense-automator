# Roadmap: CK Expense Automator

## Overview

Build a Chrome extension (Manifest V3) that reads unmapped bank transactions from the Churchill Knight expense portal, matches them against user-defined rules, and submits them as categorised expenses in bulk or one at a time. The build proceeds in dependency order: foundation and data layer first (because the DataTable access problem must be solved before anything else), portal integration second (read and write to the CK portal), injected panel UI third (the user-facing interface built on the verified data layer), and extension pages last (popup and options, which depend on stable message protocols and storage APIs).

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation and Data Layer** - WXT scaffold, MAIN world injection, rule storage, and core matching engine
- [ ] **Phase 2: Portal Integration and Submission** - Suspense item reading from DataTable and expense submission via fetch() POST
- [ ] **Phase 3: Injected Panel UI** - Shadow DOM panel with matched/unmatched display, submit flows, and inline assignment form
- [ ] **Phase 4: Extension Pages and Polish** - Popup, options page with full rule management, dry-run mode, and trust features

## Phase Details

### Phase 1: Foundation and Data Layer
**Goal**: The extension is installed, loads on the CK portal in MAIN world, and can match bank descriptions to rules with correct VAT calculations
**Depends on**: Nothing (first phase)
**Requirements**: PORT-01, RULE-01, RULE-02, RULE-03, RULE-04, RULE-05, RULE-06, RULE-07, RULE-08
**Success Criteria** (what must be TRUE):
  1. Content script executes in MAIN world on the CK ExpenseItems page and can call `$('#DataTables_Table_1').DataTable()` without errors
  2. User-defined rules with regex pattern, category, vendor, description, and VAT settings persist in chrome.storage.sync across browser restarts
  3. Default example rules (Virgin Media, Supabase, LinkedIn, etc.) are pre-loaded on first install
  4. Expense engine correctly matches a bank description against enabled rules, calculates VAT amounts, and builds a complete form payload with all required fields
  5. VAT validation rejects a value exceeding 20% of net amount before any submission attempt
**Plans**: 2 plans

Plans:
- [ ] 01-01-PLAN.md — WXT scaffold, TypeScript config, vitest infrastructure, MAIN world content script, and manual PORT-01 verification checkpoint
- [ ] 01-02-PLAN.md — lib/types.ts interfaces, rules-store.ts (chrome.storage.sync CRUD + DEFAULT_RULES + onInstalled), expense-engine.ts (matchRule, validateVat, buildPayload), vendor-extractor.ts, full unit test coverage

### Phase 2: Portal Integration and Submission
**Goal**: The extension can read all suspense items from the CK DataTable and submit a single expense via fetch() POST with correct error detection
**Depends on**: Phase 1
**Requirements**: PORT-02, PORT-03, PORT-04, PORT-05, PORT-06
**Success Criteria** (what must be TRUE):
  1. Extension programmatically reveals the suspense items DataTable (sets Payment Type to "Business account", ticks "Map to Suspense Items") and reads all rows including paginated ones
  2. DataTable iteration always leaves the CK form in clean state (no selected rows, empty MappedSuspenseItemIds) even when an error occurs mid-loop
  3. A single expense POST with correct ASP.NET double-field checkbox encoding returns a detected success, not a false positive from an HTTP 200 with validation errors in the body
  4. Session expiry (redirect to login page) is detected and surfaced to the user as a clear message instead of a silent failure
**Plans**: TBD

Plans:
- [ ] 02-01: ck-api.js — Payment Type trigger, MutationObserver DataTable readiness, row iteration with try/finally cleanup, suspense item extraction
- [ ] 02-02: fetch() POST submission with ASP.NET checkbox encoding, response body validation error parsing, and session expiry detection

### Phase 3: Injected Panel UI
**Goal**: User can see all matched and unmatched suspense items in an injected panel and submit them individually or in bulk without leaving the CK portal page
**Depends on**: Phase 2
**Requirements**: PANEL-01, PANEL-02, PANEL-03, PANEL-04, PANEL-05, PANEL-06, PANEL-07, PANEL-08, UNMT-01, UNMT-02, UNMT-03, UNMT-04, UNMT-05
**Success Criteria** (what must be TRUE):
  1. A floating Shadow DOM panel appears on the CK ExpenseItems page showing matched items (date, amount, rule name, category, vendor, VAT summary) and unmatched items separately
  2. User can submit a single matched item via its [Submit] button and see it transition to a green success state; failed items show an error and [Retry] button
  3. User can submit all matched items in bulk via [Submit All] and see a progress indicator update as each item completes
  4. Unmatched items expand to an inline form with category dropdown, reason, vendor, VAT fields, and a "Save as rule" checkbox (default checked) that creates a rule with an editable match pattern on submit
  5. Dry-run mode toggle shows what would be submitted without actually posting to the CK endpoint
**Plans**: TBD

Plans:
- [ ] 03-01: Shadow DOM panel host, panel HTML/CSS structure, matched items section with per-row [Submit] and [Submit All], success/error/retry states, progress indicator
- [ ] 03-02: Unmatched items section with inline assignment form, smart vendor pre-fill, category dropdown with most-used sorting, VAT divisibility hint, "Save as rule" flow with editable pattern
- [ ] 03-03: Dry-run mode toggle, foreign currency display, claim context header, panel header with item counts, [Reload Page] button after all submissions

### Phase 4: Extension Pages and Polish
**Goal**: User can manage all rules from a dedicated options page, and the extension popup provides quick status when visiting the CK portal
**Depends on**: Phase 3
**Requirements**: EXT-01, EXT-02
**Success Criteria** (what must be TRUE):
  1. Extension popup shows whether the current tab is a CK ExpenseItems page, and if so displays the matched/unmatched item counts with a link to the options page
  2. Options page provides a full rule list with add, edit, delete, enable/disable controls, and a "Reset to defaults" button that restores the example rules
  3. Rules edited or deleted in the options page are reflected in the content script panel without requiring a tab reload
**Plans**: TBD

Plans:
- [ ] 04-01: Extension popup (page status, item counts, options link) and options page (rule CRUD, enable/disable, reset to defaults, rule usage statistics)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation and Data Layer | 1/2 | In Progress|  |
| 2. Portal Integration and Submission | 0/2 | Not started | - |
| 3. Injected Panel UI | 0/3 | Not started | - |
| 4. Extension Pages and Polish | 0/1 | Not started | - |
