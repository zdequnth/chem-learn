import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/admin'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const { data: classes } = await supabaseAdmin('classes', {
    query: `?teacher_id=eq.${user.id}&select=*`,
  })

  // Get member count for each class
  const result = []
  for (const cls of (classes || [])) {
    const { data: members } = await supabaseAdmin('class_members', {
      query: `?class_id=eq.${cls.id}&select=id`,
    })
    result.push({ ...cls, student_count: (members || []).length })
  }

  return NextResponse.json({ classes: result })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const body = await request.json()
  const { data, error } = await supabaseAdmin('classes', {
    method: 'POST',
    body: { name: body.name, teacher_id: user.id, course_id: body.course_id || null },
    query: '?select=*',
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PUT(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const body = await request.json()
  const { invite_code } = body
  if (!invite_code) return NextResponse.json({ error: '缺少邀请码' }, { status: 400 })

  // Ensure profile exists (may have been deleted by DB reset)
  await supabaseAdmin('profiles', {
    method: 'POST',
    body: { id: user.id, role: (user.user_metadata as any)?.role || 'student', display_name: (user.user_metadata as any)?.display_name || user.email || '用户' },
  }).catch(() => {})

  // Find class by invite code
  const { data: classes } = await supabaseAdmin('classes', {
    query: `?invite_code=eq.${invite_code}&select=id`,
  })
  if (!classes || classes.length === 0) {
    return NextResponse.json({ error: '邀请码无效' }, { status: 404 })
  }

  // Join class
  const classId = classes[0].id
  const { error } = await supabaseAdmin('class_members', {
    method: 'POST',
    body: { class_id: classId, student_id: user.id },
  })
  if (error) {
    if (error.message?.includes('duplicate') || error.message?.includes('unique')) {
      return NextResponse.json({ error: '你已经在这个班级里了' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, class_id: classId })
}

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const body = await request.json()
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: '缺少id' }, { status: 400 })

  const update: any = {}
  if (body.name !== undefined) update.name = body.name
  if (body.message !== undefined) update.message = body.message

  const { error } = await supabaseAdmin('classes', {
    method: 'PATCH',
    body: update,
    query: `?id=eq.${id}`,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: '缺少id' }, { status: 400 })

  const { error } = await supabaseAdmin('classes', { method: 'DELETE', query: `?id=eq.${id}` })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
