import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/admin'
import { pickWeightedQuestion } from '@/lib/gate-pick'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sessionId, questionId, selectedOptionId } = await request.json()

  // Read session
  const { data: sessions } = await supabaseAdmin('gate_test_sessions', {
    query: `?id=eq.${sessionId}&student_id=eq.${user.id}&select=*`,
  })
  const session = sessions?.[0]
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  if (session.status !== 'in_progress') return NextResponse.json({ error: 'Session not active' }, { status: 400 })

  // Idempotency: a repeat submission of the same question in the same session
  // (button spam / key-repeat) must not insert another answer or re-count it.
  const { data: existingAnswer } = await supabaseAdmin('gate_test_answers', {
    query: `?session_id=eq.${sessionId}&question_id=eq.${questionId}&select=id&limit=1`,
  })
  if (existingAnswer && existingAnswer.length > 0) {
    return NextResponse.json({
      duplicate: true,
      stats: {
        questionsAsked: session.questions_asked || 0,
        consecutiveCorrect: session.consecutive_correct || 0,
        totalCorrect: session.total_correct || 0,
        totalWrong: session.total_wrong || 0,
        accuracy: session.questions_asked ? Math.round(((session.total_correct || 0) / session.questions_asked) * 100) : 0,
      },
    })
  }

  // Parallel: check answer + get question
  const [optsRes, questionsRes] = await Promise.all([
    supabaseAdmin('question_options', {
      query: `?question_id=eq.${questionId}&is_correct=eq.true&select=id`,
    }),
    supabaseAdmin('questions', {
      query: `?id=eq.${questionId}&select=explanation,lesson_id`,
    }),
  ])

  const correctOpt = optsRes.data?.[0]
  const question = questionsRes.data?.[0]
  const isCorrect = selectedOptionId === correctOpt?.id

  // Record the answer and WAIT for it before picking the next question, so the
  // just-answered question is reliably excluded from the "asked" set (otherwise
  // a race can re-serve it).
  await supabaseAdmin('gate_test_answers', {
    method: 'POST',
    body: { session_id: sessionId, question_id: questionId, selected_option_id: selectedOptionId, is_correct: isCorrect },
  })

  const oldCC = session.consecutive_correct || 0
  const oldTC = session.total_correct || 0
  const oldTW = session.total_wrong || 0
  const oldQA = session.questions_asked || 0

  const newCC = isCorrect ? oldCC + 1 : 0
  const newTC = oldTC + (isCorrect ? 1 : 0)
  const newTW = oldTW + (isCorrect ? 0 : 1)
  const newQA = oldQA + 1

  let status = 'in_progress'
  let lockedUntil: string | null = null
  let passed = false
  let stars = 0
  let alreadyPassed = false

  if (newCC >= 7) { status = 'passed'; passed = true }
  if (!passed && newQA >= 10 && newTC / newQA >= 0.90) { status = 'passed'; passed = true }
  if (!passed && newTW >= 3) {
    status = 'failed'
    lockedUntil = new Date(Date.now() + 10 * 60 * 1000).toISOString()
  }
  if (passed) stars = newTW === 0 ? 3 : newTW === 1 ? 2 : 1

  const accuracy = newQA > 0 ? newTC / newQA : 0

  // Update session
  const patchResult = await supabaseAdmin('gate_test_sessions', {
    method: 'PATCH',
    body: {
      questions_asked: newQA, consecutive_correct: newCC, total_correct: newTC,
      total_wrong: newTW, score_percentage: Math.round(accuracy * 100),
      stars_earned: stars, status, locked_until: lockedUntil,
      completed_at: status !== 'in_progress' ? new Date().toISOString() : null,
    },
    query: `?id=eq.${sessionId}`,
  })
  if (patchResult.error) console.error('Failed to update session:', patchResult.error)

  // Update student progress if passed. Awaited: a fire-and-forget write can be
  // lost when the serverless function is frozen right after the response, which
  // left a passed lesson stuck as "unlocked" (and the next lesson locked).
  if (passed) {
    const { data: existing } = await supabaseAdmin('student_progress', {
      query: `?student_id=eq.${user.id}&lesson_id=eq.${session.lesson_id}&select=id,status`,
    })
    const current = existing?.[0]
    if (current && current.status !== 'passed') {
      await supabaseAdmin('student_progress', {
        method: 'PATCH',
        body: { status: 'passed', stars_earned: Math.max(stars, 1), passed_at: new Date().toISOString(), attempt_count: (session.attempt_count || 0) + 1 },
        query: `?id=eq.${current.id}`,
      })
    } else if (!current) {
      await supabaseAdmin('student_progress', {
        method: 'POST',
        body: { student_id: user.id, lesson_id: session.lesson_id, status: 'passed', stars_earned: Math.max(stars, 1), passed_at: new Date().toISOString(), attempt_count: 1 },
      })
    }
  }

  // Wrong question book (awaited for the same reason as the progress update)
  if (!isCorrect && question) {
    const { data: lessons } = await supabaseAdmin('lessons', {
      query: `?id=eq.${question.lesson_id}&select=chapter_id`,
    })
    const chapterId = lessons?.[0]?.chapter_id
    if (chapterId) {
      const { data: existingWq } = await supabaseAdmin('wrong_question_book', {
        query: `?student_id=eq.${user.id}&question_id=eq.${questionId}&select=id,wrong_count`,
      })
      if (existingWq && existingWq.length > 0) {
        await supabaseAdmin('wrong_question_book', {
          method: 'PATCH',
          body: { last_wrong_at: new Date().toISOString(), wrong_count: (existingWq[0].wrong_count || 0) + 1 },
          query: `?id=eq.${existingWq[0].id}`,
        })
      } else {
        await supabaseAdmin('wrong_question_book', {
          method: 'POST',
          body: { student_id: user.id, question_id: questionId, chapter_id: chapterId, last_wrong_at: new Date().toISOString(), wrong_count: 1, is_resolved: false },
        })
      }
    }
  }

  // Strip AI's "正确答案：X" prefix from explanation
  let explanation = question?.explanation || null
  if (explanation) {
    explanation = explanation.replace(/^(正确答案：\s*[A-D][.。]?\s*|Answer:\s*[A-D][.。]?\s*)/i, '')
  }

  // Don't lock if already passed
  if (!passed && newTW >= 3 && lockedUntil) {
    supabaseAdmin('student_progress', {
      query: `?student_id=eq.${user.id}&lesson_id=eq.${session.lesson_id}&select=status`,
    }).then(({ data }) => {
      if (data?.[0]?.status === 'passed') {
        supabaseAdmin('gate_test_sessions', {
          method: 'PATCH',
          body: { locked_until: null },
          query: `?id=eq.${sessionId}`,
        }).catch(() => {})
      }
    }).catch(() => {})
  }

  // Prefetch next question if test continues
  let nextQuestion: any = null
  if (status === 'in_progress') {
    const { data: asked } = await supabaseAdmin('gate_test_answers', {
      query: `?session_id=eq.${sessionId}&select=question_id`,
    })
    const askedIds = (asked || []).map((a: any) => a.question_id)
    let qs = `?lesson_id=eq.${session.lesson_id}&question_type=eq.gate_test&is_approved=eq.true&select=id,stem,explanation,image_url&limit=50`
    if (askedIds.length > 0) qs += `&id=not.in.(${askedIds.join(',')})`
    const { data: available } = await supabaseAdmin('questions', { query: qs })
    if (available && available.length > 0) {
      const q = await pickWeightedQuestion(user.id, session.lesson_id, available)
      const { data: opts } = await supabaseAdmin('question_options', {
        query: `?question_id=eq.${q.id}&order=display_order&select=id,content,is_correct`,
      })
      nextQuestion = {
        id: q.id, stem: q.stem, explanation: q.explanation, imageUrl: q.image_url,
        options: ((opts || []) as any[]).sort(() => Math.random() - 0.5).map((o: any) => ({ id: o.id, content: o.content })),
      }
    }
  }

  return NextResponse.json({
    isCorrect,
    correctOptionId: correctOpt?.id || null,
    explanation,
    nextQuestion,
    done: status !== 'in_progress', passed, stars, lockedUntil,
    stats: { questionsAsked: newQA, consecutiveCorrect: newCC, totalCorrect: newTC, totalWrong: newTW, accuracy: Math.round(accuracy * 100) },
  })
}
