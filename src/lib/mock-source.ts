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
    query: `?id=eq.${paperId}&select=*`,
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

/**
 * Which classes are these students in? Used to let a teacher look at one class's
 * mock results instead of everyone who happened to sit the paper — a mock course
 * is usually published to several classes, so the raw list mixes them.
 *
 * Returns the classes the participants belong to (for the filter dropdown) plus
 * a student → classIds map.
 */
export async function classesOfStudents(studentIds: string[]) {
  if (studentIds.length === 0) return { classes: [] as { id: string; name: string }[], byStudent: new Map<string, string[]>() }

  const memberships: any[] = []
  for (let i = 0; i < studentIds.length; i += 100) {
    const { data } = await supabaseAdmin('class_members', {
      query: `?student_id=in.(${studentIds.slice(i, i + 100).join(',')})&select=student_id,class_id`,
    })
    memberships.push(...(data || []))
  }
  const classIds = [...new Set(memberships.map((m: any) => m.class_id).filter(Boolean))]
  const { data: classes } = classIds.length
    ? await supabaseAdmin('classes', { query: `?id=in.(${classIds.join(',')})&select=id,name&order=name` })
    : { data: [] as any[] }

  const byStudent = new Map<string, string[]>()
  for (const m of memberships) {
    if (!m.class_id) continue
    byStudent.set(m.student_id, [...(byStudent.get(m.student_id) || []), m.class_id])
  }
  return { classes: (classes || []) as { id: string; name: string }[], byStudent }
}

export interface SessionRow {
  id: string
  student_id: string
  paper_id: string
  status: 'in_progress' | 'submitted'
  submit_reason: 'manual' | 'timeout' | null
  mode: 'full' | 'retry'
  duration_seconds: number
  started_at: string
  expires_at: string
  submitted_at: string | null
  total_questions: number
  total_correct: number
  total_wrong: number
  score_percentage: number | null
  graded_at: string | null        // null = a short paper still being graded
}

/**
 * Which questions of a paper has this student NEVER answered correctly, across
 * every attempt so far? That is the set 错题重测 re-asks — questions they have
 * already got right are dropped, so repeated retests converge on mastery.
 */
export async function neverCorrectQuestions(studentId: string, paperId: string): Promise<string[]> {
  const { data: paperQs } = await supabaseAdmin('mock_paper_questions', {
    query: `?paper_id=eq.${paperId}&order=sort_order&select=question_id`,
  })
  const all = ((paperQs || []) as any[]).map((r) => r.question_id)
  if (all.length === 0) return []

  const { data: meta } = await supabaseAdmin('questions', {
    query: `?id=in.(${all.join(',')})&select=id,group_ref`,
  })
  const groupOf = new Map<string, string>((meta || []).map((q: any) => [q.id, String(q.group_ref ?? '').trim()]))

  const { data: sessions } = await supabaseAdmin('mock_test_sessions', {
    query: `?student_id=eq.${studentId}&paper_id=eq.${paperId}&status=eq.submitted&select=id`,
  })
  const sids = ((sessions || []) as any[]).map((s) => s.id)
  if (sids.length === 0) return all

  const everCorrect = new Set<string>()
  for (let i = 0; i < sids.length; i += 100) {
    const { data } = await supabaseAdmin('mock_test_answers', {
      query: `?session_id=in.(${sids.slice(i, i + 100).join(',')})&is_correct=eq.true&select=question_id`,
    })
    for (const a of (data || []) as any[]) everCorrect.add(a.question_id)
  }

  // A part already answered correctly still comes back when a sibling part is
  // wrong. The parts share material and feed each other — (b) routinely needs
  // (a)'s result — so retesting only the wrong part would be asking them to
  // redo a step from memory. The whole question is retested instead.
  const wrongGroups = new Set<string>()
  const wrongAlone = new Set<string>()
  for (const id of all) {
    if (everCorrect.has(id)) continue
    const g = groupOf.get(id)
    if (g) wrongGroups.add(g)
    else wrongAlone.add(id)
  }
  return all.filter((id) => {
    const g = groupOf.get(id)
    return g ? wrongGroups.has(g) : wrongAlone.has(id)
  })
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

  // A free-response answer cannot be marked locally — there is no option to
  // compare against. The AI grades it in batches after submit and only then is
  // there a score, so `graded_at` stays null and the review says "grading".
  const paperMode = await loadPaperMode(session.paper_id)
  if (paperMode === 'short') {
    const { data: rows } = await supabaseAdmin('mock_test_answers', {
      query: `?session_id=eq.${session.id}&select=id`,
    })
    const patch = {
      status: 'submitted',
      submit_reason: reason,
      submitted_at: new Date().toISOString(),
      total_questions: (rows || []).length,
      total_correct: 0,
      total_wrong: 0,
      score_percentage: 0,
    }
    await supabaseAdmin('mock_test_sessions', { method: 'PATCH', body: patch, query: `?id=eq.${session.id}` })
    return { ...session, ...patch } as SessionRow
  }

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
    graded_at: new Date().toISOString(),
  }
  await supabaseAdmin('mock_test_sessions', { method: 'PATCH', body: patch, query: `?id=eq.${session.id}` })
  await writeWrongBook(session, wrongIds)

  return { ...session, ...patch } as SessionRow
}

