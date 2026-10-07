import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/admin'
import { COURSE_KINDS, type CourseKind } from '@/lib/types'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

    const body = await request.json()

    // The kind is decided once, here, and cannot be changed later.
    const kind: CourseKind = COURSE_KINDS.includes(body?.kind) ? body.kind : 'gate'

    // A mock course must name the gate course its papers are built from, and
    // that course has to be one this teacher can actually see.
    let sourceCourseId: string | null = null
    if (kind === 'mock') {
      sourceCourseId = typeof body?.mock_source_course_id === 'string' ? body.mock_source_course_id : null
      if (!sourceCourseId) return NextResponse.json({ error: '模拟考课程必须选择绑定的通关课程' }, { status: 400 })

      const { data: src } = await supabaseAdmin('courses', {
        query: `?id=eq.${sourceCourseId}&select=id,kind,owner_id`,
      })
      const source = src?.[0]
      if (!source) return NextResponse.json({ error: '绑定的课程不存在' }, { status: 400 })
      if (source.kind !== 'gate') return NextResponse.json({ error: '只能绑定过关课程' }, { status: 400 })
      if (source.owner_id !== user.id) {
        const { data: cc } = await supabaseAdmin('course_collaborators', {
          query: `?course_id=eq.${sourceCourseId}&teacher_id=eq.${user.id}&select=id`,
        })
        if (!(cc || []).length) return NextResponse.json({ error: '无权绑定这门课程' }, { status: 403 })
      }
    }

    const { data, error } = await supabaseAdmin('courses', {
      method: 'POST',
      body: {
        name: body.name,
        description: body.description || null,
        grade_level: body.grade_level || null,
        icon: body.icon || (kind === 'mock' ? '📝' : kind === 'vocab' ? '📖' : '🧪'),
        owner_id: user.id,
        is_published: false,
        kind,
        // Only sent for a mock course — the column comes from migration 016, and
        // gate/vocab creation must keep working even if it has not been applied.
        ...(kind === 'mock' ? { mock_source_course_id: sourceCourseId } : {}),
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
