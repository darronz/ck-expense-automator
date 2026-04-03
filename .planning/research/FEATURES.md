# Feature Research

**Domain:** Chrome extension for site-specific portal automation / expense entry
**Researched:** 2026-04-03
**Confidence:** HIGH (project domain is well-understood from CLAUDE.md; research confirmed expected patterns)

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete or untrustworthy.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Injected UI panel on the target page | Users expect the tool to appear where the work happens — not in a separate tab | MEDIUM | Floating overlay, draggable. Must wait for jQuery + DataTables to load before init. |
| Rule-based matching with regex | Users who reach for automation expect pattern-based rules as the core mechanic | MEDIUM | Rules stored in chrome.storage.sync. Regex with case-insensitive flag default. |
| Matched item review before submission | Trust is non-negotiable for financial data — users must see what will be submitted | LOW | Show category, vendor, VAT inline per item before any POST fires. |
| One-click submit for matched items | The entire value prop. If matched items still require manual steps, the tool fails | LOW | Single [Submit] per row; [Submit All] for bulk. Uses fetch() POST, no page reload. |
| Per-item individual submission | Users want to approve selectively — bulk-or-nothing is unacceptable for finance | LOW | Row-level [Submit] button alongside the bulk option. |
| Submission result feedback | Users must know what succeeded and what failed — silent failure is a bug | LOW | Green check on success; red error with message on failure; [Retry] button. |
| Progress indicator during bulk submit | Submitting 10-20 items takes seconds — users need to know the tool is working | LOW | "Submitting X/N..." progress text or bar during sequential POSTs. |
| Unmatched item inline assignment | If an item has no rule, the user must be able to handle it in the same workflow | MEDIUM | Inline expand form in the panel: category, reason, vendor, VAT, "save as rule" checkbox. |
| VAT validation client-side | Portal enforces VAT <= 20% of net; surfacing this before submission prevents wasted POSTs | LOW | Validate on input change. Show: "Max £X.XX (20% of net)". |
| Rule persistence across sessions | Users define rules once and expect them to work next month automatically | LOW | chrome.storage.sync. Survives browser restart, works across devices. |
| Options page for rule management | Non-technical users expect a proper settings UI, not editing JSON manually | MEDIUM | List/add/edit/delete rules, enable/disable toggles, import/export JSON. |
| Enable/disable toggle per rule | Users want to temporarily suspend a rule (e.g. cancelled subscription) without deleting | LOW | Boolean `enabled` field on each rule. Panel skips disabled rules at match time. |
| Extension popup with status | Clicking the toolbar icon should give instant context: are we on the right page? How many items? | LOW | Show: current page status, matched/unmatched counts, link to options. |
| Session expiry detection | Portal can log out mid-session; silent failure on auth errors destroys trust | LOW | Detect redirect to login URL in fetch() response. Show "Session expired — please log in" message. |

### Differentiators (Competitive Advantage)

