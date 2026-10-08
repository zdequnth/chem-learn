/**
 * Turn a pasted answer key into 题号 → 选项.
 *
 * Covers the shapes teachers actually paste: one per line ("1. B"), run together
 * ("1.B 2.C"), and ranges ("1-5 BCDAB"). The key is pasted into its own box, so
 * there is no question text mixed in to confuse it — inside the paper text an
 * answer line like "1. B" looks exactly like a question number.
 */
export function parseAnswerKey(text: string): Map<number, string> {
  const out = new Map<number, string>()
  let rest = text.replace(/\r\n?/g, '\n')

  // Ranges first, and consume the match so those letters are not re-read as
  // standalone answers below. Only expand when the letter count lines up, so a
  // stray "9-10" is left for the pass below instead of being misread.
  rest = rest.replace(
    /(\d+)\s*[-–—~至]\s*(\d+)\s*[:：.、)．]?\s*([A-Ea-e]{1,20})/g,
    (whole, a: string, b: string, letters: string) => {
      const from = Number(a)
      const ls = letters.toUpperCase().split('')
      if (Number(b) - from + 1 !== ls.length) return whole
      ls.forEach((l, k) => out.set(from + k, l))
      return ' '
    },
  )

  for (const m of rest.matchAll(/(\d+)\s*[.、)．:：]?\s*([A-Ea-e]{1,8})(?![A-Za-z])/g)) {
    const n = Number(m[1])
    if (!out.has(n)) out.set(n, m[2].toUpperCase())
  }
  return out
}
