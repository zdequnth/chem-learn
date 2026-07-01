import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/admin'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { lessonId } = await request.json()

  // Get progress status
  const progressResult = await supabaseAdmin('student_progress', {
    query: `?student_id=eq.${user.id}&lesson_id=eq.${lessonId}&select=status`,
  })
  const progStatus = progressResult.data?.[0]?.status
  const isPassed = progStatus === 'passed'

  // Check lock on latest session (for non-passed lessons)
  if (!isPassed) {
    // Get latest session regardless of status
    const { data: lastSession } = await supabaseAdmin('gate_test_sessions', {
      query: `?student_id=eq.${user.id}&lesson_id=eq.${lessonId}&order=started_at.desc&limit=1&select=status,locked_until`,
    })
    if (lastSession && lastSession.length > 0) {
      const s = lastSession[0]
      if (s.locked_until && new Date(s.locked_until) > new Date()) {
        return NextResponse.json({
          error: '测试已锁定',
          lockedUntil: s.locked_until,
          minutesRemaining: Math.ceil((new Date(s.locked_until).getTime() - Date.now()) / 60000),
        }, { status: 403 })
      }
    }

    // Check lesson is unlocked for first attempt
    if (progStatus !== 'unlocked' && progStatus !== 'in_progress') {
      return NextResponse.json({ error: '此课时尚未解锁，请先完成上一个课时的测试' }, { status: 403 })
    }
  }

  // Check there are questions
  const { data: qCount } = await supabaseAdmin('questions', {
    query: `?lesson_id=eq.${lessonId}&question_type=eq.gate_test&is_approved=eq.true&select=id`,
  })
  if (!qCount || qCount.length === 0) {
    return NextResponse.json({ error: '没有可用的关卡测试题目' }, { status: 400 })
  }

  // Create session
  const { data: session } = await supabaseAdmin('gate_test_sessions', {
    method: 'POST',
    body: { student_id: user.id, lesson_id: lessonId, status: 'in_progress', questions_asked: 0, consecutive_correct: 0, total_correct: 0, total_wrong: 0 },
    query: '?select=id',
  })

  return NextResponse.json({
    sessionId: (session as any)?.[0]?.id || (session as any)?.id,
    totalAvailableQuestions: qCount.length,
    isRetake: isPassed,
  })
}
