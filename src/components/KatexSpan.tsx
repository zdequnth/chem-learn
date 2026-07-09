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
  // Preprocess: replace bare \ce{...} with rendered HTML before segment parsing
  // This handles nested braces correctly via brace counting
  let preprocessed = ''
  let remaining = text
  while (remaining.length > 0) {
    const ceIdx = remaining.indexOf('\\ce{')
    if (ceIdx === -1) { preprocessed += remaining; break }
    preprocessed += remaining.slice(0, ceIdx)
    remaining = remaining.slice(ceIdx)
    // Brace count to find matching }
    let depth = 1
    let j = 4 // skip '\ce{'
    while (j < remaining.length && depth > 0) {
      if (remaining[j] === '{') depth++
      else if (remaining[j] === '}') depth--
      j++
    }
    if (depth === 0) {
      const formula = remaining.slice(0, j)
      preprocessed += tryRender(formula, false)
      remaining = remaining.slice(j)
    } else {
      preprocessed += remaining.slice(0, 4)
      remaining = remaining.slice(4)
    }
  }

  // Now parse the preprocessed text for $...$, $$...$$, \(...\), \[...\]
  const segments: { type: 'text' | 'inline' | 'display'; content: string }[] = []
  remaining = preprocessed

  while (remaining.length > 0) {
    // Find the earliest match: $$, $, \(, \[
    const dd = remaining.indexOf('$$')
    const sd = remaining.indexOf('$')
    const lp = remaining.indexOf('\\(')
    const bp = remaining.indexOf('\\[')

    // Each candidate: { idx, type, delim }
    type Candidate = { idx: number; type: 'display' | 'inline'; delim: string; endDelim: string; openLen: number }
    const candidates: Candidate[] = []
    if (dd !== -1) candidates.push({ idx: dd, type: 'display', delim: '$$', endDelim: '$$', openLen: 2 })
    if (sd !== -1) candidates.push({ idx: sd, type: 'inline', delim: '$', endDelim: '$', openLen: 1 })
    if (lp !== -1) candidates.push({ idx: lp, type: 'inline', delim: '\\(', endDelim: '\\)', openLen: 2 })
    if (bp !== -1) candidates.push({ idx: bp, type: 'display', delim: '\\[', endDelim: '\\]', openLen: 2 })
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

    // inline or display: search for end delimiter
    const endIdx = remaining.indexOf(first.endDelim, first.idx + first.openLen)
    if (endIdx !== -1) {
      segments.push({ type: first.type, content: remaining.slice(first.idx + first.openLen, endIdx) })
      remaining = remaining.slice(endIdx + first.endDelim.length)
    } else {
      segments.push({ type: 'text', content: remaining.slice(first.idx, first.idx + first.openLen) })
      remaining = remaining.slice(first.idx + first.openLen)
    }
  }

  // Render segments
  return segments.map(seg => {
    if (seg.type === 'text') return seg.content

    // $...$ or $$...$$: check if it looks like chemistry
    const needsChemistry = /[A-Z][a-z]?\d|[\^_]/.test(seg.content) && !/\\[a-zA-Z]+/.test(seg.content)
    const formula = needsChemistry ? '\\ce{' + seg.content + '}' : seg.content
    return tryRender(formula, seg.type === 'display')
  }).join('')
}

function basicMarkdown(text: string): string {
  let html = text
  // Headings (### Title)
  html = html.replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold mt-3 mb-1">$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2 class="text-lg font-semibold mt-3 mb-1">$1</h2>')
  html = html.replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold mt-4 mb-2">$1</h1>')
  // Bold and italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')
  // Unordered lists
  html = html.replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
  html = html.replace(/(<li[^>]*>.*<\/li>\n?)+/g, '<ul class="my-1">$&</ul>')
  // Double newlines to paragraphs, single newlines to <br>
  html = html.replace(/\n\n/g, '</p><p>')
  html = html.replace(/\n/g, '<br>')
  return '<p>' + html + '</p>'
}

export function KatexHtml({ text }: { text: string }) {
  const html = useMemo(() => {
    // 1. Extract PDF from original text FIRST
    let pdfTitle = 'PDF 资料'
    let pdfUrl = ''
    let content = text
    const pdfMatch = content.match(/\[pdf(?::([^\]]*))?\]([\s\S]*?)\[\/pdf\]/)
    if (pdfMatch) {
      pdfTitle = pdfMatch[1] || 'PDF 资料'
      pdfUrl = pdfMatch[2] || pdfMatch[1] || ''
      content = content.replace(/\[pdf[\s\S]*?\[\/pdf\]/, '')
    }
    // 2. Apply basic markdown to clean content
    content = basicMarkdown(content)

    // Pre-process markdown images: ![alt](url) → <img>
    content = content.replace(/!\[([^\]]*)\]\(([^)]+)\)/g,
      '<img src="$2" alt="$1" class="my-2 rounded-lg max-w-full max-h-64" />')

    let result = renderLatex(content)

    // Append PDF card if url exists
    if (pdfUrl) {
      result += `<div class="mt-3 border rounded-lg p-3 bg-red-50 border-red-200">
        <div class="text-sm font-medium text-red-800 mb-1">📄 PDF 资料</div>
        <a href="${pdfUrl}" target="_blank" rel="noopener noreferrer"
          class="inline-flex items-center gap-1 text-sm text-red-600 hover:text-red-800 no-underline">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          ${pdfTitle}</a>
      </div>`
    }

    return result
  }, [text])
  return <span dangerouslySetInnerHTML={{ __html: html }} />
}

/** Extract PDF URL from description (supports [pdf]URL[/pdf] and [pdf:Title]URL[/pdf]) */
export function getPdfUrl(text: string): string {
  const m = text.match(/\[pdf(?::[^\]]*)?\]([\s\S]*?)\[\/pdf\]/)
  return m ? m[1] : ''
}

/** Strip PDF tag from description */
export function stripPdfTag(text: string): string {
  return text.replace(/\[pdf[\s\S]*?\[\/pdf\]/, '').trim()
}

export function cleanOption(text: string): string {
  return text.replace(/^[A-D]\.\s*/, '')
}

export { renderLatex }
