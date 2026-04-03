# Requirements: CK Expense Automator

**Defined:** 2026-04-03
**Core Value:** Recurring monthly expenses that always match the same vendor, category, and VAT treatment can be submitted in a single click instead of 8+ form interactions each.

## v1 Requirements

### Portal Integration

- [x] **PORT-01**: Content script injects via MAIN world and can access the page's jQuery and DataTables instances
- [x] **PORT-02**: Extension programmatically sets Payment Type to "Business account" and ticks "Map to Suspense Items" to reveal the DataTable
- [x] **PORT-03**: Extension reads all suspense items from the DataTable (ID, date, description, amount) with try/finally cleanup
- [x] **PORT-04**: Extension submits expenses via fetch() POST with correct ASP.NET form encoding (including checkbox double-field pattern)
- [x] **PORT-05**: Extension parses response body for ASP.NET validation errors (not just HTTP status)
- [x] **PORT-06**: Extension detects session expiry (redirect to login page) and notifies user gracefully

### Rule Engine

- [x] **RULE-01**: User can define expense rules with regex pattern, category (NominalId), vendor, description, and VAT settings
- [x] **RULE-02**: Rules are stored in chrome.storage.sync and persist across sessions and devices
- [x] **RULE-03**: Default example rules are pre-loaded on extension install
- [x] **RULE-04**: Expense engine matches bank descriptions against enabled rules using regex (case-insensitive by default)
- [x] **RULE-05**: VAT is validated client-side before submission (VAT > 0 and ≤ 20% of net amount)
- [x] **RULE-06**: Expense engine constructs complete form payload with all required fields (Id, ExpenseClaimId, dates, NominalId, etc.)
- [x] **RULE-07**: Smart vendor extraction parses bank descriptions to identify vendor name from ONLINE PAYMENT, DIRECT DEBIT, CARD SUBSCRIPTION, and APPLE PAY patterns
- [x] **RULE-08**: Rule usage statistics (matchCount, lastUsed) are tracked in chrome.storage.local

### Injected Panel

- [ ] **PANEL-01**: Shadow DOM floating panel is injected on CK ExpenseItems pages, isolated from portal CSS
- [ ] **PANEL-02**: Panel displays matched items with date, amount, rule name, category, vendor, and VAT summary
- [ ] **PANEL-03**: User can submit individual matched items via per-row [Submit] button
- [ ] **PANEL-04**: User can submit all matched items in bulk via [Submit All] button with progress indicator
- [ ] **PANEL-05**: Submitted items show green success state; failed items show error with [Retry] button
- [ ] **PANEL-06**: Panel shows claim context (month/year) and item counts (matched/unmatched) in header
- [ ] **PANEL-07**: Dry-run / preview mode toggle shows what would be submitted without actually submitting
- [ ] **PANEL-08**: Foreign currency amounts are displayed alongside GBP amounts where present in bank descriptions

### Unmatched Item Handling

- [ ] **UNMT-01**: Unmatched items show an inline assignment form with category dropdown, reason, vendor, and VAT fields
- [ ] **UNMT-02**: "Save as rule" checkbox (default checked) auto-creates a new rule from the manual submission
- [ ] **UNMT-03**: Auto-derived match pattern from vendor name is shown and editable before saving
- [ ] **UNMT-04**: Category dropdown shows most-used categories at the top
- [ ] **UNMT-05**: VAT divisibility hint shown when gross amount is divisible by 1.2

### Extension Pages

- [ ] **EXT-01**: Popup shows current page status (CK portal detected or not), matched/unmatched item counts, and link to options
- [ ] **EXT-02**: Options page provides full rule CRUD: add, edit, delete, enable/disable rules with all fields

## v2 Requirements

### Extension Pages (Deferred)

- **EXT-03**: "Test rule" feature — paste a bank description and see which rule matches
- **EXT-04**: Import/export rules as JSON for backup and sharing
- **EXT-05**: Storage quota usage display with warning at 60% capacity

### Rule Engine (Deferred)

- **RULE-09**: Rule suggestions based on patterns in unmatched items

### Notifications (Deferred)

- **NOTF-01**: Badge notification when new suspense items are detected on portal visit

## Out of Scope

| Feature | Reason |
|---------|--------|
| Firefox extension port | Validate Chrome demand first; different extension APIs |
| Personal account expenses | Different form workflow, not suspense item mapping |
| Auto-detection of new claim periods | MV3 service worker polling is unreliable |
| AI/ML rule suggestions | Supervised "save as rule" covers the need more reliably |
| Bulk CSV rule import | Edge case; typical user has 10-30 rules defined manually |
| Auto-submit on page load | Trust failure — users must initiate submission |
| OCR receipt capture | Out of scope for form automation tool |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PORT-01 | Phase 1 | Complete |
| RULE-01 | Phase 1 | Complete |
| RULE-02 | Phase 1 | Complete |
| RULE-03 | Phase 1 | Complete |
| RULE-04 | Phase 1 | Complete |
| RULE-05 | Phase 1 | Complete |
| RULE-06 | Phase 1 | Complete |
| RULE-07 | Phase 1 | Complete |
| RULE-08 | Phase 1 | Complete |
| PORT-02 | Phase 2 | Complete |
| PORT-03 | Phase 2 | Complete |
| PORT-04 | Phase 2 | Complete |
| PORT-05 | Phase 2 | Complete |
| PORT-06 | Phase 2 | Complete |
| PANEL-01 | Phase 3 | Pending |
| PANEL-02 | Phase 3 | Pending |
| PANEL-03 | Phase 3 | Pending |
| PANEL-04 | Phase 3 | Pending |
| PANEL-05 | Phase 3 | Pending |
| PANEL-06 | Phase 3 | Pending |
| PANEL-07 | Phase 3 | Pending |
| PANEL-08 | Phase 3 | Pending |
| UNMT-01 | Phase 3 | Pending |
| UNMT-02 | Phase 3 | Pending |
| UNMT-03 | Phase 3 | Pending |
| UNMT-04 | Phase 3 | Pending |
| UNMT-05 | Phase 3 | Pending |
| EXT-01 | Phase 4 | Pending |
| EXT-02 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 29 total
- Mapped to phases: 29
- Unmapped: 0

---
*Requirements defined: 2026-04-03*
*Last updated: 2026-04-03 after roadmap creation*
