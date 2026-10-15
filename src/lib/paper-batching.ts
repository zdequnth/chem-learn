// Splitting a pasted paper into per-request chunks, and knowing which printed
// question numbers each chunk holds. The numbers come from the text itself (a
// paragraph that starts with "12." is question 12), which is what lets the parse
// step insist on exactly those questions back instead of trusting the model to
// count.

export const MAX_CHARS_PER_BATCH = 3000

export type Batch = { text: string; nums: number[] }

// A question paragraph starts with its printed number. Papers write that number
// with a dot ("12.") or with nothing at all ("12 Compound X …"), so both are
// accepted. Two guards keep ordinary prose and data rows out: at most three
// digits (a year is four), and a letter or a formula must follow — "1 0.5 2.3"
// is a data row, not question 1.
const QUESTION_START = /^\s*\**\s*(\d{1,3})(?:\s*[.、)．:]\s*[A-Za-z一-鿿$(]|\s+[A-Z一-鿿$(])/

export function isQuestionStart(para: string): boolean {
  return questionNumber(para) !== null
}

/** The printed number of a question paragraph, or null when it is not one. */
export function questionNumber(para: string): number | null {
  const m = para.match(QUESTION_START)
  if (!m) return null
  const n = Number(m[1])
  return Number.isInteger(n) && n >= 1 && n <= 300 ? n : null
}

/**
 * Split paper text into chunks small enough for one reliable LLM call. Splits on
 * blank lines, then groups paragraphs into per-question units so a question is
 * never cut in half (a half question was emitted as two). Each chunk carries the
 * question numbers that appear in it.
 */
export function splitIntoBatches(text: string): Batch[] {
  const paragraphs = text
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)

  const units: { text: string; nums: number[] }[] = []
  let cur: string[] = []
  let curNums: number[] = []
  let sawStart = false
  const flushUnit = () => {
    if (cur.length > 0) { units.push({ text: cur.join('\n\n'), nums: curNums }); cur = []; curNums = [] }
  }
  for (const para of paragraphs) {
    if (isQuestionStart(para)) {
      flushUnit()
      sawStart = true
      const n = questionNumber(para)
      if (n !== null) curNums.push(n)
    }
    cur.push(para)
  }
  flushUnit()

  const packables: { text: string; nums: number[] }[] = sawStart
    ? units
    : paragraphs.map((p) => ({ text: p, nums: [] }))

  // Never split a question across batches. A unit (one question, plus the shared
  // material above it) goes out whole even when it alone exceeds the cap: cutting
  // it at a line boundary makes the next batch start mid-question, and that
  // question is then lost. A long batch is the lesser evil — with reasoning off
  // the model has the whole output budget, so it rarely runs out.
  const batches: Batch[] = []
  let batchText: string[] = []
  let batchNums: number[] = []
  let batchLen = 0
  const flushBatch = () => {
    if (batchText.length > 0) { batches.push({ text: batchText.join('\n\n'), nums: batchNums }); batchText = []; batchNums = []; batchLen = 0 }
  }
  for (const u of packables) {
    if (batchText.length > 0 && batchLen + u.text.length + 2 > MAX_CHARS_PER_BATCH) flushBatch()
    batchText.push(u.text)
    batchNums.push(...u.nums)
    batchLen += u.text.length + 2
  }
  flushBatch()
  return batches.length > 0 ? batches : [{ text, nums: [] }]
}

/**
 * What went wrong between the numbers a chunk should have produced and the ones
 * it did. Empty means the batch is clean. Phrased for a teacher to read.
 *
 * The two paper kinds differ on duplicates: a choice paper has one question per
 * number, so a number appearing twice means it was split; a short paper has one
 * number per BIG question, and (a)(b)(c) parts all carry it, so duplicates are
 * expected there.
 */
export function numberIssues(
  expected: number[],
  got: (number | null | undefined)[],
  mode: 'choice' | 'short',
): string[] {
  if (expected.length === 0) return []
  const nums = got.filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
  const counts = new Map<number, number>()
  for (const n of nums) counts.set(n, (counts.get(n) || 0) + 1)

  const issues: string[] = []
  const extra = [...new Set(nums.filter((n) => !expected.includes(n)))]
  if (extra.length) issues.push(`多出了题号 ${extra.join('、')}（本批文本里没有这些题号）`)
  const missing = expected.filter((n) => !counts.has(n))
  if (missing.length) issues.push(`少了题号 ${missing.join('、')}`)
  if (mode === 'choice') {
    const dup = [...counts.entries()].filter(([, c]) => c > 1).map(([n]) => n)
    if (dup.length) issues.push(`题号 ${dup.join('、')} 出现了不止一次（一道题被拆成了两道）`)
  }
  return issues
}
