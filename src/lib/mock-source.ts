// Server-only helpers for mock exam courses. Kept out of src/lib/mock-exam.ts
// because that file is imported by client components.
import { supabaseAdmin } from './admin'
import { GRACE_SECONDS } from './mock-exam'

export interface OutlineLesson {
  ref: string          // "5.3" — chapter number . lesson number, by position
  lessonId: string
  chapterId: string
  chapterTitle: string
  lessonTitle: string
}

export interface SourceOutline {
  courseId: string
  courseName: string
  lessons: OutlineLesson[]
  byRef: Map<string, OutlineLesson>
  // The numbered list handed to the AI. Refs, never UUIDs — models corrupt
  // 36-character ids, and a "5.3" token can be validated exactly.
  promptList: string
}

// The outline of the gate course a mock course is built from. Chapter/lesson
// numbers come from POSITION, not sort_order, because some courses have
// duplicate sort_order values.
export async function loadSourceOutline(sourceCourseId: string): Promise<SourceOutline | null> {
  const { data: courseRows } = await supabaseAdmin('courses', {
    query: `?id=eq.${sourceCourseId}&select=id,name`,
  })
  const course = courseRows?.[0]
  if (!course) return null

  const { data: chapters } = await supabaseAdmin('chapters', {
    query: `?course_id=eq.${sourceCourseId}&order=sort_order&select=id,title`,
  })
  const chs = chapters || []
  const lessons: OutlineLesson[] = []
  const lines: string[] = []

  for (let ci = 0; ci < chs.length; ci++) {
    const ch = chs[ci]
    lines.push(`第${ci + 1}章 ${ch.title}`)
    const { data: ls } = await supabaseAdmin('lessons', {
      query: `?chapter_id=eq.${ch.id}&order=sort_order&select=id,title`,
    })
    ;(ls || []).forEach((l: any, li: number) => {
      const ref = `${ci + 1}.${li + 1}`
      lines.push(`  ${ref} ${l.title}`)
      lessons.push({ ref, lessonId: l.id, chapterId: ch.id, chapterTitle: ch.title, lessonTitle: l.title })
    })
  }

  return {
    courseId: course.id,
    courseName: course.name,
    lessons,
    byRef: new Map(lessons.map((l) => [l.ref, l])),
    promptList: lines.join('\n'),
  }
}

export interface MockCourse {
  id: string
  name: string
  kind: string
  owner_id: string
  mock_source_course_id: string | null
}

// A mock course is editable by its owner and by collaborators, same as any other
// course. RLS does not help here — the routes read through the service role.
export async function loadMockCourse(
  userId: string,
  mockCourseId: string,
  isAdmin = false,
): Promise<{ course?: MockCourse; error?: string; status?: number }> {
  const { data } = await supabaseAdmin('courses', {
    query: `?id=eq.${mockCourseId}&select=id,name,kind,owner_id,mock_source_course_id`,
  })
  const course = data?.[0]
  if (!course) return { error: '课程不存在', status: 404 }
  if (course.kind !== 'mock') return { error: '这不是模拟考课程', status: 400 }
  if (isAdmin || course.owner_id === userId) return { course }

  const { data: cc } = await supabaseAdmin('course_collaborators', {
    query: `?course_id=eq.${mockCourseId}&teacher_id=eq.${userId}&select=id`,
  })
  if ((cc || []).length > 0) return { course }
  return { error: '无权操作', status: 403 }
}

// Same check, but reached from a paper id rather than a course id.
export async function loadPaperForTeacher(
  userId: string,
  paperId: string,
  isAdmin = false,
): Promise<{ paper?: any; course?: MockCourse; error?: string; status?: number }> {
  const { data } = await supabaseAdmin('mock_papers', {
    query: `?id=eq.${paperId}&select=id,mock_course_id,title,duration_minutes,sort_order`,
  })
  const paper = data?.[0]
  if (!paper) return { error: '试卷不存在', status: 404 }
  const res = await loadMockCourse(userId, paper.mock_course_id, isAdmin)
  if (res.error) return { error: res.error, status: res.status }
  return { paper, course: res.course }
}

export async function isAdminUser(): Promise<boolean> {
  const { createClient } = await import('./supabase/server')
  const role = (await (await createClient()).auth.getUser()).data.user?.user_metadata?.role
  return role === 'admin'
}

// ============================================================
// Exam sessions
// ============================================================

export interface SessionRow {
  id: string
  student_id: string
  paper_id: string
  status: 'in_progress' | 'submitted'
  submit_reason: 'manual' | 'timeout' | null
  duration_seconds: number
  started_at: string
  expires_at: string
  submitted_at: string | null
  total_questions: number
  total_correct: number
  total_wrong: number
  score_percentage: number | null
}

