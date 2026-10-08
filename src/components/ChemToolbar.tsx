'use client'

import { useRef } from 'react'

// Sub/superscripts a plain textarea cannot type. Inserting the real Unicode
// characters keeps the answer unambiguous — "10-4" could read as subtraction,
// "10⁻⁴" cannot — and stays plain text, so no rendering is needed and the AI
// grader reads it the same way a person does.
const SUB = '₀₁₂₃₄₅₆₇₈₉₊₋'.split('')
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻ⁿ'.split('')
const SYMBOLS = ['→', '⇌', '×', '≈', '°', '·', 'Δ', 'μ']

/**
 * Wraps a textarea and inserts symbols at the caret. Pass the textarea through
 * `children` and the current value/setter via the props.
 */
export default function ChemToolbar({
  value, onChange, textareaRef,
}: {
  value: string
  onChange: (next: string) => void
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
}) {
  const btn = 'w-6 h-6 rounded border text-xs hover:bg-accent transition-colors'

  const insert = (s: string) => {
    const el = textareaRef.current
    if (!el) { onChange(value + s); return }
    const start = el.selectionStart ?? value.length
    const end = el.selectionEnd ?? start
    onChange(value.slice(0, start) + s + value.slice(end))
    // Put the caret back after the inserted character, or the next click lands
    // wherever the browser decides.
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + s.length, start + s.length)
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      <div className="flex items-center gap-0.5">
        <span className="text-muted-foreground mr-0.5">下标</span>
        {SUB.map((c) => <button key={c} type="button" onClick={() => insert(c)} className={btn}>{c}</button>)}
      </div>
      <div className="flex items-center gap-0.5">
        <span className="text-muted-foreground mr-0.5">上标</span>
        {SUP.map((c) => <button key={c} type="button" onClick={() => insert(c)} className={btn}>{c}</button>)}
      </div>
      <div className="flex items-center gap-0.5">
        {SYMBOLS.map((c) => <button key={c} type="button" onClick={() => insert(c)} className={btn}>{c}</button>)}
      </div>
    </div>
  )
}