async function loadPaperMode(paperId: string): Promise<'choice' | 'short'> {
  const { data } = await supabaseAdmin('mock_papers', { query: `?id=eq.${paperId}&select=mode` })
  return data?.[0]?.mode === 'short' ? 'short' : 'choice'
}

/**
 * The next batch of free-response answers still waiting on a verdict, plus the
 * question text and reference answer the grader needs. Blank answers need no
 * model call — they are marked wrong here and never enter a batch.
 */
export async function pendingShortAnswers(session: SessionRow, limit: number) {
  const { data: ans } = await supabaseAdmin('mock_test_answers', {
    query: `?session_id=eq.${session.id}&order=sort_order&select=id,question_id,answer_text,feedback`,
  })
  const pending = ((ans || []) as any[]).filter((a) => a.feedback === null)

  const blank = pending.filter((a) => !String(a.answer_text ?? '').trim())
  for (const a of blank) {
    await supabaseAdmin('mock_test_answers', {
      method: 'PATCH', body: { is_correct: false, feedback: '未作答' }, query: `?id=eq.${a.id}`,
    })
  }

  const rest = pending.filter((a) => String(a.answer_text ?? '').trim())
  const batch = rest.slice(0, limit)
  if (batch.length === 0) return { batch: [], remaining: Math.max(0, rest.length) }

  const qIds = batch.map((b: any) => b.question_id)
  const { data: qs } = await supabaseAdmin('questions', {
    query: `?id=in.(${qIds.join(',')})&select=id,stem,answer_text`,
  })
  const qById = new Map<string, any>((qs || []).map((q: any) => [q.id, q]))

  return {
    batch: batch.map((b: any) => ({
      questionId: b.question_id,
      stem: qById.get(b.question_id)?.stem ?? '',
      reference: qById.get(b.question_id)?.answer_text ?? '',
      studentAnswer: b.answer_text ?? '',
    })),
    remaining: Math.max(0, rest.length - batch.length),
  }
}

/** Write verdicts back. When nothing is left pending, close out the score. */
export async function applyGrades(
  session: SessionRow,
  batch: { questionId: string; correct: boolean; feedback: string }[],
): Promise<{ remaining: number }> {
  for (const g of batch) {
    await supabaseAdmin('mock_test_answers', {
      method: 'PATCH',
      body: { is_correct: g.correct, feedback: (g.feedback || '').slice(0, 800) },
      query: `?session_id=eq.${session.id}&question_id=eq.${g.questionId}`,
    })
  }

  const { data: ans } = await supabaseAdmin('mock_test_answers', {
    query: `?session_id=eq.${session.id}&select=question_id,is_correct,feedback`,
  })
  const rows = (ans || []) as any[]
  const remaining = rows.filter((r) => r.feedback === null).length
  if (remaining > 0) return { remaining }

  const correct = rows.filter((r) => r.is_correct).length
  const total = rows.length
  const patch = {
    total_questions: total,
    total_correct: correct,
    total_wrong: total - correct,
    score_percentage: total > 0 ? Math.round((correct / total) * 10000) / 100 : 0,
    graded_at: new Date().toISOString(),
  }
  await supabaseAdmin('mock_test_sessions', { method: 'PATCH', body: patch, query: `?id=eq.${session.id}` })
  await writeWrongBook(session, rows.filter((r) => !r.is_correct).map((r) => r.question_id))
  return { remaining: 0 }
}

