'use client'

/**
 * Shrink an image in the BROWSER before it is uploaded.
 *
 * The illustrations a teacher adds are screenshots and photos, easily 10–20 MB,
 * and those used to be turned away with "please shrink it with a screenshot
 * tool" — a silly thing to ask of someone who just pasted a picture. Shrinking
 * on the server cannot help: the upload route sits behind Vercel's 4.5 MB
 * request-body limit, so a big file never reaches the code that would resize it.
 * So the picture is stepped down here, and what goes up is already small.
 *
 * Tries smaller pixel sizes first, then lower JPEG quality, and gives up by
 * returning the original (the server still has its own limit and message).
 */
export async function shrinkImageFile(file: File, maxBytes = 1024 * 1024): Promise<File> {
  if (file.size <= maxBytes) return file
  const bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) return file

  const widths = [1800, 1400, 1100, 800, 600]
  const qualities = [0.82, 0.7, 0.58]
  try {
    for (const maxWidth of widths) {
      const scale = Math.min(1, maxWidth / bitmap.width)
      const w = Math.max(1, Math.round(bitmap.width * scale))
      const h = Math.max(1, Math.round(bitmap.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) return file
      // JPEG has no transparency, and a white background is what these look like anyway
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, w, h)
      ctx.drawImage(bitmap, 0, 0, w, h)
      for (const quality of qualities) {
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
        if (blob && blob.size <= maxBytes) {
          return new File([blob], 'image.jpg', { type: 'image/jpeg' })
        }
      }
    }
  } finally {
    bitmap.close?.()
  }
  return file
}
