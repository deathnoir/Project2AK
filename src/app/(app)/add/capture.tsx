'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Card, CardHeader, Muted } from '@/components/ui/primitives'
import { InstallPrompt } from './install-prompt'
import { downscaleImage, isAcceptedImage } from '@/lib/image/downscale'
import { ingestReceipt } from '@/server/actions/receipts'

/**
 * Capture paths, in the order they matter.
 *
 * 1. Share target — the primary path, and the reason the install prompt is not
 *    decoration. Handled by /add/share, not here.
 * 2. Camera, for paper receipts.
 * 3. Clipboard paste, on desktop.
 * 4. File picker, multi-select, for batch catch-up.
 */
export function Capture({ extractionAvailable }: { extractionAvailable: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [status, setStatus] = useState<string | null>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const pickerRef = useRef<HTMLInputElement>(null)

  function send(files: File[]) {
    if (files.length === 0) return
    setStatus(files.length === 1 ? 'Reading the receipt…' : `Reading ${files.length} receipts…`)

    startTransition(async () => {
      let firstId: string | null = null
      for (const file of files) {
        try {
          // Downscale before upload: the model downscales above 1568px
          // anyway, so this is free accuracy-wise and saves the round trip.
          const { blob } = await downscaleImage(file)
          const formData = new FormData()
          formData.append('image', new File([blob], 'receipt.jpg', { type: 'image/jpeg' }))
          const result = await ingestReceipt(formData)
          if (result.ok && !firstId) firstId = result.receiptId
        } catch {
          setStatus('That image could not be read. Try the camera instead.')
          return
        }
      }
      setStatus(null)
      if (firstId) router.push(`/add/review/${firstId}`)
    })
  }

  // Desktop: paste a screenshot anywhere on the Add screen.
  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      const items = Array.from(event.clipboardData?.files ?? []).filter(isAcceptedImage)
      if (items.length === 0) return
      event.preventDefault()
      send(items as File[])
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
    // send is stable enough for this listener's lifetime; re-binding on every
    // keystroke elsewhere in the form would drop an in-flight paste.

  }, [])

  return (
    <Card>
      <CardHeader
        title="Receipt"
        hint={
          extractionAvailable
            ? 'Share a screenshot, snap a photo, or paste one'
            : 'Saved and attached — you’ll enter the details by hand'
        }
      />
      <div className="space-y-3 p-3">
        <InstallPrompt />

        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => cameraRef.current?.click()} disabled={pending}>
            Camera
          </Button>
          <Button onClick={() => pickerRef.current?.click()} disabled={pending}>
            Choose images
          </Button>
        </div>

        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => send(Array.from(e.target.files ?? []))}
        />
        <input
          ref={pickerRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={(e) => send(Array.from(e.target.files ?? []))}
        />

        {status ? (
          <p className="text-sm text-ink-45" aria-live="polite">
            {status}
          </p>
        ) : (
          <Muted className="block text-xs">
            On a desktop you can paste a screenshot straight onto this screen.
          </Muted>
        )}
      </div>
    </Card>
  )
}
