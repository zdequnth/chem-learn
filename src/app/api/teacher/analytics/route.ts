import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/admin'
import { NextResponse } from 'next/server'

// Below this many answers, a correct-rate is shown as "—" to avoid noise.
const MIN_SAMPLES = 5
const CHUNK = 120

function chunk<T>(arr: T[], size = CHUNK): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// PostgREST has no GROUP BY and URLs have a length limit, so fetch in chunks.
// Page within each chunk so a server-side row cap never silently truncates.
const PAGE = 1000

async function fetchAllIn(table: string, column: string, ids: string[], select = '*'): Promise<any[]> {
  if (ids.length === 0) return []
  const out: any[] = []
  for (const part of chunk(ids)) {
    let offset = 0
    while (true) {
      const { data } = await supabaseAdmin(table, {
        query: `?${column}=in.(${part.join(',')})&select=${select}&limit=${PAGE}&offset=${offset}`,
      })
      const rows = data || []
      out.push(...rows)
      if (rows.length < PAGE) break
      offset += PAGE
    }
  }
  return out
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })
  const role = (user.user_metadata as any)?.role

  const { searchParams } = new URL(request.url)
  const scope = searchParams.get('scope') === 'class' ? 'class' : 'course'
  const classIdParam = searchParams.get('classId')
  const courseIdParam = searchParams.get('courseId')
  const lessonIdParam = searchParams.get('lessonId')

  let courseId: string | null = null
  let scopeName = ''
  let studentIds: string[] | null = null // null → derive from course activity

  if (scope === 'class') {
    if (!classIdParam) return NextResponse.json({ error: '缺少classId' }, { status: 400 })
    const { data: cls } = await supabaseAdmin('classes', { query: `?id=eq.${classIdParam}&select=*` })
    const c = cls?.[0]
    if (!c) return NextResponse.json({ error: '班级不存在' }, { status: 404 })
    if (!(role === 'admin' || c.teacher_id === user.id)) return NextResponse.json({ error: '无权访问' }, { status: 403 })
    scopeName = c.name
    courseId = c.course_id || null
    if (!courseId) {
      return NextResponse.json({ scope, scopeName, empty: true, reason: '该班级未绑定课程', questions: [], knowledgePoints: [], lessons: [] })
    }
    const members = await fetchAllIn('class_members', 'class_id', [classIdParam], 'student_id')
    studentIds = members.map((m: any) => m.student_id)
  } else {
    if (!courseIdParam) return NextResponse.json({ error: '缺少courseId' }, { status: 400 })
    let allowed = role === 'admin'
    if (!allowed) {
      const { data: course } = await supabaseAdmin('courses', { query: `?id=eq.${courseIdParam}&select=owner_id,name` })
      if (course?.[0]?.owner_id === user.id) allowed = true
      else {
        const { data: cc } = await supabaseAdmin('course_collaborators', { query: `?course_id=eq.${courseIdParam}&teacher_id=eq.${user.id}&select=id` })
        allowed = (cc || []).length > 0
      }
    }
    if (!allowed) return NextResponse.json({ error: '无权访问' }, { status: 403 })
    const { data: course } = await supabaseAdmin('courses', { query: `?id=eq.${courseIdParam}&select=name` })
    scopeName = course?.[0]?.name || ''
    courseId = courseIdParam
  }

  // Course structure
  const chapters = await fetchAllIn('chapters', 'course_id', [courseId], 'id,title,sort_order')
  const lessons = chapters.length
    ? await fetchAllIn('lessons', 'chapter_id', chapters.map((c: any) => c.id), 'id,title,sort_order,chapter_id')
    : []
  const lessonIds = lessons.map((l: any) => l.id)
  const lessonTitle = new Map<string, string>(lessons.map((l: any) => [l.id, l.title]))
  const chapterTitle = new Map<string, string>(chapters.map((c: any) => [c.id, c.title]))
  const chapterSort = new Map<string, number>(chapters.map((c: any) => [c.id, c.sort_order]))
  const lessonChapter = new Map<string, string>(lessons.map((l: any) => [l.id, l.chapter_id]))

  if (lessonIds.length === 0) {
    return NextResponse.json({ scope, scopeName, empty: true, questions: [], knowledgePoints: [], lessons: [] })
  }

  // Student set (course scope: everyone who touched this course)
  if (studentIds === null) {
    const sess = await fetchAllIn('gate_test_sessions', 'lesson_id', lessonIds, 'student_id')
    const prog = await fetchAllIn('student_progress', 'lesson_id', lessonIds, 'student_id')
    studentIds = [...new Set([
      ...sess.map((s: any) => s.student_id),
      ...prog.map((p: any) => p.student_id),
    ])]
  }

  const profiles = await fetchAllIn('profiles', 'id', studentIds, 'id,display_name')
  const nameById = new Map<string, string>(profiles.map((p: any) => [p.id, p.display_name]))

  // Content
  const questions = await fetchAllIn('questions', 'lesson_id', lessonIds, 'id,lesson_id,knowledge_point_id,stem,question_type')
  const knowledgePoints = await fetchAllIn('knowledge_points', 'lesson_id', lessonIds, 'id,lesson_id,title,sort_order')

  // Sessions in scope (only this course's lessons)
  const lessonIdSet = new Set(lessonIds)
  const allSessions = await fetchAllIn('gate_test_sessions', 'student_id', studentIds, 'id,student_id,lesson_id,status,started_at,completed_at')
  const sessions = allSessions.filter((s: any) => lessonIdSet.has(s.lesson_id))

  // Answers for those sessions; keep only this course's questions
  const sessionIds = sessions.map((s: any) => s.id)
  const answers = await fetchAllIn('gate_test_answers', 'session_id', sessionIds, 'session_id,question_id,is_correct')
  const sessionStudent = new Map<string, string>(sessions.map((s: any) => [s.id, s.student_id]))
  const questionIdSet = new Set(questions.map((q: any) => q.id))
  const courseAnswers = answers.filter((a: any) => questionIdSet.has(a.question_id))

  // Per-question stats
  const qStat = new Map<string, { attempts: number; correct: number; wrongStudents: Set<string> }>()
  for (const a of courseAnswers) {
    let st = qStat.get(a.question_id)
    if (!st) { st = { attempts: 0, correct: 0, wrongStudents: new Set() }; qStat.set(a.question_id, st) }
    st.attempts++
    if (a.is_correct) st.correct++
    else {
      const sid = sessionStudent.get(a.session_id)
      if (sid) st.wrongStudents.add(sid)
    }
  }
  const rateOf = (correct: number, attempts: number) =>
    attempts >= MIN_SAMPLES ? Math.round((correct / attempts) * 100) : null

  const questionStats = questions.map((q: any) => {
    const st = qStat.get(q.id)
    const attempts = st?.attempts || 0
    const correct = st?.correct || 0
    return {
      id: q.id,
      lessonId: q.lesson_id,
      lessonTitle: lessonTitle.get(q.lesson_id) || '',
      chapterTitle: chapterTitle.get(lessonChapter.get(q.lesson_id) || '') || '',
      chapterOrder: chapterSort.get(lessonChapter.get(q.lesson_id) || '') ?? 0,
      questionType: q.question_type,
      stem: q.stem,
      knowledgePointId: q.knowledge_point_id || null,
      attempts,
      correct,
      rate: rateOf(correct, attempts),
      wrongStudents: st ? st.wrongStudents.size : 0,
    }
  })

  // Knowledge-point rollup (weighted by answers)
  const kpAgg = new Map<string, { attempts: number; correct: number }>()
  for (const q of questions) {
    if (!q.knowledge_point_id) continue
    const st = qStat.get(q.id)
    if (!st) continue
    const k = kpAgg.get(q.knowledge_point_id) || { attempts: 0, correct: 0 }
    k.attempts += st.attempts
    k.correct += st.correct
    kpAgg.set(q.knowledge_point_id, k)
  }
  const kpStats = knowledgePoints.map((kp: any) => {
    const k = kpAgg.get(kp.id) || { attempts: 0, correct: 0 }
    return {
      id: kp.id,
      lessonId: kp.lesson_id,
      lessonTitle: lessonTitle.get(kp.lesson_id) || '',
      title: kp.title,
      attempts: k.attempts,
      correct: k.correct,
      rate: rateOf(k.correct, k.attempts),
    }
  })

  // Per (student, lesson): attempts up to first pass, and durations
  const byStudentLesson = new Map<string, any[]>()
  for (const s of sessions) {
    const key = `${s.student_id}|${s.lesson_id}`
    const arr = byStudentLesson.get(key)
    if (arr) arr.push(s)
    else byStudentLesson.set(key, [s])
  }

  interface SL { studentId: string; lessonId: string; attempts: number; passed: boolean; durations: number[] }
  const perStudentLesson: SL[] = []
  for (const [key, rows] of byStudentLesson) {
    const [studentId, lessonId] = key.split('|')
    rows.sort((a: any, b: any) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime())
    const firstPassed = rows.findIndex((r: any) => r.status === 'passed')
    const count = firstPassed >= 0 ? firstPassed + 1 : rows.length
    const used = rows.slice(0, count)
    const durations: number[] = []
    for (const r of used) {
      if (r.completed_at && r.started_at) {
        const sec = Math.round((new Date(r.completed_at).getTime() - new Date(r.started_at).getTime()) / 1000)
        if (sec >= 0) durations.push(sec)
      }
    }
    perStudentLesson.push({ studentId, lessonId, attempts: count, passed: firstPassed >= 0, durations })
  }

  const median = (nums: number[]) => {
    if (nums.length === 0) return null
    const s = [...nums].sort((a, b) => a - b)
    const mid = Math.floor(s.length / 2)
    return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2)
  }
  const mean = (nums: number[]) => nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : null

  const lessonStats = lessons.map((l: any) => {
    const rows = perStudentLesson.filter((r) => r.lessonId === l.id)
    const passedRows = rows.filter((r) => r.passed)
    const durations = rows.flatMap((r) => r.durations)
    return {
      id: l.id,
      title: l.title,
      chapterTitle: chapterTitle.get(l.chapter_id) || '',
      attempted: rows.length,
      passed: passedRows.length,
      passRate: rows.length ? Math.round((passedRows.length / rows.length) * 100) : null,
      avgAttempts: rows.length ? Math.round((rows.reduce((a, r) => a + r.attempts, 0) / rows.length) * 10) / 10 : null,
      medianSeconds: median(durations),
      avgSeconds: mean(durations),
    }
  })

  // On-demand per-student detail for one lesson
  let detail: any[] | null = null
  if (lessonIdParam && lessonIdSet.has(lessonIdParam)) {
    detail = perStudentLesson
      .filter((r) => r.lessonId === lessonIdParam)
      .map((r) => ({
        studentId: r.studentId,
        name: nameById.get(r.studentId) || '（学生）',
        attempts: r.attempts,
        passed: r.passed,
        durations: r.durations,
      }))
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'zh'))
  }

  const empty = sessions.length === 0 && courseAnswers.length === 0
  return NextResponse.json({
    scope,
    scopeName,
    students: studentIds.length,
    empty,
    questions: questionStats,
    knowledgePoints: kpStats,
    lessons: lessonStats,
    detail,
  })
}
