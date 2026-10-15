/**
 * Some papers lay the options out as a table — A/B/C/D one per row, next to the
 * values they stand for. The model reads that table as part of the question and
 * copies it into the stem, AND emits the options properly, so the student would
 * see the same thing twice.
 *
 * Telling it not to was not enough, so drop it here. The check is deliberately
 * strict: the first column must be exactly A, B, C, D… in order, at least four
 * of them. A data table that happens to start with a substance labelled "A"
 * will not match, and if one somehow does, the table simply stays in the stem —
 * the safer of the two failures.
 */
export function stripOptionTable(stem: string): string {
  const lines = stem.split('\n')
  const out: string[] = []
  let i = 0

  while (i < lines.length) {
    const isRow = /^\s*\|/.test(lines[i])
    const isSep = i + 1 < lines.length && /^\s*\|[\s\-:|]+\|\s*$/.test(lines[i + 1])
    if (!isRow || !isSep) {
      out.push(lines[i])
      i++
      continue
    }

    let j = i + 2
    while (j < lines.length && /^\s*\|/.test(lines[j])) j++
    const labels = lines.slice(i + 2, j).map((l) => (l.split('|')[1] ?? '').trim().toUpperCase())
    const wanted = 'ABCDEFGH'.slice(0, labels.length)

    if (!(labels.length >= 4 && labels.join('') === wanted)) out.push(...lines.slice(i, j))
    i = j
  }

  return stripTrailingOptionLines(out).join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

// Options can also be laid out one per LINE ("A $H_2(g) + …$", "B …"), which the
// model copies into the stem as well. A line only counts when the letter is
// followed by a separator or by something that is clearly not prose — a line
// starting "A solution of …" is a sentence, not option A.
const OPTION_LINE = /^\s*\**\s*([A-H])(?:[.、)．:]\s*\S|\s+[$([{'"\\])/

/**
 * Drop the copy of the option block from the end of the stem. Only a run of at
 * least four that reads A, B, C, D … in order, and only at the very end, so a
 * lettered list inside the question text is left alone. Never strips the stem
 * down to nothing.
 */
function stripTrailingOptionLines(lines: string[]): string[] {
  let end = lines.length
  while (end > 0 && lines[end - 1].trim() === '') end--
  let start = end
  while (start > 0 && OPTION_LINE.test(lines[start - 1])) start--
  const run = lines.slice(start, end).map((l) => (l.match(OPTION_LINE)?.[1] ?? '').toUpperCase())
  const wanted = 'ABCDEFGH'.slice(0, run.length)
  if (run.length < 4 || run.join('') !== wanted) return lines
  const kept = lines.slice(0, start)
  return kept.some((l) => l.trim() !== '') ? kept : lines
}

/**
 * An option whose content is a one-row table — header "| | x | y | z |" then
 * "| C | 3 | 1 | 5 |" — draws as its own little table, header and all, four
 * times over across one question. Collapse it to a single readable line,
 * "x = 3, y = 1, z = 5", dropping the letter column: that is the paper's own
 * label, and it stops being true the moment the options are shuffled.
 */
export function collapseOptionTable(text: string): string {
  const lines = String(text ?? '').split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length !== 3) return text
  if (!/^\|/.test(lines[0]) || !/^\|[\s\-:|]+\|$/.test(lines[1]) || !/^\|/.test(lines[2])) return text

  const cells = (l: string) => l.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())
  const header = cells(lines[0])
  const row = cells(lines[2])
  if (header.length !== row.length || row.length < 2) return text
  const labels = header.slice(1)
  const values = row.slice(1)
  if (values.some((v) => v === '')) return text
  return labels.map((label, i) => (label ? `${label} = ${values[i]}` : values[i])).join('；')
}
