/**
 * Client-side downscale before upload.
 *
 * Vision models downscale anything above ~1568px on the long edge anyway, so
 * doing it here costs nothing in accuracy and saves bandwidth on a phone
 * connection, storage in the bucket, and tokens on every extraction. It also
 * makes the share-target round trip fast, which matters because the user is
 * staring at a spinner inside the share sheet.
 */

export const MAX_EDGE = 1568
export const JPEG_QUALITY = 0.8

export interface DownscaledImage {
  blob: Blob
  mediaType: 'image/jpeg'
  width: number
  height: number
}

export async function downscaleImage(
  file: Blob,
  maxEdge = MAX_EDGE,
): Promise<DownscaledImage> {
  const bitmap = await createImageBitmap(file)
  try {
    const longEdge = Math.max(bitmap.width, bitmap.height)
    const scale = longEdge > maxEdge ? maxEdge / longEdge : 1
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas is unavailable in this browser.')
    // Receipts are text on a flat ground; high-quality resampling is what
    // keeps a reference number legible after the shrink.
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(bitmap, 0, 0, width, height)

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    )
    if (!blob) throw new Error('Could not encode the image.')

    return { blob, mediaType: 'image/jpeg', width, height }
  } finally {
    bitmap.close()
  }
}

/** Everything the share target and the file picker accept. */
export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

export function isAcceptedImage(file: Blob): boolean {
  return (ACCEPTED_TYPES as readonly string[]).includes(file.type)
}
