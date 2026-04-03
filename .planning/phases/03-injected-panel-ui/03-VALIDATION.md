---
phase: 3
slug: injected-panel-ui
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-03
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (via WXT's WxtVitest plugin) |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run --reporter=verbose` |
| **Estimated runtime** | ~8 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run --reporter=verbose`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 8 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | PANEL-01 | manual+build | `npx wxt build` | N/A | ⬜ pending |
| 03-01-02 | 01 | 1 | PANEL-02, PANEL-06 | manual | Live portal | N/A | ⬜ pending |
| 03-02-01 | 02 | 2 | PANEL-03, PANEL-05 | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 03-02-02 | 02 | 2 | PANEL-04 | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 03-03-01 | 03 | 2 | UNMT-01, UNMT-04, UNMT-05 | unit+manual | `npx vitest run` | ❌ W0 | ⬜ pending |
| 03-03-02 | 03 | 2 | UNMT-02, UNMT-03 | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 03-03-03 | 03 | 2 | PANEL-07, PANEL-08 | unit | `npx vitest run` | ❌ W0 | ⬜ pending |

---

## Wave 0 Requirements

- [ ] `tests/panel-utils.test.ts` — stubs for currency extraction, VAT hint, category sorting, match pattern derivation
- [ ] `tests/panel.test.ts` — stubs for submission state machine, dry-run mode, bulk progress

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Shadow DOM panel renders on CK page | PANEL-01 | Requires live portal with CSS isolation | Load extension, navigate to ExpenseItems page, verify panel appears without CK CSS bleeding |
| Matched items display correctly | PANEL-02 | Visual layout verification | Check dates, amounts, categories render in correct positions |
| Inline form expands on unmatched items | UNMT-01 | DOM interaction in shadow root | Click [Assign & Submit], verify form fields appear |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 8s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