export function isPastDeadline(session: SessionRow, graceSeconds = GRACE_SECONDS): boolean {
  return Date.now() > new Date(session.expires_at).getTime() + graceSeconds * 1000
}

export async function loadSession(sessionId: string): Promise<SessionRow | null> {
  const { data } = await supabaseAdmin('mock_test_sessions', {
    query: `?id=eq.${sessionId}&select=*`,
  })
  return (data?.[0] as SessionRow) ?? null
}

// The AI prefixes its explanation with "Answer: B." — the review already shows
// which option was right, so drop that prefix and keep the reasoning.
export function stripAnswerPrefix(text: string): string {
  return String(text || '').replace(/^(正确答案：\s*[A-H][.。]?\s*|Answer:\s*[A-H][.。]?\s*)/i, '').trim()
}

async function writeWrongBook(session: SessionRow, wrongQuestionIds: string[]) {
  if (wrongQuestionIds.length === 0) return
  const { data: qs } = await supabaseAdmin('questions', {
    query: `?id=in.(${wrongQuestionIds.join(',')})&select=id,lesson_id`,
  })
  const lessonIds = [...new Set((qs || []).map((q: any) => q.lesson_id))]
  const { data: lessonRows } = lessonIds.length
    ? await supabaseAdmin('lessons', { query: `?id=in.(${lessonIds.join(',')})&select=id,chapter_id` })
    : { data: [] as any[] }
  const chapterByLesson = new Map((lessonRows || []).map((l: any) => [l.id, l.chapter_id]))

  for (const q of (qs || []) as any[]) {
    const chapterId = chapterByLesson.get(q.lesson_id)
    if (!chapterId) continue
    const { data: existing } = await supabaseAdmin('wrong_question_book', {
      query: `?student_id=eq.${session.student_id}&question_id=eq.${q.id}&select=id,wrong_count`,
    })
    if (existing?.length) {
      await supabaseAdmin('wrong_question_book', {
        method: 'PATCH',
        body: { last_wrong_at: new Date().toISOString(), wrong_count: (existing[0].wrong_count || 0) + 1, is_resolved: false },
        query: `?id=eq.${existing[0].id}`,
      })
    } else {
      await supabaseAdmin('wrong_question_book', {
        method: 'POST',
        body: {
          student_id: session.student_id, question_id: q.id, chapter_id: chapterId,
          last_wrong_at: new Date().toISOString(), wrong_count: 1, is_resolved: false,
        },
      })
    }
  }
}

/**
 * Grade a session and mark it submitted. Idempotent: an already-submitted
 * session comes back untouched, so a double submit (student clicks, then the
 * timer fires) is harmless. Unanswered questions count as wrong.
 */
export async function finaliseSession(session: SessionRow, reason: 'manual' | 'timeout'): Promise<SessionRow> {
  if (session.status === 'submitted') return session

  const { data: answers } = await supabaseAdmin('mock_test_answers', {
    query: `?session_id=eq.${session.id}&order=sort_order&select=id,question_id,selected_option_id,is_correct`,
  })
  const rows = (answers || []) as any[]
  const qIds = rows.map((r) => r.question_id)

  const { data: opts } = qIds.length
    ? await supabaseAdmin('question_options', { query: `?question_id=in.(${qIds.join(',')})&select=question_id,id,is_correct` })
    : { data: [] as any[] }
  const correctByQ = new Map<string, string>()
  for (const o of (opts || []) as any[]) if (o.is_correct) correctByQ.set(o.question_id, o.id)

  let correct = 0
  const wrongIds: string[] = []
  for (const r of rows) {
    const isCorrect = !!r.selected_option_id && r.selected_option_id === correctByQ.get(r.question_id)
    if (isCorrect) correct++
    else wrongIds.push(r.question_id)
    if (r.is_correct !== isCorrect) {
      await supabaseAdmin('mock_test_answers', { method: 'PATCH', body: { is_correct: isCorrect }, query: `?id=eq.${r.id}` })
    }
  }

  const total = rows.length
  const patch = {
    status: 'submitted',
    submit_reason: reason,
    submitted_at: new Date().toISOString(),
    total_questions: total,
    total_correct: correct,
    total_wrong: total - correct,
    score_percentage: total > 0 ? Math.round((correct / total) * 10000) / 100 : 0,
  }
  await supabaseAdmin('mock_test_sessions', { method: 'PATCH', body: patch, query: `?id=eq.${session.id}` })
  await writeWrongBook(session, wrongIds)

  return { ...session, ...patch } as SessionRow
}

/**
 * The review payload. Correct answers and explanations appear HERE only — while
 * a session is in_progress nothing that reveals an answer is ever sent.
 */