Features that set this product apart from generic form automation tools.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Smart vendor extraction from bank descriptions | Pre-fills vendor name from the raw bank reference (strips "Ref: Starling..." prefix, parses ONLINE PAYMENT / DIRECT DEBIT / CARD SUBSCRIPTION patterns) | MEDIUM | Reduces friction when handling unmatched items. Makes "save as rule" feel magical. |
| "Save as rule" on unmatched submission | Users teach the extension as they go — next month the same vendor is auto-matched | LOW | Checked by default in the inline form. Auto-derives matchPattern from extracted vendor keyword. User can edit the generated pattern before saving. |
| Dry-run / preview mode | Shows what would be submitted without actually posting — essential for building user trust and validating rules | LOW | Toggle in panel header. Runs full match logic, renders as if real submission, posts nothing. |
| Rule usage statistics (match count, last used) | Helps users audit rules: "Is this rule still firing? When did I last see this vendor?" | LOW | Increment matchCount + lastUsed in chrome.storage.sync on each successful use. Display in options page table. |
| "Test rule" in options page | Non-technical users can paste a bank description and verify which rule (if any) it would match before submitting real expenses | LOW | Pure client-side regex test; no portal interaction needed. Critical for debugging. |
| Claim context in panel header | Shows "Claim: 2026 March — 6 items — 5 matched" so user knows they are on the right claim | LOW | Extracted from URL claimId and page title/content. |
| Most-used categories float to top of dropdown | Reduces cognitive load for the inline assignment form — most recurring categories surface immediately | LOW | Sort NominalId options by frequency of use across existing rules. |
| VAT auto-calculation hint | For items where amount is divisible by 1.2, surface a hint that VAT may apply (e.g. "£72 is £60 + £12 VAT?") | LOW | Heuristic only — never pre-fill without user confirmation. |
| Foreign currency amount display | Bank descriptions include "Rate: 1.3390" for USD transactions — surfacing the original currency helps users verify the amount they're about to submit | LOW | Parse and display in matched item row as secondary info. Read-only. |
| Rules import/export as JSON | Users can back up their rules, share with other CK users, or seed a fresh install | LOW | Download trigger via options page button. File API for import. Already planned. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems for this specific tool.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Auto-submit on page load with no confirmation | "Zero-click automation" sounds ideal | Financial submissions without review is high-risk; a wrong match submits incorrect expenses to your accountant, which requires manual reversal and creates audit issues | Require explicit [Submit] or [Submit All] click. One confirmation step is acceptable; automated-on-load is not. |
| AI / ML rule suggestions | "Learn from my behaviour automatically" | Adds a server component or on-device model; adds latency and complexity; wrong AI suggestions introduce subtle errors in financial records | "Save as rule" checkbox on manual entry provides explicit supervised learning. Implement usage stats first; ML is v2+ only if validated. |
| Receipt OCR / image capture | Useful in general expense tools | This extension operates on bank transaction descriptions, not receipts. CK portal handles receipt uploads separately. Adding OCR introduces camera/file permissions and entirely different UX context. | Out of scope. Bank description parsing covers the actual use case. |
| Sync to external accounting tools (Xero, QuickBooks) | Power users who manage books may want this | CK portal is the accounting system for this user type; a second sync destination creates duplication and confusion. CK accountant manages the books, not the user. | Not applicable — CK is the destination. |
| Scheduled / background auto-submission | "Run every month automatically" | Chrome extensions do not support scheduled background jobs in MV3 (service workers terminate). Attempting periodic execution is unreliable. Also: financial submissions need human-in-the-loop. | Show badge notification when user lands on CK portal; auto-display panel and matched items. User clicks [Submit All]. |
| Per-rule notification / email alerts | "Tell me when a rule matches" | Requires persistent background context (unavailable in MV3 service workers) or server-side infrastructure. | Rule usage stats in options page satisfy the "did this rule fire?" question without infrastructure. |
| Multi-portal support (other accountancy portals) | "Port this to FreeAgent / HMRC / etc." | Completely different DOM structures, form schemas, and submission mechanics. Trying to generalise creates an unmaintainable abstraction. | Single-portal focus for v1. Document the extension architecture so future ports are isolated modules. |
| CSV/spreadsheet bulk import of expenses | "I have 50 expenses to import" | Power feature that serves edge cases. Non-technical users do not have expense data in CSV. Adds UI complexity far exceeding the core use case. | Rules + bulk submit covers the recurring-expense use case cleanly. Defer or reject. |

## Feature Dependencies

```
[Suspense Item Extraction from DataTable]
    └──required by──> [Rule Matching Engine]
                          └──required by──> [Injected Panel — Matched Items List]
                                                └──required by──> [Submit All Button]
                                                └──required by──> [Individual Submit Button]
                                                └──required by──> [Dry-Run Mode]

[Rule Storage (chrome.storage.sync)]
    └──required by──> [Rule Matching Engine]
    └──required by──> [Options Page — Rule CRUD]
    └──required by──> [Enable/Disable Toggle]
    └──required by──> [Rule Usage Statistics]

[Smart Vendor Extraction]
    └──enhances──> [Unmatched Item Inline Form — Vendor Pre-fill]
                       └──enhances──> [Save as Rule Checkbox]
                                          └──enhances──> [Rule Matching Engine] (new rule created)

[VAT Client-Side Validation]
    └──required by──> [Unmatched Item Inline Form]
    └──required by──> [Individual Submit Button] (validate before POST)

[Options Page Test Rule Feature]
    └──depends on──> [Rule Matching Engine] (reuses the same regex test logic)

[fetch() POST Submission]
    └──required by──> [Submit All Button]
    └──required by──> [Individual Submit Button]
    └──required by──> [Unmatched Item Submit]
    └──NOT used by──> [Dry-Run Mode] (intentionally bypassed)

[Session Expiry Detection]
    └──wraps──> [fetch() POST Submission]
```

