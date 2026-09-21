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

async function canAccessCourse(userId: string, role: string | undefined, courseId: string | null): Promise<boolean> {
  if (!courseId) return false
  if (role === 'admin') return true
  const { data: course } = await supabaseAdmin('courses', { query: `?id=eq.${courseId}&select=owner_id` })
  if (course?.[0]?.owner_id === userId) return true
  const { data: cc } = await supabaseAdmin('course_collaborators', { query: `?course_id=eq.${courseId}&teacher_id=eq.${userId}&select=id` })
  return (cc || []).length > 0
}

// The specific questions a student answered in one test session (for drill-down)
async function sessionQuestions(userId: string, role: string | undefined, sessionId: string) {
  const { data: sess } = await supabaseAdmin('gate_test_sessions', {
    query: `?id=eq.${sessionId}&select=id,student_id,lesson_id,status`,
  })
  const s = sess?.[0]
  if (!s) return NextResponse.json({ error: '找不到该次测试' }, { status: 404 })

  const { data: ln } = await supabaseAdmin('lessons', { query: `?id=eq.${s.lesson_id}&select=chapter_id,title` })
  const { data: ch } = await supabaseAdmin('chapters', { query: `?id=eq.${ln?.[0]?.chapter_id}&select=course_id` })
  if (!await canAccessCourse(userId, role, ch?.[0]?.course_id ?? null)) {
    return NextResponse.json({ error: '无权访问' }, { status: 403 })
  }

  const { data: ans } = await supabaseAdmin('gate_test_answers', {
    query: `?session_id=eq.${sessionId}&order=answered_at&select=question_id,selected_option_id,is_correct`,
  })
  const rows: any[] = ans || []
  const qids: string[] = Array.from(new Set(rows.map((a: any) => a.question_id)))
  const qs = qids.length ? await fetchAllIn('questions', 'id', qids, 'id,stem,image_url') : []
  const opts = qids.length ? await fetchAllIn('question_options', 'question_id', qids, 'id,question_id,content,is_correct,display_order') : []
  const qMap = new Map(qs.map((q: any) => [q.id, q]))
  const optsByQ = new Map<string, any[]>()
  for (const o of opts) {
    const arr = optsByQ.get(o.question_id) || []
    arr.push(o)
    optsByQ.set(o.question_id, arr)
  }
  const prof = await supabaseAdmin('profiles', { query: `?id=eq.${s.student_id}&select=display_name` })

  return NextResponse.json({
    studentName: prof.data?.[0]?.display_name || '（学生）',
    lessonTitle: ln?.[0]?.title || '',
    status: s.status,
    questions: rows.map((a: any) => {
      const q = qMap.get(a.question_id)
      const os = (optsByQ.get(a.question_id) || []).sort((x: any, y: any) => x.display_order - y.display_order)
      const sel = os.find((o: any) => o.id === a.selected_option_id)
      const cor = os.find((o: any) => o.is_correct)
      return {
        stem: q?.stem || '',
        imageUrl: q?.image_url || null,
        isCorrect: a.is_correct,
        options: os.map((o: any) => ({ content: o.content, isCorrect: o.is_correct })),
        selected: sel?.content || '',
        correct: cor?.content || '',
      }
    }),
  })
}

