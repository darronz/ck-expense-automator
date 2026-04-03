// entrypoints/background.ts
// Service worker — seeds DEFAULT_RULES on first install.

import { DEFAULT_RULES } from '../lib/rules-store';

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install') {
      const existing = await browser.storage.sync.get('rules');
      if (!existing['rules']) {
        await browser.storage.sync.set({ rules: DEFAULT_RULES });
        console.log('[CK Expense Automator] Default rules seeded:', DEFAULT_RULES.length);
      }
    }
  });
});
