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
    const { error } = await supabaseAdmin('questions', {
      method: 'DELETE',
      query: `?id=eq.${id}`,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: '缺少id或lessonId' }, { status: 400 })
}
