# Stack Research

**Domain:** Chrome Manifest V3 browser extension — DOM manipulation, form automation, client-side data storage
**Researched:** 2026-04-03
**Confidence:** HIGH (Chrome official docs + WXT official docs + cross-verified ecosystem analysis)

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Manifest V3 | — | Extension platform | MV2 fully unsupported as of June 2025; MV3 is the only path to Chrome Web Store |
| TypeScript | 5.x | Language | Type safety for chrome APIs (@types/chrome), catches field name typos in form payloads before runtime |
| WXT Framework | 0.20.x | Build framework | Active maintenance (7.9k stars), Vite-based, file-based entrypoints, content script HMR, built-in storage/messaging utilities — replaces manual webpack/manifest wiring |
| Vite | 6.x (via WXT) | Bundler | WXT uses Vite internally; fastest HMR for content script development iteration |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @types/chrome | latest | TypeScript types for Chrome extension APIs | Always — prevents runtime errors from mistyped API calls |
| wxt/storage | (WXT built-in) | Type-safe chrome.storage wrapper with schema | Use instead of raw chrome.storage.sync; provides reactive updates and versioned migrations |
| wxt/messaging | (WXT built-in) | Type-safe message passing between contexts | Use for popup ↔ content script and service worker ↔ content script communication |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| WXT CLI (`wxt dev`) | Development server with HMR | Automatically reloads content scripts in the target tab on save — critical for iteration speed |
| WXT CLI (`wxt build`) | Production build | Outputs a zipped extension ready for Chrome Web Store upload |
| Chrome DevTools | Inspect injected panel, debug content script | Use Sources > Content scripts panel; service worker debugging under chrome://extensions |
| `@types/chrome` | TypeScript intellisense | Install as dev dep; WXT configures tsconfig automatically |

## Installation

