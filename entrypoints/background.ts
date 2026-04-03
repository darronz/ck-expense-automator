// entrypoints/background.ts
// Service worker — seeds DEFAULT_RULES on first install.

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install') {
      const existing = await browser.storage.sync.get('rules');
      if (!existing['rules']) {
        await browser.storage.sync.set({ rules: [] });
        // Empty rule set — user imports via Options page
      }
    }
  });
});
