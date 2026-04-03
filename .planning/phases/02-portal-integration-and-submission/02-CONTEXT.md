# Phase 2: Portal Integration and Submission - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning

<domain>
## Phase Boundary

CK portal API layer: programmatic DataTable trigger sequence (Payment Type + Suspense Items checkbox), MutationObserver-based DataTable readiness detection, suspense item row iteration with try/finally cleanup, fetch() POST submission with ASP.NET form encoding, response body validation error parsing, and session expiry detection.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure integration/infrastructure phase. Key decisions include:
- MutationObserver timeout values for DataTable readiness
- Rate limiting between sequential POST submissions (400ms recommended by research)
- Response body parsing strategy for ASP.NET validation errors
- Session expiry detection method (redirect detection vs. response body check)
- ck-api.ts module API surface design
- Error types and error handling patterns

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/types.ts` — ExpenseRule, SuspenseItem, SubmissionResult interfaces (from Phase 1)
- `lib/expense-engine.ts` — buildPayload() produces complete URLSearchParams for POST
- `lib/rules-store.ts` — getRules() for loading user rules
- `entrypoints/ck-portal.content.ts` — MAIN world content script with jQuery/DataTables polling

### Established Patterns
- Pure function modules in `lib/` with no browser API side effects
- MAIN world content script accesses page jQuery via `window.$`
- WXT's fake-browser for unit testing chrome.* APIs

### Integration Points
- `entrypoints/ck-portal.content.ts` will import and use `lib/ck-api.ts`
- `lib/ck-api.ts` will use jQuery/DataTables from the page's global scope (MAIN world)
- Form payloads come from `lib/expense-engine.ts buildPayload()`
- POST target: `/ExpenseItems/Create?claimId={claimId}` with `credentials: 'same-origin'`

</code_context>

<specifics>
## Specific Ideas

CLAUDE.md contains exact specifications for:
- DataTable ID: `#DataTables_Table_1` with class `suspenseitems-table`
- Row iteration pattern: `dt.page.len(-1).draw(false)` then `dt.rows().every()`
- Suspense ID extraction: select row, read `#MappedSuspenseItemIds` hidden field
- Cleanup: `dt.rows().deselect()` + clear `#MappedSuspenseItemIds`
- POST content-type: `application/x-www-form-urlencoded`
- VAT validation rule: VAT > 0 and ≤ 20% of net

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>