/**
 * The review payload. Correct answers and explanations appear HERE only — while
 * a session is in_progress nothing that reveals an answer is ever sent.
 */
/**
 * A student's whole history on one paper: every attempt in order (with a running
 * "how many of the paper's questions have I now got right at least once"), and
 * per question when it was first answered correctly.
 *
 * The running figure is the one that gets reported everywhere. A retest only
 * contains the questions that are still wrong, so a per-sitting score would go
 * DOWN when the remaining hard ones are retested — whereas mastery only ever
 * goes up, which is what "how much of this paper do I know" should mean.
 */
export async function studentPaperHistory(studentId: string, paperId: string) {
  const { data: pq } = await supabaseAdmin('mock_paper_questions', {
    query: `?paper_id=eq.${paperId}&order=sort_order&select=question_id`,
  })
  const paperQids = ((pq || []) as any[]).map((r) => r.question_id)

  const { data: sessRows } = await supabaseAdmin('mock_test_sessions', {
    query: `?student_id=eq.${studentId}&paper_id=eq.${paperId}&status=eq.submitted&order=submitted_at&select=id,mode,submitted_at,submit_reason,total_questions,total_correct`,
  })
  const sessions = (sessRows || []) as any[]

  const answersBySession = new Map<string, any[]>()
  for (let i = 0; i < sessions.length; i += 100) {
    const chunk = sessions.slice(i, i + 100).map((s) => s.id)
    const { data } = await supabaseAdmin('mock_test_answers', {
      query: `?session_id=in.(${chunk.join(',')})&order=sort_order&select=session_id,question_id,selected_option_id,answer_text,is_correct,flagged`,
    })
    for (const a of (data || []) as any[]) {
      if (!answersBySession.has(a.session_id)) answersBySession.set(a.session_id, [])
      answersBySession.get(a.session_id)!.push(a)
    }
  }

  const everCorrect = new Set<string>()
  const everAnswered = new Set<string>()
  const hist = new Map<string, { asked: number; wrong: number; firstCorrectAttempt: number | null; lastSelection: string | null; flagged: boolean }>()

  const attempts = sessions.map((s, i) => {
    const ans = answersBySession.get(s.id) || []
    let correctHere = 0
    for (const a of ans) {
      // A choice question is answered by picking an option; a short one by
      // writing something. Either counts as "attempted".
      const answered = !!a.selected_option_id || !!String(a.answer_text ?? '').trim()
      if (answered) everAnswered.add(a.question_id)
      const h = hist.get(a.question_id) || { asked: 0, wrong: 0, firstCorrectAttempt: null as number | null, lastSelection: null as string | null, flagged: false }
      h.asked++
      if (a.selected_option_id) h.lastSelection = a.selected_option_id
      if (a.flagged) h.flagged = true
      if (a.is_correct) { correctHere++; if (h.firstCorrectAttempt === null) h.firstCorrectAttempt = i + 1 }
      else h.wrong++
      hist.set(a.question_id, h)
      if (a.is_correct) everCorrect.add(a.question_id)
    }
    const total = paperQids.length || 1
    return {
      n: i + 1,
      sessionId: s.id,
      mode: s.mode || 'full',
      // what happened in this sitting
      correctInAttempt: correctHere,
      totalInAttempt: ans.length,
      ownPercentage: ans.length ? Math.round((correctHere / ans.length) * 10000) / 100 : 0,
      // the running figure that is reported everywhere
      cumulativeCorrect: everCorrect.size,
      cumulativePercentage: Math.round((everCorrect.size / total) * 10000) / 100,
      submittedAt: s.submitted_at,
      submitReason: s.submit_reason,
    }
  })

  return { paperQids, attempts, hist, answersBySession, paperTotal: paperQids.length, everCorrect, everAnswered }
}

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

  const { paperQids, attempts, hist } = await studentPaperHistory(session.student_id, session.paper_id)
  const thisSession = attempts.find((a) => a.sessionId === session.id)
  const here = new Map<string, any>()
  // The answer rows of THIS session only — used to show what was picked now.
  const { data: thisAnswers } = await supabaseAdmin('mock_test_answers', {
    query: `?session_id=eq.${session.id}&select=question_id,selected_option_id,answer_text,feedback,is_correct,flagged`,
  })
  for (const a of (thisAnswers || []) as any[]) here.set(a.question_id, a)

  const qIds = paperQids.length ? paperQids : [...here.keys()]
  const { data: qs } = qIds.length
    ? await supabaseAdmin('questions', { query: `?id=in.(${qIds.join(',')})&select=id,stem,explanation,image_url,lesson_id,answer_type,answer_text` })
    : { data: [] as any[] }
  const { data: opts } = qIds.length
    ? await supabaseAdmin('question_options', {
        query: `?question_id=in.(${qIds.join(',')})&order=display_order&select=id,question_id,content,is_correct`,
      })
    : { data: [] as any[] }
  const qById = new Map((qs || []).map((q: any) => [q.id, q]))

  // EVERY question of the paper, in paper order — a retest covers only the ones
  // still wrong, and showing just those made a 75-question paper look like a
  // 70-question one.
  const questions = qIds.map((qid, i) => {
    const q: any = qById.get(qid)
    const ref = q ? refByLesson.get(q.lesson_id) : undefined
    const options = ((opts || []) as any[]).filter((o) => o.question_id === qid)
    const mine = here.get(qid)
    const h = hist.get(qid)
    return {
      questionId: qid,
      sortOrder: i,
      stem: q?.stem ?? '',
      groupRef: q?.group_ref ?? null,
      imageUrl: q?.image_url ?? null,
      explanation: stripAnswerPrefix(q?.explanation ?? ''),
      chapterId: ref?.chapterId ?? null,
      chapterTitle: ref?.chapterTitle ?? null,
      lessonId: q?.lesson_id ?? '',
      lessonTitle: ref?.lessonTitle ?? null,
      lessonRef: ref?.ref ?? null,
      options: options.map((o) => ({ id: o.id, content: o.content })),
      // free-response answers: what they wrote, the reference, and the verdict
      answerType: q?.answer_type === 'short' ? 'short' : 'choice',
      myAnswer: mine?.answer_text ?? '',
      referenceAnswer: q?.answer_text ?? null,
      feedback: mine?.feedback ?? null,
      // this sitting's answer, else what they last picked for it
      selectedOptionId: mine ? mine.selected_option_id : (h?.lastSelection ?? null),
      correctOptionId: options.find((o) => o.is_correct)?.id ?? null,
      isCorrect: !!h?.firstCorrectAttempt,
      notInThisSession: !mine,
      flagged: !!(mine?.flagged || h?.flagged),
      askedTimes: h?.asked ?? 0,
      wrongTimes: h?.wrong ?? 0,
      firstCorrectAttempt: h?.firstCorrectAttempt ?? null,
    }
  })

  const neverAnswered = questions.filter((q) => q.firstCorrectAttempt == null).length

  return {
    sessionId: session.id,
    paperId: session.paper_id,
    paperTitle: paper?.title ?? '',
    // Cumulative mastery, not this sitting's score.
    score: {
      total: paperQids.length,
      correct: thisSession?.cumulativeCorrect ?? 0,
      wrong: paperQids.length - (thisSession?.cumulativeCorrect ?? 0),
      unanswered: neverAnswered,
      percentage: thisSession?.cumulativePercentage ?? 0,
    },
    attempts,
    sessionMode: session.mode || 'full',
    // A short paper is graded after submit, in batches. Until the last batch
    // lands there is no honest score to show, so the review says so.
    grading: !session.graded_at,
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
    query: `?session_id=eq.${session.id}&order=sort_order&select=question_id,sort_order,selected_option_id,answer_text,flagged`,
  })
  const rows = (answers || []) as any[]
  const qIds = rows.map((r) => r.question_id)
  const { data: qs } = qIds.length
    ? await supabaseAdmin('questions', { query: `?id=in.(${qIds.join(',')})&select=id,stem,image_url,answer_type,group_ref` })
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
      groupRef: q?.group_ref ?? null,
      imageUrl: q?.image_url ?? null,
      answerType: q?.answer_type === 'short' ? 'short' : 'choice',
      flagged: !!r.flagged,
      selectedOptionId: r.selected_option_id,
      // the student's own draft, so a refresh mid-exam keeps what they typed.
      // The REFERENCE answer is never sent here.
      answerText: r.answer_text ?? '',
      options: ((opts || []) as any[]).filter((o) => o.question_id === r.question_id).map((o) => ({ id: o.id, content: o.content })),
    }
  })
}
