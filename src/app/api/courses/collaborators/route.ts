import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/admin'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const courseId = searchParams.get('courseId')
  if (!courseId) return NextResponse.json({ error: '缺少courseId' }, { status: 400 })

  const { data: collaborators } = await supabaseAdmin('course_collaborators', {
    query: `?course_id=eq.${courseId}&select=id,teacher_id`,
  })

  const teacherIds = (collaborators || []).map((c: any) => c.teacher_id)
  let profiles: any[] = []
  if (teacherIds.length > 0) {
    const { data: p } = await supabaseAdmin('profiles', {
      query: `?id=in.(${teacherIds.join(',')})&select=id,display_name`,
    })
    profiles = p || []
  }

  return NextResponse.json({ collaborators: profiles })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const { courseId, teacherEmail } = await request.json()
  if (!courseId || !teacherEmail) return NextResponse.json({ error: '缺少参数' }, { status: 400 })

  // Check ownership
  const role = (user.user_metadata as any)?.role
  const { data: course } = await supabaseAdmin('courses', { query: `?id=eq.${courseId}&select=owner_id` })
  if (course?.[0]?.owner_id !== user.id && role !== 'admin') {
    return NextResponse.json({ error: '仅课程创建者可管理协作者' }, { status: 403 })
  }

  // Find teacher by email
  const { data: profiles } = await supabaseAdmin('profiles', {
    query: `?display_name=ilike.${teacherEmail}&role=in.(teacher,admin)&select=id,display_name`,
  })
  // Also try by email match (display_name might store email)
  let teacher = profiles?.[0]
  if (!teacher) {
    // Try finding by Supabase auth email
    const { data: allTeachers } = await supabaseAdmin('profiles', {
      query: `?role=in.(teacher,admin)&select=id,display_name`,
    })
    teacher = (allTeachers || []).find((p: any) =>
      p.display_name?.toLowerCase().includes(teacherEmail.toLowerCase()) ||
      p.id === teacherEmail // allow pasting UUID directly
    )
  }

  if (!teacher) return NextResponse.json({ error: '未找到该教师，请确认邮箱或姓名' }, { status: 404 })

  const { error } = await supabaseAdmin('course_collaborators', {
    method: 'POST',
    body: { course_id: courseId, teacher_id: teacher.id },
  })
  if (error) {
    if (error.message?.includes('duplicate') || error.message?.includes('unique')) {
      return NextResponse.json({ error: '该教师已是协作者' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, teacher })
}

export async function DELETE(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const courseId = searchParams.get('courseId')
  const teacherId = searchParams.get('teacherId')
  if (!courseId || !teacherId) return NextResponse.json({ error: '缺少参数' }, { status: 400 })

  const { error } = await supabaseAdmin('course_collaborators', {
    method: 'DELETE',
    query: `?course_id=eq.${courseId}&teacher_id=eq.${teacherId}`,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
