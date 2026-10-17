// Ephemeral MV3 service worker: timers go through chrome.alarms, never setInterval (apps/extension/README.md).
export default defineBackground(() => {
  // The network recorder (P1-01) and session capture (P2) register their listeners here.
});
