import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/admin'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sessionId, questionId, selectedOptionId } = await request.json()

  // Read session via admin
  const { data: sessions } = await supabaseAdmin('gate_test_sessions', {
    query: `?id=eq.${sessionId}&student_id=eq.${user.id}&select=*`,
  })
  const session = sessions?.[0]
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  if (session.status !== 'in_progress') return NextResponse.json({ error: 'Session not active' }, { status: 400 })

  // Check answer
  const { data: opts } = await supabaseAdmin('question_options', {
    query: `?question_id=eq.${questionId}&is_correct=eq.true&select=id,content`,
  })
  const correctOpt = opts?.[0]
  const isCorrect = selectedOptionId === correctOpt?.id

  // Get question
  const { data: questions } = await supabaseAdmin('questions', {
    query: `?id=eq.${questionId}&select=explanation,lesson_id`,
  })
  const question = questions?.[0]

  // Record answer
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

  // Check if lesson is already passed (retake mode)
  const { data: progCheck } = await supabaseAdmin('student_progress', {
    query: `?student_id=eq.${user.id}&lesson_id=eq.${session.lesson_id}&select=status`,
  })
  const alreadyPassed = progCheck?.[0]?.status === 'passed'

  // Check pass: 7 consecutive correct
  if (newCC >= 7) { status = 'passed'; passed = true }
  // Check pass: >= 10 questions and >= 90% accuracy
  if (!passed && newQA >= 10 && newTC / newQA >= 0.90) { status = 'passed'; passed = true }
  // Check fail: 3 wrong (don't lock if already passed)
  if (!passed && newTW >= 3) {
    status = 'failed'
    if (!alreadyPassed) {
      lockedUntil = new Date(Date.now() + 30 * 60 * 1000).toISOString()
    }
  }

  if (passed) stars = newTW === 0 ? 3 : newTW === 1 ? 2 : 1

  const accuracy = newQA > 0 ? newTC / newQA : 0

  // Update session via admin
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
  if (patchResult.error) {
    console.error('Failed to update gate_test_session:', patchResult.error)
  }

  // Update student progress if passed (only if not already passed)
  if (passed) {
    const { data: existing } = await supabaseAdmin('student_progress', {
      query: `?student_id=eq.${user.id}&lesson_id=eq.${session.lesson_id}&select=id,status`,
    })
    const current = existing?.[0]
    if (current && current.status !== 'passed') {
      const up = await supabaseAdmin('student_progress', {
        method: 'PATCH',
        body: { status: 'passed', stars_earned: Math.max(stars, 1), passed_at: new Date().toISOString(), attempt_count: (session.attempt_count || 0) + 1 },
        query: `?id=eq.${current.id}`,
      })
      if (up.error) console.error('Failed to update progress:', up.error)
    } else if (!current) {
      const up = await supabaseAdmin('student_progress', {
        method: 'POST',
        body: { student_id: user.id, lesson_id: session.lesson_id, status: 'passed', stars_earned: Math.max(stars, 1), passed_at: new Date().toISOString(), attempt_count: 1 },
      })
      if (up.error) console.error('Failed to create progress:', up.error)
    }
    // If already passed, don't downgrade or change anything
  }

  // Wrong question book
  if (!isCorrect && question) {
    const { data: lessons } = await supabaseAdmin('lessons', {
      query: `?id=eq.${question.lesson_id}&select=chapter_id`,
    })
    const chapterId = lessons?.[0]?.chapter_id
    if (chapterId) {
      // Upsert to handle duplicates
      const { data: existingWq } = await supabaseAdmin('wrong_question_book', {
        query: `?student_id=eq.${user.id}&question_id=eq.${questionId}&select=id`,
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

  // Strip AI's "正确答案：X" or "Answer: X" prefix from explanation
  let explanation = question?.explanation || null
  if (explanation) {
    explanation = explanation.replace(/^(正确答案：\s*[A-D][.。]?\s*|Answer:\s*[A-D][.。]?\s*)/i, '')
  }

  return NextResponse.json({
    isCorrect,
    correctOptionId: correctOpt?.id || null,
    explanation,
    done: status !== 'in_progress', passed, stars, lockedUntil,
    stats: { questionsAsked: newQA, consecutiveCorrect: newCC, totalCorrect: newTC, totalWrong: newTW, accuracy: Math.round(accuracy * 100) },
  })
}