### Dependency Notes

- **Suspense item extraction requires DataTable API:** The DataTable must be programmatically scrolled to show all pages (`dt.page.len(-1).draw(false)`) and iterated row-by-row to extract IDs. This is a pre-requisite for everything else — no items extracted means nothing to match or submit.
- **Rule matching requires item extraction to complete:** Matching runs over the extracted item list. These must be sequential, not concurrent.
- **"Save as rule" enhances the core matching loop:** Every manual unmatched-item submission is an opportunity to teach the rules engine. The flow creates a tight feedback loop: submit once manually, auto-match forever after.
- **Dry-run mode conflicts with actual submission:** These two modes are mutually exclusive. Panel must be visually clear about which mode is active. Prevent accidental real submission when dry-run is enabled.
- **Test rule in options reuses matching logic:** The same `matchesRule(description, rule)` function used in the panel should be exposed and called by the test-rule UI. No separate implementation.

## MVP Definition

### Launch With (v1)

Minimum viable product — what validates that the tool saves meaningful time for CK users.

- [ ] Suspense item extraction from DataTable (reads all items, all pages) — core mechanic; without this nothing works
- [ ] Regex rule matching against bank descriptions — the primary value proposition
- [ ] chrome.storage.sync rule persistence — rules must survive browser restarts
- [ ] Injected panel showing matched items with category, vendor, VAT summary — user must see before they submit
- [ ] [Submit] per item and [Submit All] bulk button — the actual time-saver
- [ ] fetch() POST submission with same-origin credentials — no page reloads between items
- [ ] Submission result feedback (green check / red error / retry) — trust and error handling
- [ ] Unmatched item inline form (category, reason, vendor, VAT, "save as rule") — handles the items rules don't cover
- [ ] VAT client-side validation — prevent wasted API calls on malformed VAT amounts
- [ ] Session expiry detection — graceful failure mode, not silent breakage
- [ ] Extension popup with page status and item counts — minimum viable toolbar presence
- [ ] Options page: add, edit, delete, enable/disable rules — users must be able to manage rules without editing JSON
- [ ] Default rules pre-loaded — lowers barrier for first-time users (Virgin Media, Supabase, LinkedIn, etc.)

### Add After Validation (v1.x)

Features to add once core loop is confirmed working and used.

- [ ] Smart vendor extraction from bank descriptions — when "save as rule" adoption is measured, this dramatically reduces friction for unmatched items
- [ ] Dry-run / preview mode — add when users report accidental incorrect submissions (likely early)
- [ ] Rule usage statistics (match count, last used) — add when users ask "is this rule still working?"
- [ ] "Test rule" feature in options — add when users report debugging confusion about why a rule isn't matching
- [ ] Most-used categories float to top of inline form dropdown — add when category selection friction is reported
- [ ] Foreign currency display in matched item rows — add when USD/EUR expense users request it
- [ ] Import/export JSON rules — add when users ask about backup or sharing rules between devices manually

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] Rule suggestions from manual entry patterns — defer; "save as rule" covers 90% of the need with less complexity
- [ ] Badge notification when new suspense items are detected — defer; requires reliable MV3 background polling which is complex to implement correctly
- [ ] Firefox port — defer; Chrome-only until core is validated and there is demonstrated Firefox demand
- [ ] Personal account expense flow (non-suspense item mapping) — defer; entirely different form workflow, separate research needed
- [ ] Bulk CSV rule import — defer; edge case that doesn't serve the typical solo freelancer

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Suspense item extraction | HIGH | MEDIUM | P1 |
| Regex rule matching | HIGH | LOW | P1 |
| Injected panel with matched items | HIGH | MEDIUM | P1 |
| Bulk + individual submit via fetch() | HIGH | LOW | P1 |
| Submission result feedback | HIGH | LOW | P1 |
| Unmatched item inline form | HIGH | MEDIUM | P1 |
| Rule persistence (chrome.storage.sync) | HIGH | LOW | P1 |
| VAT client-side validation | HIGH | LOW | P1 |
| Session expiry detection | HIGH | LOW | P1 |
| Options page rule CRUD | HIGH | MEDIUM | P1 |
| Extension popup status | MEDIUM | LOW | P1 |
| Default example rules | MEDIUM | LOW | P1 |
| Smart vendor extraction | HIGH | LOW | P2 |
| Dry-run preview mode | HIGH | LOW | P2 |
| "Save as rule" checkbox | HIGH | LOW | P2 |
| Rule usage statistics | MEDIUM | LOW | P2 |
| "Test rule" in options | MEDIUM | LOW | P2 |
| Import/export JSON | MEDIUM | LOW | P2 |
| Most-used categories float to top | LOW | LOW | P2 |
| Foreign currency display | LOW | LOW | P3 |
| VAT amount hint (divisible by 1.2 heuristic) | LOW | LOW | P3 |
| Rule suggestions / ML learning | LOW | HIGH | P3 |
| Badge notifications for new items | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible — most are low-cost and high-trust-building
- P3: Nice to have, future consideration

