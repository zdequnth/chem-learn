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

// Render bare \ce{...} commands that appear in plain text (outside math),
// leaving the rest of the text untouched.
function renderBareCe(text: string): string {
  let out = ''
  let rest = text
  while (rest.length > 0) {
    const idx = rest.indexOf('\\ce{')
    if (idx === -1) { out += rest; break }
    out += rest.slice(0, idx)
    rest = rest.slice(idx)
    let depth = 1
    let j = 4
    while (j < rest.length && depth > 0) {
      if (rest[j] === '{') depth++
      else if (rest[j] === '}') depth--
      j++
    }
    if (depth === 0) {
      out += tryRender(rest.slice(0, j), false)
      rest = rest.slice(j)
    } else {
      out += rest.slice(0, 4)
      rest = rest.slice(4)
    }
  }
  return out
}

function renderLatex(text: string): string {
  // Tokenize the text into plain-text / inline-math / display-math segments in a
  // single pass. (The old approach guessed whether a \ce{} was inside math by
  // counting $ signs, which broke inside $$...$$ blocks.)
  const segs: { type: 'text' | 'inline' | 'display'; content: string }[] = []
  let buf = ''
  let i = 0
  const flush = () => { if (buf) { segs.push({ type: 'text', content: buf }); buf = '' } }

  while (i < text.length) {
    if (text.startsWith('$$', i)) {
      const end = text.indexOf('$$', i + 2)
      if (end !== -1) { flush(); segs.push({ type: 'display', content: text.slice(i + 2, end) }); i = end + 2; continue }
    }
    if (text.startsWith('\\[', i)) {
      const end = text.indexOf('\\]', i + 2)
      if (end !== -1) { flush(); segs.push({ type: 'display', content: text.slice(i + 2, end) }); i = end + 2; continue }
    }
    if (text.startsWith('\\(', i)) {
      const end = text.indexOf('\\)', i + 2)
      if (end !== -1) { flush(); segs.push({ type: 'inline', content: text.slice(i + 2, end) }); i = end + 2; continue }
    }
    if (text[i] === '$') {
      const end = text.indexOf('$', i + 1)
      if (end !== -1 && !text.startsWith('$', i + 1)) { flush(); segs.push({ type: 'inline', content: text.slice(i + 1, end) }); i = end + 1; continue }
    }
    buf += text[i]
    i++
  }
  flush()

  return segs.map(seg => {
    if (seg.type === 'text') return renderBareCe(seg.content)
    if (seg.type === 'display') return tryRender(seg.content, true)
    // Inline math: wrap chemistry-looking content in \ce{} so it renders nicely
    const needsChemistry = /[A-Z][a-z]?\d|[\^_]/.test(seg.content) && !/\\[a-zA-Z]+/.test(seg.content)
    return tryRender(needsChemistry ? '\\ce{' + seg.content + '}' : seg.content, false)
  }).join('')
}

function basicMarkdown(text: string): string {
  let html = text
  // Markdown tables (wrapped so wide tables can scroll horizontally)
  html = html.replace(/(\|[^\n]+\|\n\|[-:|\s]+\|\n(?:\|[^\n]+\|\n?)+)/g, (match) => {
    const lines = match.trim().split('\n').filter(l => l.includes('|'))
    if (lines.length < 2) return match
    // Skip separator line (|---|---|)
    const rows = lines.filter(l => !/^[\|\s\-:]+\|[\|\-:\s]+$/.test(l))
    const cells = rows.map(r => r.split('|').filter(c => c.trim()).map(c => c.trim()))
    if (cells.length === 0) return match
    const thead = `<thead class="bg-gray-100"><tr>${cells[0].map(c => `<th class="px-3 py-2 text-left text-xs font-medium border">${c}</th>`).join('')}</tr></thead>`
    const tbody = cells.length > 1
      ? `<tbody>${cells.slice(1).map(r => `<tr>${r.map(c => `<td class="px-3 py-1.5 text-xs border">${c}</td>`).join('')}</tr>`).join('')}</tbody>`
      : ''
    return `<div class="overflow-x-auto my-2"><table class="w-full border-collapse border rounded-lg">${thead}${tbody}</table></div>`
  })

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
