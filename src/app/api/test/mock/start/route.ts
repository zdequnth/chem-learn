import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/admin'
import { GRACE_SECONDS } from '@/lib/mock-exam'
import { buildExamPaper, buildReview, finaliseSession, isPastDeadline, loadSession, neverCorrectQuestions, type SessionRow } from '@/lib/mock-source'
import { NextResponse } from 'next/server'

// A retry re-asks the questions in a different order — position memory is not
// knowledge.
function shuffled<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

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

  const { paperId, mode: rawMode } = await request.json()
  if (!paperId) return NextResponse.json({ error: '缺少paperId' }, { status: 400 })
  const mode: 'full' | 'retry' = rawMode === 'retry' ? 'retry' : 'full'

  const { data: paperRows } = await supabaseAdmin('mock_papers', {
    query: `?id=eq.${paperId}&select=id,title,mode,duration_minutes,mock_course_id,is_published`,
  })
  const paper = paperRows?.[0]
  if (!paper) return NextResponse.json({ error: '试卷不存在' }, { status: 404 })

  const { data: existingRows } = await supabaseAdmin('mock_test_sessions', {
    query: `?student_id=eq.${user.id}&paper_id=eq.${paperId}&status=eq.in_progress&order=started_at.desc&limit=1&select=*`,
  })
  let session: SessionRow | null = (existingRows?.[0] as SessionRow) ?? null
  let state: 'started' | 'resumed' = 'started'

  // Unpublished means unreviewed: block a NEW start. An exam already under way
  // is allowed to continue even if the paper was unpublished meanwhile — pulling
  // the paper out from under a student mid-exam would be worse than letting them
  // finish it.
  if (!paper.is_published && !session) {
    return NextResponse.json({ error: '这套卷子还没有发布' }, { status: 403 })
  }

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
    let questionIds: string[]

    if (mode === 'retry') {
      // Only what they have never got right — including questions they left blank.
      // A multi-part question comes back whole, so its parts stay together.
      const remaining = await neverCorrectQuestions(user.id, paperId)
      if (remaining.length === 0) {
        return NextResponse.json({ empty: true, error: '这份卷子已经全部答对了，没有错题需要重测' }, { status: 400 })
      }
      // Re-ordering stops a student answering from memory of "it was the third
      // one" — but it must NOT happen when the questions are grouped: (b) has to
      // follow (a) and sit under their shared stem.
      const { data: gq } = await supabaseAdmin('questions', {
        query: `?id=in.(${remaining.join(',')})&select=id,group_stem`,
      })
      const hasGroups = ((gq || []) as any[]).some((q) => String(q.group_stem ?? '').trim())
      questionIds = hasGroups || paper.mode === 'short' ? remaining : shuffled(remaining)
    } else {
      const { data: pq } = await supabaseAdmin('mock_paper_questions', {
        query: `?paper_id=eq.${paperId}&order=sort_order&select=question_id`,
      })
      questionIds = ((pq || []) as any[]).map((r) => r.question_id)
    }
    if (questionIds.length === 0) return NextResponse.json({ error: '这套试卷还没有题目' }, { status: 400 })

    const durationSeconds = Math.max(1, (paper.duration_minutes || 60) * 60)
    const { data: created, error } = await supabaseAdmin('mock_test_sessions', {
      method: 'POST',
      body: {
        student_id: user.id,
        paper_id: paperId,
        // `mode` arrives with migration 019. Sending it unconditionally would
        // make EVERY exam fail to start until that migration is run, so a full
        // attempt just relies on the column's default and only a retry names it.
        ...(mode === 'retry' ? { mode } : {}),
        duration_seconds: durationSeconds,
        expires_at: new Date(Date.now() + durationSeconds * 1000).toISOString(),
        total_questions: questionIds.length,
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
      body: questionIds.map((qid, i) => ({ session_id: session!.id, question_id: qid, sort_order: i })),
    })
  }

  const questions = await buildExamPaper(session)
  return NextResponse.json({
    state,
    sessionId: session.id,
    title: paper.title,
    mode: session.mode || 'full',
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
  // How many questions are still unanswered-correctly: what 错题重测 would ask.
  const wrongCount = (await neverCorrectQuestions(user.id, paperId)).length
  if (!session) return NextResponse.json({ state: 'none', wrongCount, serverNow: new Date().toISOString() })

  if (session.status === 'in_progress') {
    if (isPastDeadline(session)) {
      const done = await finaliseSession(session, 'timeout')
      return NextResponse.json({ state: 'submitted', wrongCount: (await neverCorrectQuestions(user.id, paperId)).length, review: await buildReview(done), serverNow: new Date().toISOString() })
    }
    return NextResponse.json({
      state: 'in_progress',
      sessionId: session.id,
      mode: session.mode || 'full',
      expiresAt: session.expires_at,
      serverNow: new Date().toISOString(),
      graceSeconds: GRACE_SECONDS,
      questions: await buildExamPaper(session),
    })
  }
  return NextResponse.json({ state: 'submitted', wrongCount, review: await buildReview(session), serverNow: new Date().toISOString() })
}
