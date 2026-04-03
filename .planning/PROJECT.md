# CK Expense Automator

## What This Is

A Chrome extension (Manifest V3) that automates expense claim entry on the Churchill Knight & Associates accountancy portal. It reads unmapped bank transactions (suspense items) from the "Add Items" page, matches them against user-defined regex rules, and submits them as categorised expenses — either in bulk or one by one with review.

## Core Value

Recurring monthly expenses that always match the same vendor, category, and VAT treatment can be submitted in a single click instead of 8+ form interactions each.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Content script injects on CK portal ExpenseItems pages and reads all suspense items from the DataTable
- [ ] User can define expense rules with regex patterns, category, vendor, description, and VAT settings
- [ ] Rules are stored in chrome.storage.sync and persist across sessions/devices
- [ ] Matched suspense items are displayed in an injected panel with category, vendor, and VAT summary
- [ ] User can submit all matched items in bulk with one click
- [ ] User can submit individual matched items one at a time
- [ ] Unmatched items show an inline assignment form (category, reason, vendor, VAT)
- [ ] Submitting an unmatched item can auto-create a rule for future matches
- [ ] Submissions use fetch() POST directly to the CK endpoint (no page reload between items)
- [ ] VAT validation enforced client-side (VAT <= 20% of net)
- [ ] Extension popup shows page status, item counts, and link to options
- [ ] Options page provides full rule management (add, edit, delete, enable/disable, import/export JSON)
- [ ] Failed submissions show error with retry button; successful ones show green check
- [ ] Smart vendor extraction from bank descriptions (ONLINE PAYMENT, DIRECT DEBIT, CARD SUBSCRIPTION patterns)

### Out of Scope

- Firefox extension port — Chrome-only for v1
- Personal account expenses (non-suspense item mapping) — different workflow, defer
- Auto-detection of new expense claim periods — requires polling/notifications infrastructure
- Rule suggestions from manual entries — ML/pattern learning is future work
- Bulk CSV rule import — not needed for individual freelancers in v1

## Context

- **Target portal:** `portal.churchill-knight.co.uk` — ASP.NET MVC, no CSRF token, jQuery + DataTables
- **Users:** UK freelancers/contractors with limited companies managed by Churchill Knight. Non-technical — must work from Chrome Web Store with zero config beyond defining rules.
- **Form submission:** Direct POST to `/ExpenseItems/Create?claimId={claimId}` with `application/x-www-form-urlencoded`. Uses existing authenticated session via `credentials: 'same-origin'`.
- **Suspense items:** jQuery DataTable (`#DataTables_Table_1`), paginated, requires programmatic iteration via DataTables API to extract IDs and descriptions.
- **Bank descriptions:** Multi-line text with account reference prefix followed by payment type and vendor (e.g. "ONLINE PAYMENT SUPABASE $25.00, Rate: 1.3390").
- **ASP.NET checkbox pattern:** Checkbox fields always send two values (checkbox value + hidden `false`).
- **Category IDs (NominalId):** Known static values (48=Telephone, 68=Subscriptions, 52=Travel, etc.) — can be used directly without the AJAX GetAllCategories call.
- **VAT rule:** Must be > 0 and <= 20% of Net Amount (Gross - VAT).

## Constraints

- **Platform:** Chrome extension, Manifest V3
- **Permissions:** Minimal — `storage`, `activeTab`, host permissions for `portal.churchill-knight.co.uk`
- **Storage:** `chrome.storage.sync` — has 100KB total limit and 8KB per item limit
- **No backend:** Everything runs client-side in the browser. No server component.
- **Portal stability:** Must handle session expiry gracefully (detect redirect to login page)
- **Non-technical users:** UI must be self-explanatory. No developer tools or config files.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Direct POST via fetch() instead of form manipulation | Avoids page reloads, enables rapid sequential submission, simpler than simulating 8+ UI interactions | — Pending |
| chrome.storage.sync for rules | Cross-device sync, no backend needed, appropriate size for rule sets | — Pending |
| Regex-based matching | Flexible enough for varied bank description formats, power users can write precise patterns | — Pending |
| Skip AJAX GetAllCategories call | NominalId values are known and static, avoids unnecessary network round-trips | — Pending |
| Injected panel UI (not sidebar) | Can overlay the existing CK page, provides context alongside the native form | — Pending |

---
*Last updated: 2026-04-03 after initialization*
