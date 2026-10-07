import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/admin'
import { loadPaperForTeacher, loadSourceOutline, isAdminUser } from '@/lib/mock-source'
import { NextResponse } from 'next/server'

// Results of one mock paper: who sat it, how they did, and which QUESTIONS the
// class struggled with (each mapped back to its chapter/lesson so the teacher
// knows what to re-teach).
//   GET ?paperId=
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const paperId = new URL(request.url).searchParams.get('paperId')
  if (!paperId) return NextResponse.json({ error: '缺少paperId' }, { status: 400 })

  const { paper, course, error, status } = await loadPaperForTeacher(user.id, paperId, await isAdminUser())
  if (error) return NextResponse.json({ error }, { status: status || 400 })

  // select=* — `is_published` only exists after migration 017, and naming a
  // missing column makes PostgREST reject the whole query.
  const { data: papers } = await supabaseAdmin('mock_papers', {
    query: `?id=eq.${paperId}&select=*`,
  })
  const paperRow = papers?.[0]
  const outline = course?.mock_source_course_id ? await loadSourceOutline(course.mock_source_course_id) : null
  const refByLesson = new Map((outline?.lessons || []).map((l) => [l.lessonId, l]))

  const { data: sessions } = await supabaseAdmin('mock_test_sessions', {
    query: `?paper_id=eq.${paperId}&order=submitted_at.desc&select=id,student_id,status,submit_reason,duration_seconds,started_at,submitted_at,total_questions,total_correct,total_wrong,score_percentage`,
  })
  const subs = (sessions || []).filter((s: any) => s.status === 'submitted')
  const inProgress = (sessions || []).length - subs.length

  // student names
  const studentIds = [...new Set(subs.map((s: any) => s.student_id))]
  const { data: profiles } = studentIds.length
    ? await supabaseAdmin('profiles', { query: `?id=in.(${studentIds.join(',')})&select=id,display_name` })
    : { data: [] as any[] }
  const nameById = new Map((profiles || []).map((p: any) => [p.id, p.display_name]))

  // Per-question stats across every submitted session of this paper.
  const sessionIds = subs.map((s: any) => s.id)
  let answers: any[] = []
  for (let i = 0; i < sessionIds.length; i += 100) {
    const { data } = await supabaseAdmin('mock_test_answers', {
      query: `?session_id=in.(${sessionIds.slice(i, i + 100).join(',')})&select=question_id,sort_order,selected_option_id,is_correct`,
    })
    answers = answers.concat(data || [])
  }

  const byQuestion = new Map<string, { asked: number; answered: number; correct: number; sortOrder: number }>()
  for (const a of answers) {
    const cur = byQuestion.get(a.question_id) || { asked: 0, answered: 0, correct: 0, sortOrder: a.sort_order ?? 0 }
    cur.asked++
    if (a.selected_option_id) cur.answered++
    if (a.is_correct) cur.correct++
    byQuestion.set(a.question_id, cur)
  }

  const qIds = [...byQuestion.keys()]
  const { data: qs } = qIds.length
    ? await supabaseAdmin('questions', { query: `?id=in.(${qIds.join(',')})&select=id,stem,lesson_id` })
    : { data: [] as any[] }
  const qById = new Map((qs || []).map((q: any) => [q.id, q]))

  const questions = [...byQuestion.entries()].map(([questionId, st]) => {
    const q: any = qById.get(questionId)
    const ref = q ? refByLesson.get(q.lesson_id) : undefined
    return {
      questionId,
      sortOrder: st.sortOrder,
      stem: q?.stem ?? '',
      chapterTitle: ref?.chapterTitle ?? null,
      lessonRef: ref?.ref ?? null,
      lessonTitle: ref?.lessonTitle ?? null,
      asked: st.asked,
      answered: st.answered,
      correct: st.correct,
      rate: st.asked > 0 ? Math.round((st.correct / st.asked) * 100) : 0,
    }
  }).sort((a: any, b: any) => a.sortOrder - b.sortOrder)

  const rows = subs.map((s: any) => {
    const used = s.submitted_at && s.started_at
      ? Math.round((new Date(s.submitted_at).getTime() - new Date(s.started_at).getTime()) / 1000)
      : null
    return {
      sessionId: s.id,
      studentId: s.student_id,
      studentName: nameById.get(s.student_id) || '（未知）',
      total: s.total_questions,
      correct: s.total_correct,
      wrong: s.total_wrong,
      percentage: Number(s.score_percentage ?? 0),
      usedSeconds: used,
      submittedAt: s.submitted_at,
      submitReason: s.submit_reason,
    }
  })

  const scored = rows.map((r: any) => r.percentage)
  return NextResponse.json({
    paper: {
      id: paperRow?.id,
      title: paperRow?.title ?? '',
      durationMinutes: paperRow?.duration_minutes ?? 0,
      isPublished: !!paperRow?.is_published,
      courseName: course?.name ?? '',
    },
    submittedCount: rows.length,
    inProgressCount: inProgress,
    average: scored.length ? Math.round((scored.reduce((a: number, b: number) => a + b, 0) / scored.length) * 10) / 10 : null,
    highest: scored.length ? Math.max(...scored) : null,
    lowest: scored.length ? Math.min(...scored) : null,
    rows,
    questions,
  })
}
