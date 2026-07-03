import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/admin'
import { NextResponse } from 'next/server'

export async function GET(request: Request, { params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const role = (user.user_metadata as any)?.role

  // Fetch course
  const { data: course, error: courseErr } = await supabaseAdmin('courses', {
    query: `?id=eq.${courseId}&select=*`,
  })

  // Check if collaborator
  let isCollaborator = false
  if (role === 'teacher' || role === 'admin') {
    const { data: cc } = await supabaseAdmin('course_collaborators', {
      query: `?course_id=eq.${courseId}&teacher_id=eq.${user.id}&select=id`,
    })
    isCollaborator = (cc || []).length > 0
  }

  // Fetch chapters
  const { data: chapters } = await supabaseAdmin('chapters', {
    query: `?course_id=eq.${courseId}&order=sort_order&select=*`,
  })

  // Fetch lessons for all chapters
  const chapterIds = (chapters || []).map((c: any) => c.id)
  let lessons: any[] = []
  if (chapterIds.length > 0) {
    const { data: l } = await supabaseAdmin('lessons', {
      query: `?chapter_id=in.(${chapterIds.join(',')})&order=sort_order&select=*`,
    })
    lessons = l || []
  }

  return NextResponse.json({
    course: course?.[0] || null,
    chapters: chapters || [],
    lessons,
    isOwner: course?.[0]?.owner_id === user.id || role === 'admin',
    isCollaborator,
  })
}

export async function PUT(request: Request, { params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const role = (user.user_metadata as any)?.role
  const { data: course } = await supabaseAdmin('courses', { query: `?id=eq.${courseId}&select=owner_id` })
  const isOwner = course?.[0]?.owner_id === user.id || role === 'admin'
  if (!isOwner) {
    const { data: cc } = await supabaseAdmin('course_collaborators', {
      query: `?course_id=eq.${courseId}&teacher_id=eq.${user.id}&select=id`,
    })
    if (!cc || cc.length === 0) {
      return NextResponse.json({ error: '无权编辑' }, { status: 403 })
    }
  }

  const body = await request.json()
  const { data, error } = await supabaseAdmin('courses', {
    method: 'PATCH',
    body: body,
    query: `?id=eq.${courseId}`,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
