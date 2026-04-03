---
phase: 04-extension-pages-and-polish
plan: 01
subsystem: ui
tags: [chrome-extension, wxt, popup, options, rule-management, chrome-storage]

# Dependency graph
requires:
  - phase: 03-injected-panel-ui
    provides: panel.ts createPanel, ck-panel.content.ts shadow DOM mount, rules-store.ts CRUD
provides:
  - WXT popup entrypoint detecting CK ExpenseItems URL, showing matched/unmatched counts, toggling panel
  - WXT options entrypoint with full rule table (CRUD), inline edit, enable/disable, reset to defaults
  - CK_GET_STATE and CK_TOGGLE_PANEL message protocol between popup and content script
affects: [extension-distribution, end-user-docs]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - WXT HTML entrypoint pattern (entrypoints/{name}/index.html + main.ts)
    - browser.runtime.onMessage delegate pattern for cross-context communication
    - DOM delegate event handling for dynamically-rendered table rows
    - browser.storage.onChanged for live cross-context rule sync

key-files:
  created:
    - entrypoints/popup/index.html
    - entrypoints/popup/main.ts
    - entrypoints/popup/popup.css
    - entrypoints/options/index.html
    - entrypoints/options/main.ts
    - entrypoints/options/options.css
  modified:
    - entrypoints/ck-panel.content.ts
    - wxt.config.ts

key-decisions:
  - "tabs permission added to manifest — browser.tabs.query needs tabs permission to access tab.url"
  - "Module-level currentMatchResult/isPanelVisible/shadowHostRef in ck-panel.content.ts allow popup message handler to read panel state without coupling to panel.ts internals"
  - "browser.runtime.onMessage registered at module level (outside defineContentScript) — handler fires even if main() hasn't completed"
  - "Options page uses outerHTML replacement for inline edit rows — simpler than virtual DOM, sufficient for a low-frequency interaction"
  - "storage.onChanged listener in options page provides live sync when content script saves new rules"

patterns-established:
  - "WXT HTML entrypoint pattern: entrypoints/{name}/index.html references ./main.ts as type=module"
  - "Cross-context messaging: popup queries active tab then sendMessage; content script responds synchronously (return true for async)"

requirements-completed: [EXT-01, EXT-02]

# Metrics
duration: 25min
completed: 2026-04-03
---

# Phase 4 Plan 01: Extension Pages and Polish Summary

**Popup with CK page detection + panel toggle, options page with full rule CRUD table (inline edit, enable/disable, reset to defaults), and live storage sync via storage.onChanged**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-04-03T11:00:00Z
- **Completed:** 2026-04-03T11:25:00Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Extension popup shows "Navigate to CK Expenses" on non-CK pages; on CK ExpenseItems pages shows matched/unmatched item counts and Show/Hide Panel toggle
- Options page provides a full rule management table with name, pattern, category, vendor, VAT, usage stats per row plus inline edit, delete with confirmation, enable/disable toggle
- Add Rule form lets users create new rules with all ExpenseRule fields including VAT amount or percentage
- Reset to Defaults replaces all custom rules with the 8 built-in DEFAULT_RULES after confirmation
- CK_GET_STATE and CK_TOGGLE_PANEL message protocol established between popup and content script
- storage.onChanged listener in options page keeps it in sync when the panel saves new rules

## Task Commits

Each task was committed atomically:

1. **Task 1: Extension popup (status, counts, panel toggle)** - `ed8ee04` (feat)
2. **Task 2: Options page (full rule CRUD with inline edit)** - `ec94f1f` (feat)

**Plan metadata:** (committed with SUMMARY.md)

## Files Created/Modified

- `entrypoints/popup/index.html` - WXT popup HTML entrypoint
- `entrypoints/popup/main.ts` - Popup logic: tab detection, CK_GET_STATE, panel toggle, options link
- `entrypoints/popup/popup.css` - 320px popup styles with count badges and action buttons
- `entrypoints/options/index.html` - WXT options HTML entrypoint
- `entrypoints/options/main.ts` - Options logic: rule table, inline edit, CRUD, storage sync
- `entrypoints/options/options.css` - Options page styles including table, form, badge styles
- `entrypoints/ck-panel.content.ts` - Added module-level state vars and CK_GET_STATE/CK_TOGGLE_PANEL handlers
- `wxt.config.ts` - Added `tabs` permission for popup tab URL access

## Decisions Made

- Added `tabs` permission to manifest — `browser.tabs.query` requires this to access `tab.url`. Without it the URL is undefined and CK page detection fails.
- Registered `browser.runtime.onMessage` at module level in ck-panel.content.ts (outside `defineContentScript`) so the message handler is available immediately, even if `main()` hasn't completed yet.
- Options page uses `outerHTML` replacement for row transitions between view/edit modes — simpler than managing DOM node references for a low-frequency interaction.
- `currentMatchResult` starts as `null` (no items loaded yet); popup shows `0/0` in that case rather than an error.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed incorrect CSS import path in ck-panel.content.ts**
- **Found during:** Task 1 (build verification)
- **Issue:** `import './ui/panel.css'` resolved relative to `entrypoints/` giving `entrypoints/ui/panel.css` which does not exist; correct path is `../ui/panel.css`
- **Fix:** Changed import to `'../ui/panel.css'`
- **Files modified:** `entrypoints/ck-panel.content.ts`
- **Verification:** `npx wxt build` exits 0 after fix
- **Committed in:** `ed8ee04` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - pre-existing bug in import path)
**Impact on plan:** Fix necessary — extension would not build without it. No scope creep.

## Issues Encountered

None beyond the import path fix above.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Extension is fully functional: content script + popup + options page all build and link correctly
- Phase 4 plan 01 is the only plan in the phase — extension v1 is complete
- Ready for Chrome Web Store packaging (`npx wxt zip`) or unpacked load testing on live CK portal

## Self-Check: PASSED

All created files verified present on disk. All task commits (ed8ee04, ec94f1f) verified in git log. Build (`npx wxt build`) exits 0.

---
*Phase: 04-extension-pages-and-polish*
*Completed: 2026-04-03*