export async function buildReview(session: SessionRow) {
  const { data: paperRows } = await supabaseAdmin('mock_papers', {
    query: `?id=eq.${session.paper_id}&select=id,title,mock_course_id`,
  })
  const paper = paperRows?.[0]
  const { data: courseRows } = paper
    ? await supabaseAdmin('courses', { query: `?id=eq.${paper.mock_course_id}&select=mock_source_course_id` })
    : { data: [] as any[] }
  const outline = courseRows?.[0]?.mock_source_course_id
    ? await loadSourceOutline(courseRows[0].mock_source_course_id)
    : null
  const refByLesson = new Map((outline?.lessons || []).map((l) => [l.lessonId, l]))

  const { data: answers } = await supabaseAdmin('mock_test_answers', {
    query: `?session_id=eq.${session.id}&order=sort_order&select=question_id,sort_order,selected_option_id,is_correct`,
  })
  const rows = (answers || []) as any[]
  const qIds = rows.map((r) => r.question_id)
  const { data: qs } = qIds.length
    ? await supabaseAdmin('questions', { query: `?id=in.(${qIds.join(',')})&select=id,stem,explanation,image_url,lesson_id` })
    : { data: [] as any[] }
  const { data: opts } = qIds.length
    ? await supabaseAdmin('question_options', {
        query: `?question_id=in.(${qIds.join(',')})&order=display_order&select=id,question_id,content,is_correct`,
      })
    : { data: [] as any[] }
  const qById = new Map((qs || []).map((q: any) => [q.id, q]))

  let unanswered = 0
  const questions = rows.map((r) => {
    const q: any = qById.get(r.question_id)
    const ref = q ? refByLesson.get(q.lesson_id) : undefined
    const options = ((opts || []) as any[]).filter((o) => o.question_id === r.question_id)
    if (!r.selected_option_id) unanswered++
    return {
      questionId: r.question_id,
      sortOrder: r.sort_order,
      stem: q?.stem ?? '',
      imageUrl: q?.image_url ?? null,
      explanation: stripAnswerPrefix(q?.explanation ?? ''),
      chapterId: ref?.chapterId ?? null,
      chapterTitle: ref?.chapterTitle ?? null,
      lessonId: q?.lesson_id ?? '',
      lessonTitle: ref?.lessonTitle ?? null,
      lessonRef: ref?.ref ?? null,
      options: options.map((o) => ({ id: o.id, content: o.content })),
      selectedOptionId: r.selected_option_id,
      correctOptionId: options.find((o) => o.is_correct)?.id ?? null,
      isCorrect: !!r.is_correct,
    }
  })

  return {
    sessionId: session.id,
    paperId: session.paper_id,
    paperTitle: paper?.title ?? '',
    score: {
      total: session.total_questions,
      correct: session.total_correct,
      wrong: session.total_wrong,
      unanswered,
      percentage: Number(session.score_percentage ?? 0),
    },
    durationSeconds: session.duration_seconds,
    usedSeconds: Math.max(0, Math.round((new Date(session.submitted_at || new Date()).getTime() - new Date(session.started_at).getTime()) / 1000)),
    submittedAt: session.submitted_at,
    submitReason: session.submit_reason,
    questions,
  }
}

/**
 * The questions of an in-progress session, WITHOUT anything that reveals an
 * answer (no is_correct, no explanation).
 */
export async function buildExamPaper(session: SessionRow) {
  const { data: answers } = await supabaseAdmin('mock_test_answers', {
    query: `?session_id=eq.${session.id}&order=sort_order&select=question_id,sort_order,selected_option_id`,
  })
  const rows = (answers || []) as any[]
  const qIds = rows.map((r) => r.question_id)
  const { data: qs } = qIds.length
    ? await supabaseAdmin('questions', { query: `?id=in.(${qIds.join(',')})&select=id,stem,image_url` })
    : { data: [] as any[] }
  const { data: opts } = qIds.length
    ? await supabaseAdmin('question_options', { query: `?question_id=in.(${qIds.join(',')})&order=display_order&select=id,question_id,content` })
    : { data: [] as any[] }
  const qById = new Map((qs || []).map((q: any) => [q.id, q]))

  return rows.map((r) => {
    const q: any = qById.get(r.question_id)
    return {
      questionId: r.question_id,
      sortOrder: r.sort_order,
      stem: q?.stem ?? '',
      imageUrl: q?.image_url ?? null,
      selectedOptionId: r.selected_option_id,
      options: ((opts || []) as any[]).filter((o) => o.question_id === r.question_id).map((o) => ({ id: o.id, content: o.content })),
    }
  })
}
