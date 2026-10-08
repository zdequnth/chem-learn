import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/admin'
import { buildReview, finaliseSession, isPastDeadline, loadSession } from '@/lib/mock-source'
import { NextResponse } from 'next/server'

// Save one answer. Deliberately returns NOTHING about correctness — during the
// exam the student must not be able to learn whether they were right.
//   POST { sessionId, questionId, selectedOptionId }  (selectedOptionId: null clears)
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const { sessionId, questionId, selectedOptionId, answerText, flagged } = await request.json()
  if (!sessionId || !questionId) return NextResponse.json({ error: '参数不全' }, { status: 400 })

  const session = await loadSession(sessionId)
  if (!session || session.student_id !== user.id) return NextResponse.json({ error: '考试不存在' }, { status: 404 })

  if (session.status === 'submitted') {
    return NextResponse.json({ submitted: true, review: await buildReview(session) })
  }

  // Past the deadline: refuse the answer and grade the paper right here, so a
  // client whose timer never fired still cannot keep answering.
  if (isPastDeadline(session)) {
    const done = await finaliseSession(session, 'timeout')
    return NextResponse.json({ expired: true, review: await buildReview(done) })
  }

  const patch: Record<string, unknown> = {}

  // Selecting an option and flagging a question are separate actions, so only the
  // field that was actually sent is written — flagging must not clear an answer.
  if (selectedOptionId !== undefined) {
    // The option must belong to this question — cheap guard against a stray id.
    if (selectedOptionId) {
      const { data: opt } = await supabaseAdmin('question_options', {
        query: `?id=eq.${selectedOptionId}&select=question_id`,
      })
      if (opt?.[0]?.question_id !== questionId) {
        return NextResponse.json({ error: '选项不属于这道题' }, { status: 400 })
      }
    }
    patch.selected_option_id = selectedOptionId || null
    patch.answered_at = new Date().toISOString()
  }

  // Free-response answer. Like the option above, this is the student's own
  // writing — no correctness is derived or returned here.
  if (answerText !== undefined) {
    patch.answer_text = String(answerText ?? '').slice(0, 8000)
    patch.answered_at = new Date().toISOString()
  }

  if (typeof flagged === 'boolean') patch.flagged = flagged

  if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true })

  await supabaseAdmin('mock_test_answers', {
    method: 'PATCH',
    body: patch,
    query: `?session_id=eq.${sessionId}&question_id=eq.${questionId}`,
  })

  return NextResponse.json({ ok: true, serverNow: new Date().toISOString() })
}
