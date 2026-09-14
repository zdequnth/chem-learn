import { supabaseAdmin } from './admin'

// Weighted-random question pick for a gate test:
//   1. questions the student has never answered in this lesson  (highest)
//   2. questions the student has answered wrong before          (middle)
//   3. questions the student already answered correctly         (lowest)
// The caller still excludes questions already asked in the current session.
const W_UNSEEN = 5
const W_WRONG = 3
const W_CORRECT = 1

export async function pickWeightedQuestion(userId: string, lessonId: string, candidates: any[]): Promise<any | null> {
  if (!candidates || candidates.length === 0) return null
  if (candidates.length === 1) return candidates[0]

  const { data: sessions } = await supabaseAdmin('gate_test_sessions', {
    query: `?student_id=eq.${userId}&lesson_id=eq.${lessonId}&select=id`,
  })
  const sessionIds = (sessions || []).map((s: any) => s.id)

  const answered = new Set<string>()
  const wrong = new Set<string>()
  for (let i = 0; i < sessionIds.length; i += 150) {
    const { data: ans } = await supabaseAdmin('gate_test_answers', {
      query: `?session_id=in.(${sessionIds.slice(i, i + 150).join(',')})&select=question_id,is_correct`,
    })
    for (const a of (ans || [])) {
      answered.add(a.question_id)
      if (!a.is_correct) wrong.add(a.question_id)
    }
  }

  const weights = candidates.map((q: any) =>
    !answered.has(q.id) ? W_UNSEEN : (wrong.has(q.id) ? W_WRONG : W_CORRECT)
  )
  const total = weights.reduce((a: number, b: number) => a + b, 0)
  let r = Math.random() * total
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i]
    if (r <= 0) return candidates[i]
  }
  return candidates[candidates.length - 1]
}
