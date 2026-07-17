import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/admin'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })
  const role = (user.user_metadata as any)?.role
  if (role !== 'admin') return NextResponse.json({ error: '无权访问' }, { status: 403 })

  const { data: profiles } = await supabaseAdmin('profiles', {
    query: '?select=id,role,display_name,created_at&order=created_at.desc&limit=100',
  })
  return NextResponse.json({ users: profiles || [] })
}

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })
  const role = (user.user_metadata as any)?.role
  if (role !== 'admin') return NextResponse.json({ error: '无权访问' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const userId = searchParams.get('id')
  if (!userId) return NextResponse.json({ error: '缺少id' }, { status: 400 })

  const body = await request.json()
  await supabaseAdmin('profiles', {
    method: 'PATCH',
    body: { role: body.role },
    query: `?id=eq.${userId}`,
  })
  return NextResponse.json({ success: true })
}
