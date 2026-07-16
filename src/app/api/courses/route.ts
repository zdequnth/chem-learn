import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/admin'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

    const body = await request.json()

    const { data, error } = await supabaseAdmin('courses', {
      method: 'POST',
      body: {
        name: body.name,
        description: body.description || null,
        grade_level: body.grade_level || null,
        icon: body.icon || '🧪',
        owner_id: user.id,
        is_published: false,
        sort_order: body.sort_order || 0,
      },
      query: '?select=*',
    })

    if (error) return NextResponse.json({ error: error.message || '数据库错误' }, { status: 500 })
    return NextResponse.json({ course: data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: '缺少id' }, { status: 400 })

    const { error } = await supabaseAdmin('courses', { method: 'DELETE', query: `?id=eq.${id}` })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

    // Owned courses
    const { data: owned } = await supabaseAdmin('courses', {
      query: `?owner_id=eq.${user.id}&order=sort_order`,
    })

    // Collaborated courses
    const { data: cc } = await supabaseAdmin('course_collaborators', {
      query: `?teacher_id=eq.${user.id}&select=course_id`,
    })
    const collabIds = (cc || []).map((c: any) => c.course_id)
    let collabCourses: any[] = []
    if (collabIds.length > 0) {
      const { data: collab } = await supabaseAdmin('courses', {
        query: `?id=in.(${collabIds.join(',')})&order=sort_order`,
      })
      collabCourses = collab || []
    }

    const all = [...(owned || []), ...collabCourses]
    return NextResponse.json({ courses: all })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
