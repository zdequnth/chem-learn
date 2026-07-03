import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/admin'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const { data: favs } = await supabaseAdmin('student_favorites', {
    query: `?student_id=eq.${user.id}&select=course_id`,
  })
  return NextResponse.json({ favorites: (favs || []).map((f: any) => f.course_id) })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const { courseId } = await request.json()
  if (!courseId) return NextResponse.json({ error: '缺少courseId' }, { status: 400 })

  const { error } = await supabaseAdmin('student_favorites', {
    method: 'POST',
    body: { student_id: user.id, course_id: courseId },
  })
  if (error && !error.message?.includes('duplicate')) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}

export async function DELETE(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const courseId = searchParams.get('courseId')
  if (!courseId) return NextResponse.json({ error: '缺少courseId' }, { status: 400 })

  await supabaseAdmin('student_favorites', {
    method: 'DELETE',
    query: `?student_id=eq.${user.id}&course_id=eq.${courseId}`,
  })
  return NextResponse.json({ success: true })
}
