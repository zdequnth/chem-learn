/**
 * A multi-part question is "第 1 题" with parts (a)(b)(c). The parts carry the
 * big question's number as `groupRef`; consecutive questions sharing one are a
 * group.
 *
 * The ref comes from the paper's own numbering rather than from comparing the
 * shared text — the number is printed on the paper, so the model can copy it,
 * whereas "are these two passages the same passage?" is a judgement it gets
 * wrong. Contiguity still matters: a group cannot straddle a parse batch,
 * because the splitter breaks on question numbers and "(a)" is not one.
 */
export interface QGroup<T> {
  start: number
  items: T[]
}

export function groupByStem<T extends { groupRef?: string | null }>(qs: T[]): QGroup<T>[] {
  const out: QGroup<T>[] = []
  let i = 0
  while (i < qs.length) {
    const ref = (qs[i].groupRef || '').trim()
    if (!ref) {
      out.push({ start: i, items: [qs[i]] })
      i++
      continue
    }
    let j = i + 1
    while (j < qs.length && (qs[j].groupRef || '').trim() === ref) j++
    out.push({ start: i, items: qs.slice(i, j) })
    i = j
  }
  return out
}

/**
 * Only a free-response paper is grouped. Its parts belong to one problem — (b)
 * needs (a)'s result — so they are numbered 1a/1b and shown in one row.
 * A multiple-choice paper is numbered straight through: its questions stand
 * alone, and "2a/2b/2c" would just be noise.
 */
export function groupsForPaper<T extends { groupRef?: string | null }>(qs: T[], grouped: boolean): QGroup<T>[] {
  return grouped ? groupByStem(qs) : qs.map((q, i) => ({ start: i, items: [q] }))
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