```bash
# Bootstrap with WXT (creates project structure)
npx wxt@latest init ck-expense-automator
# Choose: TypeScript, no UI framework (vanilla TS for content script)

# Or add to existing project
npm install -D wxt

# Types for Chrome APIs (usually included by WXT but verify)
npm install -D @types/chrome
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| WXT | CRXJS Vite Plugin | If you have a complex existing Vite config and need minimal framework overhead; note CRXJS was in beta 3+ years and has maintenance uncertainty |
| WXT | Plasmo | Avoid — appears to be in maintenance mode (no active maintainers as of 2025), uses outdated Parcel bundler |
| WXT | Manual webpack | Only if you already have deep webpack expertise and need a non-standard setup; WXT eliminates all the boilerplate |
| chrome.storage.sync | IndexedDB | If rule count grows beyond ~50 rules (each rule ~200-400 bytes; 100KB total budget); IndexedDB has no quota limit but loses cross-device sync |
| Shadow DOM (for panel) | iframe with chrome-extension:// page | Shadow DOM is simpler and sufficient for CSS isolation; iframe approach adds complexity but is more isolated if the portal injects aggressive global CSS |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Plasmo | Maintenance mode, no active development, Parcel-based (outdated bundler) | WXT |
| Manifest V2 | Fully unsupported on Chrome Web Store since June 2025 | Manifest V3 |
| React/Vue in content script | Adds 40-80KB to the injected content script payload; the panel UI is simple enough for vanilla TypeScript DOM construction | Vanilla TypeScript DOM manipulation with Shadow DOM |
| React/Vue in service worker | Frameworks have no DOM in a service worker context; adds dead weight | Vanilla TypeScript |
| `eval()` or remote scripts | Prohibited by MV3 CSP — will cause extension rejection | Bundle all code locally |
| `chrome.storage.local` for rules | Rules won't sync across devices; defeats the "install from Web Store, rules follow you" UX goal | `chrome.storage.sync` |
| `setInterval` keep-alive hacks in service worker | Unreliable and adds complexity; service worker wake-up is event-driven by design in MV3 | Design background.js as event-driven; this extension has no long-running background task needs |

## Stack Patterns by Variant

**For the content script (injected panel on CK portal):**
- Use vanilla TypeScript, no UI framework
- Construct DOM imperatively or with a minimal template-string helper
- Wrap the panel in `attachShadow({ mode: 'open' })` on a host element to isolate styles from the CK portal's existing CSS
- Load the panel CSS as a `<style>` element injected into the shadow root

**For the popup (extension icon click):**
- Plain HTML + TypeScript is sufficient (popup is a small status + navigation UI)
- WXT entrypoint: `entrypoints/popup.html` + `entrypoints/popup/index.ts`

**For the options page (rule management):**
- Plain HTML + TypeScript
- WXT entrypoint: `entrypoints/options.html` + `entrypoints/options/index.ts`
- Consider a thin reactive pattern (manual event listeners on storage.onChanged) rather than a full framework

**For the service worker (background.js):**
- Vanilla TypeScript only
- This extension's background needs are minimal (badge text updates, message routing)
- Service workers terminate after ~30s idle — design as pure event handlers, no state stored in memory

**If chrome.storage.sync quota becomes a concern (>50 rules):**
- Split the rules array across multiple storage keys (e.g. `rules_0`, `rules_1`, chunks of 10-15 rules per key)
- Each key stays under the 8KB per-item limit
- WXT's storage module handles key namespacing cleanly

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| WXT 0.20.x | Vite 6.x | WXT pins its own Vite version; don't install Vite separately |
| WXT 0.20.x | TypeScript 5.x | WXT configures tsconfig; compatible with TS 5.0+ |
| @types/chrome latest | TypeScript 5.x | Always use latest — Chrome API types track current API surface |
| WXT 0.20.x | Chrome 120+ | WXT targets modern Chrome; MV3 APIs require Chrome 88+, most modern APIs require 120+ |

## Storage Quota Planning

For this project, `chrome.storage.sync` limits are:
- Total: **102,400 bytes** (~100 KB)
- Per item: **8,192 bytes** (8 KB)
- Max items: **512**

Each `ExpenseRule` object serialises to approximately 200-500 bytes of JSON. A user with 30 rules would use ~15 KB — well within the 100 KB total limit. The 8 KB per-item limit is the practical constraint: storing all rules in a single key limits the set to ~15-20 rules before hitting the per-item cap. **Store rules as an array split across keyed chunks, or use one key per rule** (rule UUID → rule object), keeping each key under 8 KB.

## Sources

- [Chrome Manifest V3 Official Docs](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3) — MV3 prohibitions, service worker constraints (HIGH confidence)
- [chrome.storage API Reference](https://developer.chrome.com/docs/extensions/reference/api/storage) — quota limits verified (HIGH confidence)
- [WXT Official Framework Comparison](https://wxt.dev/guide/resources/compare) — WXT v0.20.20 feature matrix vs Plasmo vs CRXJS (HIGH confidence)
- [The 2025 State of Browser Extension Frameworks](https://redreamality.com/blog/the-2025-state-of-browser-extension-frameworks-a-comparative-analysis-of-plasmo-wxt-and-crxjs/) — ecosystem analysis, Plasmo maintenance status, WXT community health (MEDIUM confidence)
- [CRXJS Unmaintained Discussion](https://github.com/crxjs/chrome-extension-tools/discussions/872) — maintenance gap history (MEDIUM confidence)
- [Shadow DOM for Extension Style Isolation](https://sweets.chat/blog/article/isolating-styles-in-chrome-extensions-with-shadow-dom) — content script UI isolation pattern (MEDIUM confidence)
- [WXT Content Scripts Documentation](https://wxt.dev/guide/essentials/content-scripts) — file-based entrypoints, TypeScript integration (HIGH confidence)

---
*Stack research for: Chrome Manifest V3 extension — CK Expense Automator*
*Researched: 2026-04-03*
