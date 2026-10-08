/**
 * A multi-part question is a run of consecutive questions carrying the same
 * shared stem — "第 1 题" with parts (a)(b)(c).
 *
 * Grouping by contiguity rather than by an id means the parser never has to
 * invent ids, and a group cannot straddle a batch: the splitter breaks on
 * question starts, and "(a)" does not match that pattern, so a whole big
 * question always lands in one chunk.
 */
export interface QGroup<T> {
  start: number
  items: T[]
}

export function groupByStem<T extends { groupStem?: string | null }>(qs: T[]): QGroup<T>[] {
  const out: QGroup<T>[] = []
  let i = 0
  while (i < qs.length) {
    const stem = (qs[i].groupStem || '').trim()
    if (!stem) {
      out.push({ start: i, items: [qs[i]] })
      i++
      continue
    }
    let j = i + 1
    while (j < qs.length && (qs[j].groupStem || '').trim() === stem) j++
    out.push({ start: i, items: qs.slice(i, j) })
    i = j
  }
  return out
}

/** "3a" inside a multi-part question; plain "3" when it stands alone. */
export function partLabel(groupIdx: number, subIdx: number, size: number): string {
  return size > 1 ? `${groupIdx + 1}${String.fromCharCode(97 + subIdx)}` : `${groupIdx + 1}`
}

/** questionId → index of its group, for showing the shared stem. */
export function groupIndexOf<T extends { questionId: string }>(groups: QGroup<T>[]): Map<string, number> {
  const m = new Map<string, number>()
  groups.forEach((g, gi) => g.items.forEach((q) => m.set(q.questionId, gi)))
  return m
}
