/**
 * Turn MinerU's raw HTML into the plain text / markdown the rest of the app
 * expects, at the point content is SAVED rather than every time it is shown.
 *
 * MinerU wraps formulas in <eq>…</eq> and lays answer keys out as
 * <table><tr><td>. Stored as-is those tags travel into the AI grading prompt,
 * where they are noise, and into the database, where they are noise forever.
 */

function htmlTableToMarkdown(block: string): string {
  const rows = [...block.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => m[1])
  const grid = rows
    .map((r) => [...r.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => c[1].replace(/\s+/g, ' ').trim()))
    .filter((r) => r.length > 0)
  if (grid.length === 0) return block

  const width = Math.max(...grid.map((r) => r.length))
  const pad = (r: string[]) => [...r, ...Array(Math.max(0, width - r.length)).fill('')]
  const lines = [pad(grid[0]), Array(width).fill('---'), ...grid.slice(1).map(pad)]
  return '\n' + lines.map((r) => `| ${r.join(' | ')} |`).join('\n') + '\n'
}

export function normaliseMineruText(input: string): string {
  let out = String(input ?? '')

  // Formulas: MinerU's own tag, not $…$
  out = out.replace(/<eq[^>]*>([\s\S]*?)<\/eq>/gi, (_m, inner) => `$${String(inner).trim()}$`)
  // Answer keys laid out as tables
  out = out.replace(/<table[\s\S]*?<\/table>/gi, (block) => htmlTableToMarkdown(block))

  out = out.replace(/<br\s*\/?>/gi, '\n')
  out = out.replace(/<\/?(p|div|li|tr|h[1-6])[^>]*>/gi, '\n')
  // Whatever markup is left. Only a real tag is removed — a bare "<" (e.g. "a < b")
  // stays, because the next character has to be a letter, "/" or "!".
  out = out.replace(/<[a-zA-Z/!][^>]*>/g, '')

  out = out
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')

  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}
