import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/admin'
import { classesOfStudents, loadPaperForTeacher, loadSourceOutline, isAdminUser } from '@/lib/mock-source'
import { NextResponse } from 'next/server'

// Results of one mock paper: who sat it, how they did, and which QUESTIONS the
// class struggled with (each mapped back to its chapter/lesson so the teacher
// knows what to re-teach).
//   GET ?paperId=
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const params = new URL(request.url).searchParams
  const paperId = params.get('paperId')
  const classId = params.get('classId') || ''
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
  const allSessions = (sessions || []) as any[]

  // A published mock course is sat by several classes at once, so the raw list
  // mixes them. Offer the participating classes and let the teacher narrow down.
  const { classes, byStudent } = await classesOfStudents([...new Set(allSessions.map((s) => s.student_id))])
  const inClass = (studentId: string) => !classId || (byStudent.get(studentId) || []).includes(classId)

  const scoped = allSessions.filter((s) => inClass(s.student_id))
  const subs = scoped.filter((s: any) => s.status === 'submitted')
  const inProgress = scoped.length - subs.length

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
      query: `?session_id=in.(${sessionIds.slice(i, i + 100).join(',')})&select=session_id,question_id,sort_order,selected_option_id,is_correct`,
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

  // Per question, counted PER STUDENT, not per sitting: a question is "known" once
  // a student has answered it correctly, however many goes it took. Counting each
  // sitting separately would make a question look harder the more it is retested.
  const studentsAsked = new Map<string, Set<string>>()
  const studentsCorrect = new Map<string, Set<string>>()
  const sessionStudent = new Map(subs.map((s: any) => [s.id, s.student_id]))
  for (const a of answers) {
    const sid = sessionStudent.get(a.session_id)
    if (!sid) continue
    if (a.selected_option_id) {
      if (!studentsAsked.has(a.question_id)) studentsAsked.set(a.question_id, new Set())
      studentsAsked.get(a.question_id)!.add(sid)
    }
    if (a.is_correct) {
      if (!studentsCorrect.has(a.question_id)) studentsCorrect.set(a.question_id, new Set())
      studentsCorrect.get(a.question_id)!.add(sid)
    }
  }

  const questions = [...byQuestion.entries()].map(([questionId, st]) => {
    const q: any = qById.get(questionId)
    const ref = q ? refByLesson.get(q.lesson_id) : undefined
    const asked = studentsAsked.get(questionId)?.size ?? 0
    const correct = studentsCorrect.get(questionId)?.size ?? 0
    return {
      questionId,
      sortOrder: st.sortOrder,
      stem: q?.stem ?? '',
      chapterTitle: ref?.chapterTitle ?? null,
      lessonRef: ref?.ref ?? null,
      lessonTitle: ref?.lessonTitle ?? null,
      asked,
      correct,
      rate: asked > 0 ? Math.round((correct / asked) * 100) : 0,
    }
  }).sort((a: any, b: any) => a.sortOrder - b.sortOrder)

  // How many questions of the paper each student has never answered correctly —
  // computed in bulk from the answers already in hand rather than one query per
  // student.
  const paperQs = questions.map((q: any) => q.questionId)
  const sessionOwner = new Map(subs.map((s: any) => [s.id, s.student_id]))
  const everCorrectByStudent = new Map<string, Set<string>>()
  for (const a of answers) {
    if (!a.is_correct) continue
    const sid = sessionOwner.get(a.session_id)
    if (!sid) continue
    if (!everCorrectByStudent.has(sid)) everCorrectByStudent.set(sid, new Set())
    everCorrectByStudent.get(sid)!.add(a.question_id)
  }

  // ONE row per student, with their attempts in order. A student who retests
  // several times would otherwise appear several times and the table would not
  // show progress at all.
  const attemptsByStudent = new Map<string, any[]>()
  for (const s of subs) {
    if (!attemptsByStudent.has(s.student_id)) attemptsByStudent.set(s.student_id, [])
    attemptsByStudent.get(s.student_id)!.push(s)
  }

  const paperTotal = paperQs.length || 1
  const rows = [...attemptsByStudent.entries()].map(([studentId, sessions]) => {
    const ordered = [...sessions].sort((a, b) =>
      new Date(a.submitted_at || a.started_at).getTime() - new Date(b.submitted_at || b.started_at).getTime())

    // Same running-mastery figure the student sees: how many of the paper's
    // questions have been answered correctly by the end of each sitting.
    const correctSoFar = new Set<string>()
    const answersBySessionId = new Map<string, any[]>()
    for (const a of answers) {
      if (!answersBySessionId.has(a.session_id)) answersBySessionId.set(a.session_id, [])
      answersBySessionId.get(a.session_id)!.push(a)
    }
    const attempts = ordered.map((s: any, i: number) => {
      const ans = answersBySessionId.get(s.id) || []
      let correctHere = 0
      for (const a of ans) if (a.is_correct) { correctHere++; correctSoFar.add(a.question_id) }
      const cumulative = paperQs.filter((q: string) => correctSoFar.has(q)).length
      return {
        n: i + 1,
        sessionId: s.id,
        mode: s.mode || 'full',
        correctInAttempt: correctHere,
        totalInAttempt: ans.length,
        cumulativeCorrect: cumulative,
        cumulativePercentage: Math.round((cumulative / paperTotal) * 10000) / 100,
        usedSeconds: s.submitted_at && s.started_at
          ? Math.round((new Date(s.submitted_at).getTime() - new Date(s.started_at).getTime()) / 1000)
          : null,
        submittedAt: s.submitted_at,
        submitReason: s.submit_reason,
      }
    })
    const latest = attempts[attempts.length - 1]
    const neverCorrect = paperQs.filter((q: string) => !everCorrectByStudent.get(studentId)?.has(q)).length
    return {
      studentId,
      studentName: nameById.get(studentId) || '（未知）',
      attempts,
      attemptCount: attempts.length,
      latestSessionId: latest?.sessionId ?? null,
      // Reported as mastery: the share of the whole paper this student now has right.
      latestPercentage: latest?.cumulativePercentage ?? null,
      paperTotal,
      neverCorrect,
    }
  }).sort((a, b) => (b.latestPercentage ?? -1) - (a.latestPercentage ?? -1))

  // Averages are over students' LATEST attempt, so a class that retested does not
  // look worse for having had more goes at it.
  const scored = rows.map((r: any) => r.latestPercentage ?? 0)
  return NextResponse.json({
    paper: {
      id: paperRow?.id,
      title: paperRow?.title ?? '',
      durationMinutes: paperRow?.duration_minutes ?? 0,
      isPublished: !!paperRow?.is_published,
      courseName: course?.name ?? '',
    },
    classes,
    classId,
    submittedCount: rows.length,
    inProgressCount: inProgress,
    average: scored.length ? Math.round((scored.reduce((a: number, b: number) => a + b, 0) / scored.length) * 10) / 10 : null,
    highest: scored.length ? Math.max(...scored) : null,
    lowest: scored.length ? Math.min(...scored) : null,
    rows,
    questions,
  })
}
