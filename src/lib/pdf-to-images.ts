'use client'

/**
 * Turn a PDF into one image per page, in the browser.
 *
 * Rendering here rather than on the server means no native PDF engine has to
 * ship with the deployment — and, more to the point for the teachers, uploading
 * a PDF just works: no command line, nothing to install. The pages then go into
 * the same upload path the screenshots already use.
 *
 * The pdf.js worker is served from /public (a copy of the one in
 * node_modules/pdfjs-dist/build). It has to be the SAME version as the library,
 * so re-copy it if pdfjs-dist is ever upgraded.
 */
export async function pdfToPageFiles(
  file: File,
  opts: { maxPages?: number; scale?: number; onProgress?: (done: number, total: number) => void } = {},
): Promise<File[]> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

  const data = new Uint8Array(await file.arrayBuffer())
  const doc = await pdfjs.getDocument({ data }).promise
  const total = Math.min(doc.numPages, opts.maxPages ?? 80)
  const scale = opts.scale ?? 2
  const base = file.name.replace(/\.pdf$/i, '')
  const out: File[] = []

  try {
    for (let i = 1; i <= total; i++) {
      const page = await doc.getPage(i)
      const viewport = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('浏览器不支持 canvas，无法转换 PDF')
      // A PDF page is transparent where it has no ink; without this the JPEG
      // comes out with black where the paper should be.
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvas, canvasContext: ctx, viewport }).promise
      page.cleanup()

      const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.85))
      if (blob) {
        out.push(new File([blob], `${base}-${String(i).padStart(2, '0')}.jpg`, { type: 'image/jpeg' }))
      }
      opts.onProgress?.(i, total)
    }
  } finally {
    // pdf.js 6 types do not declare destroy(), but the runtime has it.
    await (doc as any).destroy?.().catch?.(() => {})
  }
  return out
}
