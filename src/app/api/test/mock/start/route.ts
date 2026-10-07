import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/admin'
import { GRACE_SECONDS } from '@/lib/mock-exam'
import { buildExamPaper, buildReview, finaliseSession, isPastDeadline, loadSession, type SessionRow } from '@/lib/mock-source'
import { NextResponse } from 'next/server'

// Start (or resume) a mock exam.
//   POST { paperId } → { state:'resumed'|'started', sessionId, title, durationSeconds,
//                        startedAt, expiresAt, serverNow, questions:[...] }
//
// The deadline is computed ONCE, here, and stored on the session — so the teacher
// editing the paper's duration later cannot move a live exam's finish line. Every
// response carries expiresAt plus serverNow so the client can render a countdown
// that a changed system clock cannot fool.
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const { paperId } = await request.json()
  if (!paperId) return NextResponse.json({ error: '缺少paperId' }, { status: 400 })

  const { data: paperRows } = await supabaseAdmin('mock_papers', {
    query: `?id=eq.${paperId}&select=id,title,duration_minutes,mock_course_id`,
  })
  const paper = paperRows?.[0]
  if (!paper) return NextResponse.json({ error: '试卷不存在' }, { status: 404 })

  const { data: existingRows } = await supabaseAdmin('mock_test_sessions', {
    query: `?student_id=eq.${user.id}&paper_id=eq.${paperId}&status=eq.in_progress&order=started_at.desc&limit=1&select=*`,
  })
  let session: SessionRow | null = (existingRows?.[0] as SessionRow) ?? null
  let state: 'started' | 'resumed' = 'started'

  if (session) {
    if (isPastDeadline(session)) {
      // Ran out of time while away: grade it and open a fresh attempt.
      await finaliseSession(session, 'timeout')
      session = null
    } else {
      state = 'resumed'
    }
  }

  if (!session) {
    const { data: pq } = await supabaseAdmin('mock_paper_questions', {
      query: `?paper_id=eq.${paperId}&order=sort_order&select=question_id,sort_order`,
    })
    const links = (pq || []) as any[]
    if (links.length === 0) return NextResponse.json({ error: '这套试卷还没有题目' }, { status: 400 })

    const durationSeconds = Math.max(1, (paper.duration_minutes || 60) * 60)
    const { data: created, error } = await supabaseAdmin('mock_test_sessions', {
      method: 'POST',
      body: {
        student_id: user.id,
        paper_id: paperId,
        duration_seconds: durationSeconds,
        expires_at: new Date(Date.now() + durationSeconds * 1000).toISOString(),
        total_questions: links.length,
      },
      query: '?select=*',
    })
    if (error || !created?.[0]) return NextResponse.json({ error: error?.message || '开考失败' }, { status: 500 })
    session = created[0] as SessionRow

    // Pre-insert one row per question: this makes the session its own paper
    // snapshot (resume reads straight off it) and means a teacher editing the
    // paper mid-exam cannot disturb what students already have in front of them.
    await supabaseAdmin('mock_test_answers', {
      method: 'POST',
      body: links.map((l) => ({ session_id: session!.id, question_id: l.question_id, sort_order: l.sort_order })),
    })
  }

  const questions = await buildExamPaper(session)
  return NextResponse.json({
    state,
    sessionId: session.id,
    title: paper.title,
    durationSeconds: session.duration_seconds,
    startedAt: session.started_at,
    expiresAt: session.expires_at,
    serverNow: new Date().toISOString(),
    graceSeconds: GRACE_SECONDS,
    questions,
  })
}

export async function GET(request: Request) {
  // Convenience: current state for a paper, so a page can decide what to render
  // without starting anything.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const paperId = new URL(request.url).searchParams.get('paperId')
  if (!paperId) return NextResponse.json({ error: '缺少paperId' }, { status: 400 })

  const { data: rows } = await supabaseAdmin('mock_test_sessions', {
    query: `?student_id=eq.${user.id}&paper_id=eq.${paperId}&order=started_at.desc&limit=1&select=*`,
  })
  const session = (rows?.[0] as SessionRow) ?? null
  if (!session) return NextResponse.json({ state: 'none', serverNow: new Date().toISOString() })

  if (session.status === 'in_progress') {
    if (isPastDeadline(session)) {
      const done = await finaliseSession(session, 'timeout')
      return NextResponse.json({ state: 'submitted', review: await buildReview(done), serverNow: new Date().toISOString() })
    }
    return NextResponse.json({
      state: 'in_progress',
      sessionId: session.id,
      expiresAt: session.expires_at,
      serverNow: new Date().toISOString(),
      graceSeconds: GRACE_SECONDS,
      questions: await buildExamPaper(session),
    })
  }
  return NextResponse.json({ state: 'submitted', review: await buildReview(session), serverNow: new Date().toISOString() })
}
