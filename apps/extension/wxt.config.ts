import { defineConfig } from 'wxt';

// Manifest V3. Host permissions stay limited to Reveal (apps/extension/README.md).
export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: 'Nirvana',
    description: 'Connecte Reveal à Nirvana.',
    host_permissions: ['*://*.reveal.me/*'],
  },
});
