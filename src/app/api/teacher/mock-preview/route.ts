import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/admin'
import { loadPaperForTeacher, loadSourceOutline, isAdminUser, stripAnswerPrefix } from '@/lib/mock-source'
import { NextResponse } from 'next/server'

// What the student will actually see, plus the answer key — so a teacher can
// check a paper without sitting it. Teacher-authorised, and it never creates a
// session, so a preview cannot pollute anyone's results.
//   GET ?paperId=
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const paperId = new URL(request.url).searchParams.get('paperId')
  if (!paperId) return NextResponse.json({ error: '缺少paperId' }, { status: 400 })

  const { paper, course, error, status } = await loadPaperForTeacher(user.id, paperId, await isAdminUser())
  if (error) return NextResponse.json({ error }, { status: status || 400 })

  const outline = course?.mock_source_course_id ? await loadSourceOutline(course.mock_source_course_id) : null
  const refByLesson = new Map((outline?.lessons || []).map((l) => [l.lessonId, l]))

  const { data: links } = await supabaseAdmin('mock_paper_questions', {
    query: `?paper_id=eq.${paperId}&order=sort_order&select=question_id,sort_order`,
  })
  const rows = (links || []) as any[]
  const qIds = rows.map((r) => r.question_id)
  const { data: qs } = qIds.length
    ? await supabaseAdmin('questions', { query: `?id=in.(${qIds.join(',')})&select=id,stem,image_url,explanation,difficulty,lesson_id,answer_type,answer_text` })
    : { data: [] as any[] }
  const { data: opts } = qIds.length
    ? await supabaseAdmin('question_options', { query: `?question_id=in.(${qIds.join(',')})&order=display_order&select=id,question_id,content,is_correct` })
    : { data: [] as any[] }
  const qById = new Map((qs || []).map((q: any) => [q.id, q]))

  const questions = rows.map((r) => {
    const q: any = qById.get(r.question_id)
    const ref = q ? refByLesson.get(q.lesson_id) : undefined
    const options = ((opts || []) as any[]).filter((o) => o.question_id === r.question_id)
    const isShort = q?.answer_type === 'short'
    return {
      questionId: r.question_id,
      sortOrder: r.sort_order,
      stem: q?.stem ?? '',
      imageUrl: q?.image_url ?? null,
      explanation: stripAnswerPrefix(q?.explanation ?? ''),
      difficulty: q?.difficulty ?? 3,
      chapterTitle: ref?.chapterTitle ?? null,
      lessonRef: ref?.ref ?? null,
      lessonTitle: ref?.lessonTitle ?? null,
      answerType: isShort ? 'short' : 'choice',
      answerText: q?.answer_text ?? '',
      options: options.map((o) => ({ id: o.id, content: o.content, isCorrect: !!o.is_correct })),
      correctOptionId: options.find((o) => o.is_correct)?.id ?? null,
      // "Something is wrong with this question's answer" — a different thing
      // depending on the kind: a missing reference answer, or not exactly one
      // correct option.
      noAnswer: isShort
        ? !String(q?.answer_text ?? '').trim()
        : (options.filter((o) => o.is_correct).length !== 1 || options.length < 2),
    }
  })

  return NextResponse.json({
    paper: { id: paper!.id, title: paper!.title, durationMinutes: paper!.duration_minutes, isPublished: !!paper!.is_published },
    courseName: course?.name ?? '',
    sourceCourseName: outline?.courseName ?? null,
    questions,
  })
}
