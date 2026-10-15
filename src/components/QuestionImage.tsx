'use client'

import { useState } from 'react'
import { X } from 'lucide-react'

/**
 * One size rule for every question figure in the app.
 *
 * The old per-page caps (160px here, 288px there) squeezed a high-resolution
 * screenshot down to a thumbnail: the file was perfectly readable, the display
 * was not. So: fit the column, cap only the genuinely tall, and let a click open
 * it full size. Size is never guessed from the pixel count — a 300px crop of a
 * small structure and a 2400px scan want opposite treatment from the same number.
 */
export const QUESTION_IMAGE_CLASS = 'rounded-lg border bg-white max-w-full h-auto max-h-[70vh]'

export default function QuestionImage({ src, alt = '', className = '' }: { src: string; alt?: string; className?: string }) {
  const [zoom, setZoom] = useState(false)
  if (!src) return null
  return (
    <>
      <button type="button" onClick={() => setZoom(true)} title="点一下放大"
        className={`block cursor-zoom-in ${className}`}>
        <img src={src} alt={alt} className={QUESTION_IMAGE_CLASS} />
      </button>
      {/* Closes only by its own button — clicking the backdrop must not dismiss
          it, same rule as every other dialog in the app. */}
      {zoom && (
        <div className="fixed inset-0 z-[110] bg-black/85 flex flex-col">
          <div className="flex justify-end p-3 shrink-0">
            <button type="button" onClick={() => setZoom(false)}
              className="flex items-center gap-1 text-sm text-white bg-white/10 hover:bg-white/20 rounded-lg px-3 py-1.5">
              <X className="w-4 h-4" /> 关闭
            </button>
          </div>
          <div className="flex-1 overflow-auto p-4 flex justify-center items-start">
            <img src={src} alt={alt} className="rounded-lg bg-white" />
          </div>
        </div>
      )}
    </>
  )
}
