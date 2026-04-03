# Phase 3: Injected Panel UI - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Shadow DOM floating panel injected on CK ExpenseItems pages. Displays matched items (from expense-engine matching) and unmatched items. Provides individual [Submit] and bulk [Submit All] buttons. Includes inline assignment form for unmatched items with "save as rule" flow. Dry-run/preview mode. Foreign currency display. All submissions via existing ck-api.ts submitExpense().

</domain>

<decisions>
## Implementation Decisions

### Panel Layout & Interaction
- Right sidebar overlay, fixed position (not draggable), 400px wide
- Minimize [−] and close [×] buttons in header
- Click on matched item row expands to show full details and [Edit] link to override fields
- Panel shows claim context (month/year) and item counts in header

### Submission UX
- 400ms delay between bulk POST submissions to prevent server flooding
- Progress indicator: "Submitting 3/6..." text with progress bar during bulk submit
- After all submissions: show summary ("✅ 5 submitted, ❌ 1 failed") with [Reload Page] button
- Failed items show inline red error text with [Retry] button
- Successful items transition to green check, greyed out, "✓ Submitted" label

### Inline Form Design
- Category dropdown: native `<select>` element with most-used categories sorted to top
- "Save as rule" checkbox: checked by default
- Editable match pattern field: only shown when "Save as rule" is checked
- Form validation: on submit (not real-time) — validates VAT and required fields
- Vendor name pre-filled from smart vendor extraction (lib/vendor-extractor.ts)
- Category defaults to "Subscriptions" (NominalId 68) — most common for recurring items

### Claude's Discretion
- Shadow DOM styling approach (CSS-in-JS vs inline styles vs stylesheet)
- Panel animation/transitions
- Color scheme and typography (should be clean and readable, not match CK portal's dated design)
- Internal component structure and state management approach

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/expense-engine.ts` — `matchRules()`, `buildPayload()`, `validateVat()` 
- `lib/ck-api.ts` — `readSuspenseItems()`, `submitExpense()`
- `lib/vendor-extractor.ts` — `extractVendor()`
- `lib/rules-store.ts` — `getRules()`, `addRule()`, `recordRuleUsage()`
- `lib/types.ts` — `ExpenseRule`, `SuspenseItem`, `SubmissionResult`, `MatchedItem`

### Established Patterns
- MAIN world content script in `entrypoints/ck-portal.content.ts`
- Pure function modules in `lib/`
- WXT's `defineContentScript()` for entrypoint config

### Integration Points
- Panel injected from `entrypoints/ck-portal.content.ts` after suspense items are read
- Panel calls `submitExpense()` for each item (individual or bulk)
- Panel calls `addRule()` when user saves a new rule from inline form
- Panel calls `matchRules()` with loaded rules + suspense items to categorize items
- Shadow DOM attached to a new `<div>` in the CK page body

</code_context>

<specifics>
## Specific Ideas

CLAUDE.md contains a detailed panel layout mockup showing:
- Header with title, claim context, minimize/close buttons
- Matched section with [Submit All] button and individual item rows
- Each row: date, amount, rule name, category, vendor, VAT status, [Submit] button
- Unmatched section with [Assign & Submit] expand buttons
- Inline form: category dropdown, reason, vendor, Has VAT checkbox, VAT amount, save-as-rule checkbox
- Footer with submitted count and status

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>
