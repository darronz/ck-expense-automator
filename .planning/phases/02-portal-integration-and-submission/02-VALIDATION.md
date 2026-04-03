---
phase: 2
slug: portal-integration-and-submission
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-03
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (via WXT's WxtVitest plugin) |
| **Config file** | vitest.config.ts |
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
| 02-01-01 | 01 | 1 | PORT-02 | manual | Live portal test | N/A | ⬜ pending |
| 02-01-02 | 01 | 1 | PORT-03 | unit+manual | `npx vitest run` | ❌ W0 | ⬜ pending |
| 02-02-01 | 02 | 2 | PORT-04 | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 02-02-02 | 02 | 2 | PORT-05 | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 02-02-03 | 02 | 2 | PORT-06 | unit | `npx vitest run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/ck-api.test.ts` — stubs for parseValidationErrors, detectSessionExpiry, parseSuspenseItem
- [ ] Existing test infrastructure from Phase 1 covers vitest setup

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Payment Type trigger reveals DataTable | PORT-02 | Requires live CK portal with active session | Set Payment Type to "Business account", tick Suspense Items, verify DataTable appears |
| Row iteration reads all suspense items | PORT-03 | Requires live DataTable with real data | Verify all rows extracted with correct IDs, dates, descriptions, amounts |
| Form left clean after iteration | PORT-03 | Requires live form state inspection | After extraction, verify no rows selected and MappedSuspenseItemIds is empty |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
