import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/admin'
import { NextResponse } from 'next/server'

async function checkLessonAccess(userId: string, lessonId: string): Promise<boolean> {
  const role = (await (await createClient()).auth.getUser()).data.user?.user_metadata?.role
  if (role === 'admin') return true
  const { data: ln } = await supabaseAdmin('lessons', { query: `?id=eq.${lessonId}&select=chapter_id` })
  if (!ln || ln.length === 0) return false
  const { data: ch } = await supabaseAdmin('chapters', { query: `?id=eq.${ln[0].chapter_id}&select=course_id` })
  if (!ch || ch.length === 0) return false
  const courseId = ch[0].course_id
  const { data: course } = await supabaseAdmin('courses', { query: `?id=eq.${courseId}&select=owner_id` })
  if (course?.[0]?.owner_id === userId) return true
  const { data: cc } = await supabaseAdmin('course_collaborators', { query: `?course_id=eq.${courseId}&teacher_id=eq.${userId}&select=id` })
  return (cc || []).length > 0
}

// The answer tables reference questions WITHOUT ON DELETE CASCADE, so rows must
// be removed first or the question delete fails with a foreign-key violation
// (which only happens once students have answered the question).
async function deleteQuestionDependents(questionIds: string[]) {
  if (questionIds.length === 0) return
  for (let i = 0; i < questionIds.length; i += 150) {
    const list = questionIds.slice(i, i + 150).join(',')
    await supabaseAdmin('gate_test_answers', { method: 'DELETE', query: `?question_id=in.(${list})` })
    await supabaseAdmin('boss_test_answers', { method: 'DELETE', query: `?question_id=in.(${list})` })
  }
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const lessonId = searchParams.get('lessonId')
  if (!lessonId) return NextResponse.json({ error: '缺少lessonId' }, { status: 400 })

  // Get questions with options via join
  const { data: questions } = await supabaseAdmin('questions', {
    query: `?lesson_id=eq.${lessonId}&order=created_at.desc&select=*`,
  })

  // Get options for all questions
  let allOptions: any[] = []
  const qIds = (questions || []).map((q: any) => q.id)
  if (qIds.length > 0) {
    const { data: opts } = await supabaseAdmin('question_options', {
      query: `?question_id=in.(${qIds.join(',')})&order=display_order&select=*`,
    })
    allOptions = opts || []
  }

  const result = (questions || []).map((q: any) => ({
    ...q,
    options: allOptions.filter((o: any) => o.question_id === q.id),
  }))

  return NextResponse.json({ questions: result })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const body = await request.json()
  const { id, is_approved, lesson_id } = body

  // New question creation
  if (lesson_id) {
    if (!await checkLessonAccess(user.id, lesson_id)) {
      return NextResponse.json({ error: '无权操作' }, { status: 403 })
    }
    const { data, error } = await supabaseAdmin('questions', {
      method: 'POST', body, query: '?select=id',
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  // Approval toggle — find lesson via question
  if (!id) return NextResponse.json({ error: '缺少id' }, { status: 400 })
  const { data: q } = await supabaseAdmin('questions', { query: `?id=eq.${id}&select=lesson_id` })
  if (q?.[0]) {
    if (!await checkLessonAccess(user.id, q[0].lesson_id)) {
      return NextResponse.json({ error: '无权操作' }, { status: 403 })
    }
  }

  const { error } = await supabaseAdmin('questions', {
    method: 'PATCH',
    body: { is_approved: is_approved },
    query: `?id=eq.${id}`,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// Update an existing question (stem/options/answer/explanation/difficulty/image)
export async function PUT(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const body = await request.json()
  const { id, stem, explanation, difficulty, image_url, options } = body
  if (!id) return NextResponse.json({ error: '缺少id' }, { status: 400 })

  const { data: q } = await supabaseAdmin('questions', { query: `?id=eq.${id}&select=lesson_id` })
  if (!q?.[0]) return NextResponse.json({ error: '题目不存在' }, { status: 404 })
  if (!await checkLessonAccess(user.id, q[0].lesson_id)) {
    return NextResponse.json({ error: '无权操作' }, { status: 403 })
  }

  const { error } = await supabaseAdmin('questions', {
    method: 'PATCH',
    body: { stem, explanation, difficulty, image_url: image_url || null },
    query: `?id=eq.${id}`,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Update options in place where possible (never delete-all-then-insert-all,
  // which left the question with zero options if a request was interrupted).
  // Answers reference options via selected_option_id (FK, no cascade), so their
  // references are released only for options that are actually removed.
  if (Array.isArray(options)) {
    const { data: existing } = await supabaseAdmin('question_options', { query: `?question_id=eq.${id}&order=display_order&select=id` })
    const ex = existing || []

    if (ex.length > options.length) {
      await supabaseAdmin('gate_test_answers', { method: 'PATCH', body: { selected_option_id: null }, query: `?question_id=eq.${id}` })
      await supabaseAdmin('boss_test_answers', { method: 'PATCH', body: { selected_option_id: null }, query: `?question_id=eq.${id}` })
      const extra = ex.slice(options.length).map((o: any) => o.id)
      if (extra.length > 0) {
        await supabaseAdmin('question_options', { method: 'DELETE', query: `?id=in.(${extra.join(',')})` })
      }
    }

    for (let i = 0; i < options.length; i++) {
      const payload = { content: options[i].content, is_correct: options[i].isCorrect === true, display_order: i }
      if (ex[i]) {
        await supabaseAdmin('question_options', { method: 'PATCH', body: payload, query: `?id=eq.${ex[i].id}` })
      } else {
        await supabaseAdmin('question_options', { method: 'POST', body: { question_id: id, ...payload } })
      }
    }
  }
  return NextResponse.json({ success: true })
}

export async function DELETE(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  const lessonId = searchParams.get('lessonId')

  if (lessonId) {
    if (!await checkLessonAccess(user.id, lessonId)) {
      return NextResponse.json({ error: '无权操作' }, { status: 403 })
    }
    const { data: qs } = await supabaseAdmin('questions', { query: `?lesson_id=eq.${lessonId}&select=id` })
    await deleteQuestionDependents((qs || []).map((q: any) => q.id))
    const { error } = await supabaseAdmin('questions', {
      method: 'DELETE',
      query: `?lesson_id=eq.${lessonId}`,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, deletedAll: true })
  }

  if (id) {
    const { data: q } = await supabaseAdmin('questions', { query: `?id=eq.${id}&select=lesson_id` })
    if (q?.[0]) {
      if (!await checkLessonAccess(user.id, q[0].lesson_id)) {
        return NextResponse.json({ error: '无权操作' }, { status: 403 })
      }
    }
    await deleteQuestionDependents([id])
    const { error } = await supabaseAdmin('questions', {
      method: 'DELETE',
      query: `?id=eq.${id}`,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: '缺少id或lessonId' }, { status: 400 })
}
