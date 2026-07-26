'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { Button } from '@/components/ui/primitives'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISSED_KEY = 'p2ak.install-dismissed'

/**
 * Install prompt for the share target.
 *
 * This is load-bearing, not a growth nag: a Web Share Target only registers
 * once the PWA is installed to the home screen. Uninstalled, the fastest path
 * in the app — screenshot, share, done — simply doesn't exist, and the user
 * has no way to know why.
 *
 * iOS is out of scope, which is exactly what makes this viable: on Android,
 * beforeinstallprompt gives a real, one-tap install.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(false)

  // Browser-only state, read through useSyncExternalStore rather than an
  // effect: the server snapshot keeps hydration honest, and the media query is
  // subscribed rather than sampled once, so installing mid-session hides this
  // without a reload.
  const standalone = useSyncExternalStore(
    subscribeToDisplayMode,
    () => window.matchMedia('(display-mode: standalone)').matches,
    () => true,
  )
  const previouslyDismissed = useSyncExternalStore(
    subscribeToStorage,
    () => window.localStorage.getItem(DISMISSED_KEY) === '1',
    () => true,
  )

  useEffect(() => {
    function onPrompt(event: Event) {
      event.preventDefault()
      setDeferred(event as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  if (standalone || previouslyDismissed || dismissed || !deferred) return null

  function dismiss() {
    window.localStorage.setItem(DISMISSED_KEY, '1')
    setDismissed(true)
  }

  return (
    <div className="rounded-[6px] border border-rule bg-paper-sunk p-3">
      <p className="text-sm font-medium">Install to share receipts straight in</p>
      <p className="mt-1 text-sm text-ink-45">
        Once it&rsquo;s on your home screen, Project2AK shows up in the Android share sheet.
        Screenshot a GCash receipt, share, done — two taps, without opening the app.
      </p>
      <div className="mt-3 flex gap-2">
        <Button
          variant="primary"
          onClick={async () => {
            await deferred.prompt()
            const { outcome } = await deferred.userChoice
            setDeferred(null)
            if (outcome === 'dismissed') dismiss()
          }}
        >
          Install
        </Button>
        <Button variant="quiet" onClick={dismiss}>
          Not now
        </Button>
      </div>
    </div>
  )
}

function subscribeToDisplayMode(onChange: () => void) {
  const query = window.matchMedia('(display-mode: standalone)')
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

function subscribeToStorage(onChange: () => void) {
  window.addEventListener('storage', onChange)
  return () => window.removeEventListener('storage', onChange)
}