## Competitor Feature Analysis

There are no direct competitors — no other Chrome extension targets the Churchill Knight portal specifically. The comparison below draws on analogous tools in adjacent categories.

| Feature | Generic autofill extensions (e.g. QuickForm, Magical) | Expense management platforms (e.g. Expensify, Ramp) | This extension |
|---------|------------------------------------------------------|-----------------------------------------------------|----------------|
| Site targeting | Any site, generic field mapping | App + web, receipt-focused | Single portal, deep DOM integration |
| Rule definition | Record-and-replay, template fields | AI categorisation, policy rules | User-defined regex, financial fields |
| Submission mechanism | DOM simulation (click/fill) | Native app integration | Direct authenticated fetch() POST |
| Review before submit | Usually none (autofill = instant) | Approval workflows (multi-user) | Panel review + dry-run, single user |
| Persistence | Cloud sync (paid) or local | Cloud-based, account-required | chrome.storage.sync, no account needed |
| Setup complexity | Medium (record flows) | High (account, card integration) | Low (install + define rules) |
| VAT / UK tax awareness | None | Partial (receipt OCR) | Built-in (UK VAT <= 20% rule, NominalId categories) |
| Unmatched item handling | Fails silently or ignores | AI categorisation | Inline form with "save as rule" |

**Key differentiation:** This extension has exact knowledge of the target portal's form fields, submission endpoint, DataTable structure, and category IDs. Generic tools cannot replicate this specificity. The competitive moat is depth, not breadth.

## Sources

- CLAUDE.md: Churchill Knight portal technical documentation (form fields, AJAX endpoints, NominalId values, suspense item DataTable API, ASP.NET checkbox pattern) — HIGH confidence
- [5 Best Autofill Chrome Extensions in 2026](https://blaze.today/blog/autofill-chrome-extensions/) — industry feature baseline, MEDIUM confidence
- [Top 10 Best Auto Fill Extension Plugins for Chrome in 2026](https://thunderbit.com/blog/best-auto-fill-extension-chrome) — competitor feature list, MEDIUM confidence
- [FillApp — AI Form Filling & Automation](https://fillapp.ai/) — preview/dry-run pattern reference, MEDIUM confidence
- [Content scripts — Chrome for Developers](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts) — injection patterns, HIGH confidence
- [Building Chrome Extensions in 2026: Practical Guide with Manifest V3](https://dev.to/ryu0705/building-chrome-extensions-in-2026-a-practical-guide-with-manifest-v3-12h2) — MV3 storage and service worker constraints, MEDIUM confidence
- [How to Automate Expense Reporting in 5 Steps — Ramp](https://ramp.com/blog/automated-expense-reporting) — bulk submit + review patterns, MEDIUM confidence
- [Chrome Extension Development: Which Implementation Fits Your Needs](https://dev.to/sheep_/chrome-extension-development-which-implementation-fits-your-needs-2ik2) — popup vs options page UX split, MEDIUM confidence

---
*Feature research for: Chrome extension portal automation / expense entry*
*Researched: 2026-04-03*
