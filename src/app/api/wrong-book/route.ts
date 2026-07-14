import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/admin'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const courseId = searchParams.get('courseId')
  const chapterId = searchParams.get('chapterId')
  const unresolvedOnly = searchParams.get('unresolvedOnly')

  // Get wrong records
  let queryStr = `?student_id=eq.${user.id}&order=last_wrong_at.desc&limit=200&select=*`
  if (chapterId) queryStr += `&chapter_id=eq.${chapterId}`
  if (unresolvedOnly === '1') queryStr += `&is_resolved=eq.false`
  const { data: records } = await supabaseAdmin('wrong_question_book', { query: queryStr })

  if (!records || records.length === 0) {
    return NextResponse.json({ records: [] })
  }

  // Fetch questions
  const qIds = [...new Set((records || []).map((r: any) => r.question_id))]
  const { data: questions } = await supabaseAdmin('questions', {
    query: `?id=in.(${qIds.join(',')})&select=id,stem,explanation,lesson_id`,
  })
  const qMap = new Map((questions || []).map((q: any) => [q.id, q] as const))

  // Fetch options for these questions
  const { data: allOpts } = await supabaseAdmin('question_options', {
    query: `?question_id=in.(${qIds.join(',')})&select=id,question_id,content,is_correct`,
  })

  // Fetch lessons
  const lessonIds = [...new Set((questions || []).map((q: any) => q.lesson_id))]
  const { data: lessons } = await supabaseAdmin('lessons', {
    query: `?id=in.(${lessonIds.join(',')})&select=id,title,chapter_id`,
  })
  const lessonMap = new Map((lessons || []).map((l: any) => [l.id, l] as const))

  // Fetch chapters
  const chapterIds = [...new Set((lessons || []).map((l: any) => l.chapter_id))]
  const { data: chapters } = await supabaseAdmin('chapters', {
    query: `?id=in.(${chapterIds.join(',')})&select=id,title,course_id`,
  })
  const chapterMap = new Map((chapters || []).map((c: any) => [c.id, c] as const))

  // Fetch courses
  const courseIds = [...new Set((chapters || []).map((c: any) => c.course_id))]
  const { data: courses } = await supabaseAdmin('courses', {
    query: `?id=in.(${courseIds.join(',')})&select=id,name`,
  })
  const courseMap = new Map((courses || []).map((c: any) => [c.id, c] as const))

  // Build result
  const result = (records || []).map((r: any) => {
    const q: any = qMap.get(r.question_id)
    const lesson: any = lessonMap.get(q?.lesson_id)
    const chapter: any = chapterMap.get(lesson?.chapter_id)
    const course: any = courseMap.get(chapter?.course_id)
    const opts = (allOpts || []).filter((o: any) => o.question_id === r.question_id)
    const correctOpt = opts.find((o: any) => o.is_correct)

    return {
      id: r.id,
      question_id: r.question_id,
      chapter_id: r.chapter_id,
      course_id: chapter?.course_id || '',
      wrong_count: r.wrong_count,
      last_wrong_at: r.last_wrong_at,
      is_resolved: r.is_resolved,
      is_repeated_wrong: r.is_repeated_wrong || false,
      question_stem: q?.stem || '',
      question_explanation: q?.explanation || '',
      correct_answer: correctOpt?.content || '',
      all_options: opts.map((o: any) => ({ id: o.id, content: o.content, isCorrect: o.is_correct })),
      lesson_title: lesson?.title || '',
      chapter_title: chapter?.title || '',
      course_name: course?.name || '',
    }
  })

  return NextResponse.json({ records: result })
}

export async function PUT(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const body = await request.json()
  const { id, is_resolved, is_repeated_wrong } = body
  const update: any = {}
  if (is_resolved !== undefined) update.is_resolved = is_resolved
  if (is_repeated_wrong !== undefined) update.is_repeated_wrong = is_repeated_wrong

  await supabaseAdmin('wrong_question_book', {
    method: 'PATCH',
    body: update,
    query: `?id=eq.${id}`,
  })
  return NextResponse.json({ success: true })
}
