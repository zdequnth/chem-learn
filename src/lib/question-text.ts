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

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}
