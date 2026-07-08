'use client'

import katex from 'katex'
import 'katex/dist/contrib/mhchem.mjs'
import { useMemo } from 'react'

function tryRender(formula: string, displayMode: boolean): string {
  try {
    return katex.renderToString(formula, { throwOnError: false, displayMode })
  } catch {
    // If \ce fails (e.g. mhchem not loaded), try plain math mode
    const stripped = formula.replace(/^\\ce\{/, '').replace(/\}$/, '')
    if (stripped !== formula) {
      try {
        return katex.renderToString(stripped, { throwOnError: false, displayMode })
      } catch { return formula }
    }
    return formula
  }
}

function renderLatex(text: string): string {
  // Split text by $...$ and $$...$$ delimiters, also handle bare \ce{...}
  const segments: { type: 'text' | 'inline' | 'display' | 'ce'; content: string }[] = []
  let remaining = text

  while (remaining.length > 0) {
    // Find the earliest match: $$, $, or \ce{
    const dd = remaining.indexOf('$$')
    const sd = remaining.indexOf('$')
    const ce = remaining.indexOf('\\ce{')

    // Find earliest occurrence
    const candidates: { idx: number; type: 'display' | 'inline' | 'ce' }[] = []
    if (dd !== -1) candidates.push({ idx: dd, type: 'display' })
    if (sd !== -1) candidates.push({ idx: sd, type: 'inline' })
    if (ce !== -1) candidates.push({ idx: ce, type: 'ce' })
    candidates.sort((a, b) => a.idx - b.idx)

    if (candidates.length === 0) {
      segments.push({ type: 'text', content: remaining })
      break
    }

    const first = candidates[0]

    // Text before the match
    if (first.idx > 0) {
      segments.push({ type: 'text', content: remaining.slice(0, first.idx) })
    }

    if (first.type === 'display') {
      const end = remaining.indexOf('$$', first.idx + 2)
      if (end !== -1) {
        segments.push({ type: 'display', content: remaining.slice(first.idx + 2, end) })
        remaining = remaining.slice(end + 2)
      } else {
        segments.push({ type: 'text', content: remaining.slice(first.idx) })
        break
      }
    } else if (first.type === 'inline') {
      const end = remaining.indexOf('$', first.idx + 1)
      if (end !== -1) {
        segments.push({ type: 'inline', content: remaining.slice(first.idx + 1, end) })
        remaining = remaining.slice(end + 1)
      } else {
        segments.push({ type: 'text', content: remaining.slice(first.idx) })
        break
      }
    } else if (first.type === 'ce') {
      // Find matching } with brace counting
      let depth = 1
      let j = first.idx + 4
      while (j < remaining.length && depth > 0) {
        if (remaining[j] === '{') depth++
        else if (remaining[j] === '}') depth--
        j++
      }
      if (depth === 0) {
        segments.push({ type: 'ce', content: remaining.slice(first.idx, j) })
        remaining = remaining.slice(j)
      } else {
        segments.push({ type: 'text', content: remaining.slice(first.idx, first.idx + 4) })
        remaining = remaining.slice(first.idx + 4)
      }
    }
  }

  // Render segments
  return segments.map(seg => {
    if (seg.type === 'text') return seg.content
    if (seg.type === 'ce') return tryRender(seg.content, false)

    // $...$ or $$...$$: check if it looks like chemistry
    const needsChemistry = /[A-Z][a-z]?\d|[\^_]/.test(seg.content) && !/\\[a-zA-Z]+/.test(seg.content)
    const formula = needsChemistry ? '\\ce{' + seg.content + '}' : seg.content
    return tryRender(formula, seg.type === 'display')
  }).join('')
}

export function KatexHtml({ text }: { text: string }) {
  const html = useMemo(() => {
    // Convert double newlines to paragraphs, single newlines to <br>
    let content = text
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>')
    content = '<p>' + content + '</p>'
    let pdfUrl = ''
    const pdfMatch = content.match(/\[pdf\]([\s\S]*?)\[\/pdf\]/)
    if (pdfMatch) {
      pdfUrl = pdfMatch[1]
      content = content.replace(/\[pdf\][\s\S]*?\[\/pdf\]/, '')
    }

    // Pre-process markdown images: ![alt](url) → <img>
    content = content.replace(/!\[([^\]]*)\]\(([^)]+)\)/g,
      '<img src="$2" alt="$1" class="my-2 rounded-lg max-w-full max-h-64" />')

    let result = renderLatex(content)

    // Append PDF link button if url exists
    if (pdfUrl) {
      const displayName = pdfUrl.replace(/^https?:\/\//, '').split('/').slice(0, 3).join('/')
      result += `<a href="${pdfUrl}" target="_blank" rel="noopener noreferrer"
        class="inline-flex items-center gap-2 px-4 py-2 mt-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm font-medium hover:bg-red-100 no-underline">
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        打开 PDF 资料（新窗口）</a>`
    }

    return result
  }, [text])
  return <span dangerouslySetInnerHTML={{ __html: html }} />
}

/** Extract PDF URL from description */
export function getPdfUrl(text: string): string {
  const m = text.match(/\[pdf\]([\s\S]*?)\[\/pdf\]/)
  return m ? m[1] : ''
}

/** Strip PDF tag from description */
export function stripPdfTag(text: string): string {
  return text.replace(/\[pdf\][\s\S]*?\[\/pdf\]/, '').trim()
}

export function cleanOption(text: string): string {
  return text.replace(/^[A-D]\.\s*/, '')
}

export { renderLatex }
