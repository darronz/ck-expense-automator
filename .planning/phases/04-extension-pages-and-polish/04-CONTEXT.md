# Phase 4: Extension Pages and Polish - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Extension popup (popup.html/popup.js) showing page status and item counts. Full options page (options.html/options.js) with rule CRUD: add, edit, delete, enable/disable, reset to defaults. Rule usage statistics display. Changes propagate to content script panel via chrome.storage.onChanged without tab reload.

</domain>

<decisions>
## Implementation Decisions

### Popup Design
- 320px wide, auto-height
- When not on CK page: "Navigate to CK Expenses to use" message
- When on CK page: matched/unmatched counts + "Show Panel" toggle + Options link
- Sends message to content script via chrome.tabs.sendMessage for panel toggle

### Options Page Design
- Single-page table listing all rules with enable/disable toggles
- Inline edit on click — fields become editable in-place
- Add new rule via a form at the top or bottom of the table
- Delete with "Are you sure?" confirm
- "Reset to defaults" replaces ALL rules with confirmation dialog
- Rule usage statistics (matchCount, lastUsed) shown per rule row
- Category dropdown uses same NominalId list as the panel

### Claude's Discretion
- HTML/CSS styling approach for popup and options page
- Table layout and responsiveness
- Whether to use WXT's built-in HTML entrypoint pattern or manual HTML files
- Message passing protocol between popup and content script

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/rules-store.ts` — getRules(), addRule(), updateRule(), deleteRule(), DEFAULT_RULES
- `lib/types.ts` — ExpenseRule interface
- `ui/panel-utils.ts` — NOMINAL_CATEGORIES for category dropdown

### Established Patterns
- WXT entrypoint pattern (defineContentScript, etc.)
- chrome.storage.sync for rules, chrome.storage.local for stats
- chrome.storage.onChanged event for cross-context sync

### Integration Points
- Popup communicates with content script via chrome.tabs.sendMessage
- Options page writes to chrome.storage.sync — content script panel picks up changes via onChanged listener
- Background service worker already seeds defaults on install

</code_context>

<specifics>
## Specific Ideas

From CLAUDE.md:
- Popup shows "Navigate to CK Expenses to use" when not on portal
- Options page has enable/disable toggles, edit, delete per rule
- "Reset to defaults" button restores example rules
- Category dropdown populated with known NominalId values

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>
