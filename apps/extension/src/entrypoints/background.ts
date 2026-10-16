import { defineBackground } from 'wxt/utils/define-background';

// Ephemeral MV3 service worker: chrome.alarms only, no setInterval (apps/extension/README.md).
export default defineBackground(() => {
  // The API recorder arrives with P1-01, session capture in phase 2.
});
