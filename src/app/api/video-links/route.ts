import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/admin'
import { NextResponse } from 'next/server'

async function checkKpAccess(userId: string, kpId: string): Promise<boolean> {
  const { data: kp } = await supabaseAdmin('knowledge_points', { query: `?id=eq.${kpId}&select=lesson_id` })
  if (!kp || kp.length === 0) return false
  const { data: ln } = await supabaseAdmin('lessons', { query: `?id=eq.${kp[0].lesson_id}&select=chapter_id` })
  if (!ln || ln.length === 0) return false
  const { data: ch } = await supabaseAdmin('chapters', { query: `?id=eq.${ln[0].chapter_id}&select=course_id` })
  if (!ch || ch.length === 0) return false
  const courseId = ch[0].course_id
  const role = (await (await createClient()).auth.getUser()).data.user?.user_metadata?.role
  if (role === 'admin') return true
  const { data: course } = await supabaseAdmin('courses', { query: `?id=eq.${courseId}&select=owner_id` })
  if (course?.[0]?.owner_id === userId) return true
  const { data: cc } = await supabaseAdmin('course_collaborators', { query: `?course_id=eq.${courseId}&teacher_id=eq.${userId}&select=id` })
  return (cc || []).length > 0
}

async function checkVlAccess(userId: string, vlId: string): Promise<boolean> {
  const { data: vl } = await supabaseAdmin('video_links', { query: `?id=eq.${vlId}&select=knowledge_point_id` })
  if (!vl || vl.length === 0) return false
  return checkKpAccess(userId, vl[0].knowledge_point_id)
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const body = await request.json()
  if (!await checkKpAccess(user.id, body.knowledge_point_id)) {
    return NextResponse.json({ error: '无权操作' }, { status: 403 })
  }
  const { data, error } = await supabaseAdmin('video_links', {
    method: 'POST',
    body: { knowledge_point_id: body.knowledge_point_id, title: body.title, url: body.url, platform: body.platform || 'bilibili', sort_order: body.sort_order || 0 },
    query: '?select=*',
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: '缺少id' }, { status: 400 })

  if (!await checkVlAccess(user.id, id)) {
    return NextResponse.json({ error: '无权操作' }, { status: 403 })
  }
  const { error } = await supabaseAdmin('video_links', { method: 'DELETE', query: `?id=eq.${id}` })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
