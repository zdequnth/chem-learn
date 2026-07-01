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

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: '缺少id' }, { status: 400 })

  const { error } = await supabaseAdmin('classes', { method: 'DELETE', query: `?id=eq.${id}` })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
