import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/admin'
import { classesOfStudents, loadMockCourse, isAdminUser } from '@/lib/mock-source'
import { NextResponse } from 'next/server'

// One student's performance ACROSS the papers of a mock course — a students ×
// papers matrix. This is the "how is he doing over several mock exams" view; the
// per-paper endpoint only ever answers "how did this paper go".
//   GET ?courseId=&classId=
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const params = new URL(request.url).searchParams
  const courseId = params.get('courseId')
  const classId = params.get('classId') || ''
  if (!courseId) return NextResponse.json({ error: '缺少courseId' }, { status: 400 })

  const { course, error, status } = await loadMockCourse(user.id, courseId, await isAdminUser())
  if (error) return NextResponse.json({ error }, { status: status || 400 })

  const { data: papers } = await supabaseAdmin('mock_papers', {
    query: `?mock_course_id=eq.${courseId}&order=sort_order&select=id,title,duration_minutes,is_published`,
  })
  const paperRows = (papers || []) as any[]
  if (paperRows.length === 0) {
    return NextResponse.json({ papers: [], students: [], classes: [], classId, courseName: course!.name })
  }

  const { data: sessions } = await supabaseAdmin('mock_test_sessions', {
    query: `?paper_id=in.(${paperRows.map((p) => p.id).join(',')})&status=eq.submitted&select=id,paper_id,student_id,score_percentage,total_correct,total_questions,submitted_at`,
  })
  const subs = (sessions || []) as any[]

  // How many questions each paper has, so the mastery figure below is "share of
  // the whole paper", matching what the student and the per-paper page show.
  const { data: paperQs } = await supabaseAdmin('mock_paper_questions', {
    query: `?paper_id=in.(${paperRows.map((p) => p.id).join(',')})&select=paper_id,question_id`,
  })
  const qidsByPaper = new Map<string, string[]>()
  for (const r of (paperQs || []) as any[]) {
    if (!qidsByPaper.has(r.paper_id)) qidsByPaper.set(r.paper_id, [])
    qidsByPaper.get(r.paper_id)!.push(r.question_id)
  }

  // Which of a paper's questions each student has EVER answered correctly — the
  // same running-mastery figure the student and the per-paper page report.
  const studentOfSession = new Map(subs.map((s: any) => [s.id, s.student_id]))
  const studentOfPaper = new Map(subs.map((s: any) => [s.id, s.paper_id]))
  const correctPairs = new Map<string, Set<string>>()   // `${studentId}|${paperId}` → question ids
  const subIds = subs.map((s: any) => s.id)
  for (let i = 0; i < subIds.length; i += 100) {
    const chunk = subIds.slice(i, i + 100)
    const { data } = await supabaseAdmin('mock_test_answers', {
      query: `?session_id=in.(${chunk.join(',')})&is_correct=eq.true&select=session_id,question_id`,
    })
    for (const a of (data || []) as any[]) {
      const sid = studentOfSession.get(a.session_id)
      const pid = studentOfPaper.get(a.session_id)
      if (!sid || !pid) continue
      const key = `${sid}|${pid}`
      if (!correctPairs.has(key)) correctPairs.set(key, new Set())
      correctPairs.get(key)!.add(a.question_id)
    }
  }

  const studentIds = [...new Set(subs.map((s) => s.student_id))]
  const { data: profiles } = studentIds.length
    ? await supabaseAdmin('profiles', { query: `?id=in.(${studentIds.join(',')})&select=id,display_name` })
    : { data: [] as any[] }
  const nameById = new Map((profiles || []).map((p: any) => [p.id, p.display_name]))

  const { classes, byStudent } = await classesOfStudents(studentIds)
  const inClass = (sid: string) => !classId || (byStudent.get(sid) || []).includes(classId)
  const visible = subs.filter((s) => inClass(s.student_id))

  // student → paper → best score. A student may sit a paper more than once; the
  // best attempt is the one that represents their ability.
  // One cell per student × paper: the share of the WHOLE paper that student has
  // answered correctly by now. The sessionId of their latest sitting rides along
  // so clicking a cell opens that attempt's answers.
  const cell = new Map<string, Map<string, { sessionId: string; percentage: number; correct: number; total: number; submittedAt: string | null }>>()
  for (const s of visible) {
    const row = cell.get(s.student_id) || new Map()
    const prev = row.get(s.paper_id)
    const paperTotal = qidsByPaper.get(s.paper_id)?.length || 0
    const correct = correctPairs.get(`${s.student_id}|${s.paper_id}`)?.size ?? 0
    const pct = paperTotal ? Math.round((correct / paperTotal) * 10000) / 100 : 0
    // keep the newest sitting (a retest supersedes the first attempt)
    if (!prev || new Date(s.submitted_at || 0).getTime() >= new Date(prev.submittedAt || 0).getTime()) {
      row.set(s.paper_id, { sessionId: s.id, percentage: pct, correct, total: paperTotal, submittedAt: s.submitted_at })
    }
    cell.set(s.student_id, row)
  }

  const students = [...cell.entries()].map(([studentId, row]) => {
    const scores = Object.fromEntries([...row.entries()].map(([pid, v]) => [pid, v]))
    const vals = [...row.values()].map((v) => v.percentage)
    return {
      studentId,
      studentName: nameById.get(studentId) || '（未知）',
      classNames: (byStudent.get(studentId) || []).map((cid) => classes.find((c) => c.id === cid)?.name).filter(Boolean),
      scores,
      taken: vals.length,
      average: vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null,
      // last minus first, so a teacher can see direction rather than just level
      trend: vals.length >= 2 ? Math.round((vals[vals.length - 1] - vals[0]) * 10) / 10 : null,
    }
  }).sort((a, b) => (b.average ?? -1) - (a.average ?? -1))

  return NextResponse.json({
    courseName: course!.name,
    classId,
    classes,
    papers: paperRows.map((p) => ({ id: p.id, title: p.title, isPublished: !!p.is_published })),
    students,
  })
}
