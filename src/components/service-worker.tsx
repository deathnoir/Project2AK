'use client'

import { useEffect } from 'react'

/**
 * Registers the service worker.
 *
 * This is load-bearing for the receipt feature, not a nicety: a Web Share
 * Target is only honoured for an installed PWA, and the manifest is only
 * honoured when a service worker is registered. The worker itself does
 * nothing in v1 — offline queueing is a later concern.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    if (process.env.NODE_ENV !== 'production') return
    const register = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        // A failed registration costs the share target, not the app. The
        // install prompt surfaces the consequence; don't interrupt here.
      })
    }
    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register, { once: true })
  }, [])

  return null
}
