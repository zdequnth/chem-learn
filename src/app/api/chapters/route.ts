import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/admin'
import { NextResponse } from 'next/server'

async function checkCourseAccess(userId: string, courseId: string): Promise<boolean> {
  const role = (await (await createClient()).auth.getUser()).data.user?.user_metadata?.role
  if (role === 'admin') return true
  const { data: course } = await supabaseAdmin('courses', { query: `?id=eq.${courseId}&select=owner_id` })
  if (course?.[0]?.owner_id === userId) return true
  const { data: cc } = await supabaseAdmin('course_collaborators', { query: `?course_id=eq.${courseId}&teacher_id=eq.${userId}&select=id` })
  return (cc || []).length > 0
}

async function checkChapterAccess(userId: string, chapterId: string): Promise<boolean> {
  const { data: ch } = await supabaseAdmin('chapters', { query: `?id=eq.${chapterId}&select=course_id` })
  if (!ch || ch.length === 0) return false
  return checkCourseAccess(userId, ch[0].course_id)
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const body = await request.json()
  if (!await checkCourseAccess(user.id, body.course_id)) {
    return NextResponse.json({ error: '无权操作' }, { status: 403 })
  }
  const { data, error } = await supabaseAdmin('chapters', {
    method: 'POST', body, query: '?select=*',
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const body = await request.json()
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: '缺少id' }, { status: 400 })

  if (!await checkChapterAccess(user.id, id)) {
    return NextResponse.json({ error: '无权操作' }, { status: 403 })
  }
  const { error } = await supabaseAdmin('chapters', {
    method: 'PATCH', body, query: `?id=eq.${id}`,
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
  if (!id) return NextResponse.json({ error: '缺少id' }, { status: 400 })

  if (!await checkChapterAccess(user.id, id)) {
    return NextResponse.json({ error: '无权操作' }, { status: 403 })
  }
  const { error } = await supabaseAdmin('chapters', {
    method: 'DELETE', query: `?id=eq.${id}`,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
