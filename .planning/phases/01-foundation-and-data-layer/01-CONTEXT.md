# Phase 1: Foundation and Data Layer - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning

<domain>
## Phase Boundary

WXT project scaffold with TypeScript and Manifest V3 configuration. MAIN world content script injection on the CK portal. Rule storage layer using chrome.storage.sync. Core expense matching engine with regex matching, VAT calculation, and form payload construction. Smart vendor extraction from bank descriptions.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase. Key decisions include:
- WXT project structure and configuration
- TypeScript strictness settings
- chrome.storage.sync key structure (single array vs per-rule keys)
- Expense engine API design
- Default rule set from CLAUDE.md examples
- Smart vendor extraction regex patterns

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield project

### Established Patterns
- None — this phase establishes all patterns

### Integration Points
- CLAUDE.md contains the complete form field specification, NominalId values, and bank description formats
- Default rules defined in CLAUDE.md DEFAULT_RULES section

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase. Follow CLAUDE.md technical specifications for form fields, NominalId values, and rule schema.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>
