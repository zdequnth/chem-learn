import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/admin'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sessionId } = await request.json()

  const { data: sessions } = await supabaseAdmin('gate_test_sessions', {
    query: `?id=eq.${sessionId}&student_id=eq.${user.id}&select=*`,
  })
  const session = sessions?.[0]
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  if (session.status !== 'in_progress') return NextResponse.json({ error: 'Session not active', status: session.status }, { status: 400 })

  // Get asked question IDs
  const { data: asked } = await supabaseAdmin('gate_test_answers', {
    query: `?session_id=eq.${sessionId}&select=question_id`,
  })
  const askedIds = (asked || []).map((a: any) => a.question_id)

  // Build query string
  let queryStr = `?lesson_id=eq.${session.lesson_id}&question_type=eq.gate_test&is_approved=eq.true&select=id,stem,explanation,image_url,knowledge_point_id,lesson_id,difficulty`
  if (askedIds.length > 0) {
    queryStr += `&id=not.in.(${askedIds.join(',')})`
  }
  queryStr += `&limit=50`

  const { data: questions } = await supabaseAdmin('questions', { query: queryStr })

  if (!questions || questions.length === 0) {
    // All questions exhausted — determine result
    const totalAsked = session.questions_asked || 0
    const accuracy = totalAsked > 0 ? (session.total_correct || 0) / totalAsked : 0
    const passed = (session.consecutive_correct || 0) >= 7 || (totalAsked >= 10 && accuracy >= 0.9)
    const stars = passed ? ((session.total_wrong || 0) === 0 ? 3 : (session.total_wrong || 0) === 1 ? 2 : 1) : 0

    // Check if retake (already passed) — don't lock
    const { data: pc } = await supabaseAdmin('student_progress', {
      query: `?student_id=eq.${user.id}&lesson_id=eq.${session.lesson_id}&select=status`,
    })
    const isRetake = pc?.[0]?.status === 'passed'

    await supabaseAdmin('gate_test_sessions', {
      method: 'PATCH',
      body: { status: passed ? 'passed' : 'failed', score_percentage: Math.round(accuracy * 100), stars_earned: stars,
        completed_at: new Date().toISOString(),
        locked_until: passed || isRetake ? null : new Date(Date.now() + 10 * 60 * 1000).toISOString() },
      query: `?id=eq.${sessionId}`,
    })

    return NextResponse.json({
      done: true, passed, stars,
      lockedUntil: passed || isRetake ? null : new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      stats: { questionsAsked: totalAsked, totalCorrect: session.total_correct || 0, totalWrong: session.total_wrong || 0, accuracy: Math.round(accuracy * 100) },
    })
  }

  // Pick random question
  const question = questions[Math.floor(Math.random() * questions.length)]

  // Get options
  const { data: options } = await supabaseAdmin('question_options', {
    query: `?question_id=eq.${question.id}&order=display_order&select=id,content,is_correct`,
  })

  return NextResponse.json({
    done: false,
    question: {
      id: question.id, stem: question.stem, explanation: question.explanation,
      imageUrl: question.image_url,
      options: ((options || []) as any[]).sort(() => Math.random() - 0.5).map((o: any) => ({ id: o.id, content: o.content })),
    },
    stats: {
      questionsAsked: session.questions_asked || 0,
      consecutiveCorrect: session.consecutive_correct || 0,
      totalCorrect: session.total_correct || 0,
      totalWrong: session.total_wrong || 0,
    },
  })
}