// Every question a student ever answered wrong in this course (their wrong book)
async function studentWrongBook(
  userId: string, role: string | undefined,
  params: { scope: string; classId: string | null; courseId: string | null; studentId: string },
) {
  let courseId = params.courseId
  if (params.scope === 'class') {
    if (!params.classId) return NextResponse.json({ error: '缺少classId' }, { status: 400 })
    const { data: cls } = await supabaseAdmin('classes', { query: `?id=eq.${params.classId}&select=course_id,teacher_id,name` })
    const c = cls?.[0]
    if (!c) return NextResponse.json({ error: '班级不存在' }, { status: 404 })
    if (!(role === 'admin' || c.teacher_id === userId)) return NextResponse.json({ error: '无权访问' }, { status: 403 })
    courseId = c.course_id
  } else if (!await canAccessCourse(userId, role, courseId)) {
    return NextResponse.json({ error: '无权访问' }, { status: 403 })
  }
  if (!courseId) return NextResponse.json({ studentName: '', questions: [] })

  const prof = await supabaseAdmin('profiles', { query: `?id=eq.${params.studentId}&select=display_name` })
  const studentName = prof.data?.[0]?.display_name || '（学生）'

  const chapters = await fetchAllIn('chapters', 'course_id', [courseId], 'id')
  const lessons = chapters.length ? await fetchAllIn('lessons', 'chapter_id', chapters.map((c: any) => c.id), 'id,title') : []
  const lessonIdSet = new Set(lessons.map((l: any) => l.id))
  const lessonTitle = new Map<string, string>(lessons.map((l: any) => [l.id, l.title]))
  if (lessonIdSet.size === 0) return NextResponse.json({ studentName, questions: [] })

  const sess = await fetchAllIn('gate_test_sessions', 'student_id', [params.studentId], 'id,lesson_id')
  const sids = sess.filter((s: any) => lessonIdSet.has(s.lesson_id)).map((s: any) => s.id)
  if (sids.length === 0) return NextResponse.json({ studentName, questions: [] })

  const answers = await fetchAllIn('gate_test_answers', 'session_id', sids, 'question_id,is_correct')
  const agg = new Map<string, { wrong: number; correct: number }>()
  for (const a of answers) {
    const e = agg.get(a.question_id) || { wrong: 0, correct: 0 }
    if (a.is_correct) e.correct++
    else e.wrong++
    agg.set(a.question_id, e)
  }
  const wrongIds = [...agg.entries()].filter(([, e]) => e.wrong > 0).map(([id]) => id)
  if (wrongIds.length === 0) return NextResponse.json({ studentName, questions: [] })

  const qs = await fetchAllIn('questions', 'id', wrongIds, 'id,stem,image_url,lesson_id')
  const opts = await fetchAllIn('question_options', 'question_id', wrongIds, 'id,question_id,content,is_correct,display_order')
  const optsByQ = new Map<string, any[]>()
  for (const o of opts) {
    const arr = optsByQ.get(o.question_id) || []
    arr.push(o)
    optsByQ.set(o.question_id, arr)
  }

  return NextResponse.json({
    studentName,
    questions: qs.map((q: any) => {
      const e = agg.get(q.id) || { wrong: 0, correct: 0 }
      return {
        stem: q.stem || '',
        imageUrl: q.image_url || null,
        lessonTitle: lessonTitle.get(q.lesson_id) || '',
        wrongCount: e.wrong,
        solved: e.correct > 0,
        options: (optsByQ.get(q.id) || [])
          .sort((x: any, y: any) => x.display_order - y.display_order)
          .map((o: any) => ({ content: o.content, isCorrect: o.is_correct })),
      }
    }),
  })
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
  const sessionIdParam = searchParams.get('sessionId')

  // Drill-down: the questions of one specific test session
  if (sessionIdParam) {
    return sessionQuestions(user.id, role, sessionIdParam)
  }
  // Drill-down: one student's wrong book for this course
  const studentIdParam = searchParams.get('studentId')
  if (studentIdParam) {
    return studentWrongBook(user.id, role, { scope, classId: classIdParam, courseId: courseIdParam, studentId: studentIdParam })
  }

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
    if (!await canAccessCourse(user.id, role, courseIdParam)) {
      return NextResponse.json({ error: '无权访问' }, { status: 403 })
    }
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
  // Order lessons by chapter order, then lesson order
  lessons.sort((a: any, b: any) =>
    ((chapterSort.get(a.chapter_id) ?? 0) - (chapterSort.get(b.chapter_id) ?? 0)) || (a.sort_order - b.sort_order))

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
  const questions = await fetchAllIn('questions', 'lesson_id', lessonIds, 'id,lesson_id,knowledge_point_id,stem,question_type,image_url')
  const knowledgePoints = await fetchAllIn('knowledge_points', 'lesson_id', lessonIds, 'id,lesson_id,title,sort_order')
  const questionOptions = await fetchAllIn('question_options', 'question_id', questions.map((q: any) => q.id), 'id,question_id,content,is_correct,display_order')
  const optionsByQuestion = new Map<string, any[]>()
  for (const o of questionOptions) {
    const arr = optionsByQuestion.get(o.question_id)
    if (arr) arr.push(o)
    else optionsByQuestion.set(o.question_id, [o])
  }

  // Sessions in scope (only this course's lessons)
  const lessonIdSet = new Set(lessonIds)
  const allSessions = await fetchAllIn('gate_test_sessions', 'student_id', studentIds, 'id,student_id,lesson_id,status,started_at,completed_at')
  const sessions = allSessions.filter((s: any) => lessonIdSet.has(s.lesson_id))

  // Focus-lost counts (best effort — returns nothing if the column isn't migrated yet)
  const focusBySession = new Map<string, number>()
  const focusRows = await fetchAllIn('gate_test_sessions', 'student_id', studentIds, 'id,focus_lost_count')
  for (const f of focusRows) focusBySession.set(f.id, f.focus_lost_count || 0)

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
      imageUrl: q.image_url || null,
      options: (optionsByQuestion.get(q.id) || [])
        .sort((a: any, b: any) => a.display_order - b.display_order)
        .map((o: any) => ({ id: o.id, content: o.content, isCorrect: o.is_correct })),
      knowledgePointId: q.knowledge_point_id || null,
      attempts,
      correct,
      wrong: attempts - correct,
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

  // A student's pass comes from student_progress — the same source 课堂管理 uses,
  // so the two views agree.
  const progress = await fetchAllIn('student_progress', 'lesson_id', lessonIds, 'student_id,lesson_id,status,passed_at')
  const passedSet = new Set(progress.filter((p: any) => p.status === 'passed').map((p: any) => `${p.student_id}|${p.lesson_id}`))
  const passedAtMap = new Map<string, string>()
  for (const p of progress) {
    if (p.status === 'passed' && p.passed_at) passedAtMap.set(`${p.student_id}|${p.lesson_id}`, p.passed_at)
  }
  // Students (within scope) who passed each lesson — the pass-rate numerator.
  const scopeSet = new Set(studentIds)
  const passedByLesson = new Map<string, Set<string>>()
  for (const p of progress) {
    if (p.status !== 'passed' || !scopeSet.has(p.student_id)) continue
    const set = passedByLesson.get(p.lesson_id) || new Set<string>()
    set.add(p.student_id)
    passedByLesson.set(p.lesson_id, set)
  }

  // Per-session correct / wrong counts (from the recorded answers)
  const sessionCounts = new Map<string, { correct: number; wrong: number }>()
  for (const a of courseAnswers) {
    const c = sessionCounts.get(a.session_id) || { correct: 0, wrong: 0 }
    if (a.is_correct) c.correct++
    else c.wrong++
    sessionCounts.set(a.session_id, c)
  }

  // Per (student, lesson): only *completed* test sessions count as attempts.
  const byStudentLesson = new Map<string, any[]>()
  for (const s of sessions) {
    if (!s.completed_at) continue
    const key = `${s.student_id}|${s.lesson_id}`
    const arr = byStudentLesson.get(key)
    if (arr) arr.push(s)
    else byStudentLesson.set(key, [s])
  }

  interface Attempt { sessionId: string; seconds: number | null; correct: number; wrong: number; focusLost: number; secPerQ: number | null }
  interface SL { studentId: string; lessonId: string; attempts: number; passed: boolean; passedFirst: boolean; attemptsDetail: Attempt[]; passIndex: number }
  const perStudentLesson: SL[] = []
  for (const [key, rows] of byStudentLesson) {
    const [studentId, lessonId] = key.split('|')
    rows.sort((a: any, b: any) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime())
    const attemptsDetail: Attempt[] = rows.map((r: any) => {
      const sec = Math.round((new Date(r.completed_at).getTime() - new Date(r.started_at).getTime()) / 1000)
      const c = sessionCounts.get(r.id) || { correct: 0, wrong: 0 }
      const answered = c.correct + c.wrong
      return {
        sessionId: r.id,
        seconds: sec >= 0 ? sec : null,
        correct: c.correct,
        wrong: c.wrong,
        focusLost: focusBySession.get(r.id) || 0,
        secPerQ: answered > 0 && sec >= 0 ? Math.round(sec / answered) : null,
      }
    })
    const passed = passedSet.has(key)
    const passedFirst = rows.length > 0 && rows[0].status === 'passed'
    // Which attempt first passed: the session whose completion is closest to the
    // recorded pass time (passed_at). -1 when not passed / unknown.
    let passIndex = -1
    if (passed) {
      const at = passedAtMap.get(key)
      if (at) {
        const target = new Date(at).getTime()
        let best = Infinity
        rows.forEach((r: any, i: number) => {
          const d = Math.abs(new Date(r.completed_at).getTime() - target)
          if (d < best) { best = d; passIndex = i }
        })
      } else {
        passIndex = rows.length - 1
      }
    }
    perStudentLesson.push({ studentId, lessonId, attempts: rows.length, passed, passedFirst, attemptsDetail, passIndex })
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
    const durations = rows.flatMap((r) => r.attemptsDetail.map((a) => a.seconds).filter((s): s is number => s !== null))
    const passedCount = passedByLesson.get(l.id)?.size || 0
    const firstPass = rows.filter((r) => r.passedFirst).length
    const totalStudents = studentIds.length
    return {
      id: l.id,
      title: l.title,
      chapterTitle: chapterTitle.get(l.chapter_id) || '',
      attempted: rows.length,
      passed: passedCount,
      passRate: totalStudents > 0 ? Math.round((passedCount / totalStudents) * 100) : null,
      firstPassRate: rows.length > 0 ? Math.round((firstPass / rows.length) * 100) : null,
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
        passIndex: r.passIndex,
        attemptDetail: r.attemptsDetail,
      }))
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'zh'))
  }

  // Per-student distinct wrong-question counts (for the student wrong-book module)
  const studentWrong = new Map<string, Set<string>>()
  for (const a of courseAnswers) {
    if (a.is_correct) continue
    const sid = sessionStudent.get(a.session_id)
    if (!sid) continue
    const set = studentWrong.get(sid) || new Set<string>()
    set.add(a.question_id)
    studentWrong.set(sid, set)
  }
  const studentList = studentIds
    .map((id: string) => ({ id, name: nameById.get(id) || '（学生）', wrongCount: studentWrong.get(id)?.size || 0 }))
    .sort((a: any, b: any) => b.wrongCount - a.wrongCount || a.name.localeCompare(b.name, 'zh'))

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
    studentList,
  })
}
