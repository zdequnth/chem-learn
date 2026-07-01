import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/admin'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const body = await request.json()
  const { data, error } = await supabaseAdmin('video_links', {
    method: 'POST',
    body: { knowledge_point_id: body.knowledge_point_id, title: body.title, url: body.url, platform: body.platform || 'bilibili', sort_order: body.sort_order || 0 },
    query: '?select=*',
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: '缺少id' }, { status: 400 })

  const { error } = await supabaseAdmin('video_links', { method: 'DELETE', query: `?id=eq.${id}` })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
