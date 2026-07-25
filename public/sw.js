/*
 * Project2AK service worker.
 *
 * It exists so the manifest is honoured — a Web Share Target only registers
 * for an installed PWA, and installability requires a registered worker.
 * Deliberately does nothing else in v1: offline queueing of transactions is a
 * later concern, and a half-built offline cache that serves a stale balance
 * is worse than no offline support at all.
 */

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// No fetch handler on purpose. Adding a pass-through `fetch` listener that
// just calls fetch(event.request) measurably slows every request and buys
// nothing.
