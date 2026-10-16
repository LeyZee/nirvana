import { defineConfig, type UserManifest } from 'wxt';

// Manifest V3. Host permissions stay limited to Reveal (apps/extension/README.md).
export const manifest = {
  name: 'Nirvana',
  description: "Capture de session et enregistreur d'API pour Nirvana.",
  host_permissions: ['*://*.reveal.me/*'],
} satisfies UserManifest;

export default defineConfig({
  srcDir: 'src',
  manifest,
});
