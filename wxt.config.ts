import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'CK Expense Automator',
    description: 'Automate expense claim entry on the Churchill Knight portal',
    permissions: ['storage', 'activeTab', 'tabs'],
    host_permissions: ['https://portal.churchill-knight.co.uk/*'],
  },
});
