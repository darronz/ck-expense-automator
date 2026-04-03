---
phase: 1
slug: foundation-and-data-layer
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-03
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (via WXT's built-in WxtVitest plugin) |
| **Config file** | vitest.config.ts (created by WXT init) |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run --reporter=verbose` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run --reporter=verbose`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | PORT-01 | manual | Live portal test | N/A | ⬜ pending |
| 01-02-01 | 02 | 1 | RULE-01, RULE-02 | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 01-02-02 | 02 | 1 | RULE-03 | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 01-02-03 | 02 | 1 | RULE-04, RULE-05, RULE-06 | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 01-02-04 | 02 | 1 | RULE-07 | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 01-02-05 | 02 | 1 | RULE-08 | unit | `npx vitest run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/rules-store.test.ts` — stubs for RULE-01, RULE-02, RULE-03
- [ ] `tests/expense-engine.test.ts` — stubs for RULE-04, RULE-05, RULE-06, RULE-07
- [ ] `tests/setup.ts` — shared test fixtures (mock chrome.storage)

*Vitest installed as part of WXT scaffold — no additional framework install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Content script loads in MAIN world on CK portal | PORT-01 | Requires live CK portal session | Load extension, navigate to ExpenseItems page, check console for MAIN world access to jQuery/DataTables |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
