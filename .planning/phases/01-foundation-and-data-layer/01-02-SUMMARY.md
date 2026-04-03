---
phase: 01-foundation-and-data-layer
plan: 02
subsystem: database
tags: [chrome-extension, wxt, vitest, typescript, chrome-storage, regex]

# Dependency graph
requires:
  - phase: 01-foundation-and-data-layer/01-01
    provides: WXT project scaffold, vitest.config.ts, TypeScript config, background.ts stub

provides:
  - lib/types.ts — ExpenseRule, RulesConfig, RuleStats, ExpenseSubmission, SuspenseItem, MatchResult interfaces
  - lib/rules-store.ts — chrome.storage.sync CRUD for rules, chrome.storage.local stats, DEFAULT_RULES (8 rules)
  - lib/expense-engine.ts — matchRule, validateVat, buildPayload, calculateVatFromPercentage, matchExpenses
  - lib/vendor-extractor.ts — extractVendor parsing ONLINE PAYMENT / DIRECT DEBIT / CARD SUBSCRIPTION / APPLE PAY
  - entrypoints/background.ts — onInstalled listener seeding DEFAULT_RULES on first install
  - tests/ — 47 passing unit tests covering all RULE-01 through RULE-08 requirements

affects: [Phase 2 portal interaction, Phase 3 panel UI, Phase 4 submission engine]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "WxtVitest fake-browser provides in-memory storage — no manual chrome mock setup needed"
    - "ASP.NET double-field checkbox pattern: append field twice, second always false"
    - "VAT percentage formula: net = gross / (1 + pct/100), NOT gross * pct"
    - "stats-{ruleId} key prefix in storage.local separates from rules in storage.sync"
    - "try/catch around new RegExp() prevents invalid user patterns from crashing matching loop"

key-files:
  created:
    - lib/types.ts
    - lib/rules-store.ts
    - lib/expense-engine.ts
    - lib/vendor-extractor.ts
    - tests/rules-store.test.ts
    - tests/expense-engine.test.ts
    - tests/vendor-extractor.test.ts
  modified:
    - entrypoints/background.ts

key-decisions:
  - "recordRuleUsage writes to browser.storage.local (not sync) — stats change on every match, don't need cross-device sync"
  - "saveRules includes byte-count guard: warn at 25 rules, throw at 35 (approaching 8192 per-item limit)"
  - "calculateVatFromPercentage uses inclusive reverse formula (net = gross / (1 + pct/100)) matching CK portal validation rule"
  - "DEFAULT_RULES UUIDs generated at module load time via crypto.randomUUID()"

patterns-established:
  - "Pattern: All browser.storage calls go through lib/rules-store.ts — never access storage directly from engine or UI"
  - "Pattern: expense-engine.ts and vendor-extractor.ts are pure functions — no browser API calls"
  - "Pattern: matchRule returns false on invalid regex (catch SyntaxError) rather than crashing"
  - "Pattern: buildPayload always produces double-fields for HasVatReceipt and IsMappedToSuspenseItems (ASP.NET requirement)"

requirements-completed: [RULE-01, RULE-02, RULE-03, RULE-04, RULE-05, RULE-06, RULE-07, RULE-08]

# Metrics
duration: 8min
completed: 2026-04-03
---

# Phase 1 Plan 02: Data Layer Summary

**TypeScript data layer with chrome.storage CRUD, 8 default rules, regex expense matching engine, VAT validator, 20-field form payload builder, and Starling bank vendor extractor — all covered by 47 passing unit tests**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-04-03T09:22:00Z
- **Completed:** 2026-04-03T09:30:18Z
- **Tasks:** 3 (TDD: RED then GREEN)
- **Files modified:** 8

## Accomplishments

- 47 unit tests across 3 test files — all GREEN, `npx vitest run` exits 0
- rules-store.ts with full CRUD (getRules, saveRules, addRule, updateRule, deleteRule, recordRuleUsage) and 8 DEFAULT_RULES from CLAUDE.md
- expense-engine.ts with matchRule (invalid-regex-safe), validateVat, buildPayload (all 20 CK form fields), calculateVatFromPercentage, matchExpenses
- vendor-extractor.ts handles all 4 Starling bank description patterns
- background.ts seeds DEFAULT_RULES on first install via onInstalled

## Task Commits

Each task was committed atomically:

1. **Task 1: Write test scaffolding (RED phase)** - `2cfaba0` (test)
2. **Task 2: Implement types.ts, rules-store.ts, background.ts** - `33812aa` (feat)
3. **Task 3: Implement expense-engine.ts and vendor-extractor.ts** - `9f91c0a` (feat)

_TDD pattern: Task 1 wrote failing tests, Tasks 2-3 implemented to GREEN_

## Files Created/Modified

- `lib/types.ts` — ExpenseRule, RulesConfig, RuleStats, ExpenseSubmission, SuspenseItem, MatchResult
- `lib/rules-store.ts` — chrome.storage.sync CRUD, stats in chrome.storage.local, DEFAULT_RULES with 8 rules
- `lib/expense-engine.ts` — matchRule, validateVat, buildPayload (20 CK fields), calculateVatFromPercentage, matchExpenses
- `lib/vendor-extractor.ts` — extractVendor with 4 Starling patterns, trailing reference number stripping
- `entrypoints/background.ts` — onInstalled DEFAULT_RULES seeding
- `tests/rules-store.test.ts` — 12 tests for RULE-01, RULE-02, RULE-03, RULE-08
- `tests/expense-engine.test.ts` — 23 tests for RULE-04, RULE-05, RULE-06
- `tests/vendor-extractor.test.ts` — 7 tests for RULE-07

## Decisions Made

- **Stats in storage.local**: `recordRuleUsage` writes `stats-{ruleId}` to `browser.storage.local`, not `storage.sync`. Stats change on every match — using sync would burn write quota (120 writes/min limit) unnecessarily.
- **Byte-count guard in saveRules**: Warn at 25 rules, throw hard error at 35 rules. At ~200 bytes/rule, 35 rules ≈ 7KB, approaching the 8192 per-item limit. Prevents silent storage failures.
- **VAT formula**: `net = gross / (1 + pct/100)` not `gross * pct/100`. For gross=72, vatPct=20: net=60, vat=12. Using `gross * 0.20 = 14.40` would fail the CK portal's validation check.
- **UUID at module load**: `crypto.randomUUID()` called once per rule in DEFAULT_RULES array literal, not regenerated on each import.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- All RULE-01 through RULE-08 requirements covered by passing unit tests
- lib/ modules are pure TypeScript with no browser API leakage (expense-engine and vendor-extractor are fully pure)
- Phase 2 (portal interaction / content script) can import directly from lib/expense-engine and lib/rules-store
- Phase 3 (panel UI) can use matchExpenses and extractVendor from the same modules
- Background.ts is ready for extension install seeding

---
*Phase: 01-foundation-and-data-layer*
*Completed: 2026-04-03*
