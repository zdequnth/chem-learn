import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/admin'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const lessonId = searchParams.get('lessonId')
  if (!lessonId) return NextResponse.json({ error: '缺少lessonId' }, { status: 400 })

  const { data: kps } = await supabaseAdmin('knowledge_points', {
    query: `?lesson_id=eq.${lessonId}&order=sort_order&select=*`,
  })

  // Get video links for all KPs
  const kpIds = (kps || []).map((kp: any) => kp.id)
  let videoLinks: any[] = []
  if (kpIds.length > 0) {
    const { data: vl } = await supabaseAdmin('video_links', {
      query: `?knowledge_point_id=in.(${kpIds.join(',')})&order=sort_order&select=*`,
    })
    videoLinks = vl || []
  }

  return NextResponse.json({ kps: kps || [], videoLinks })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const body = await request.json()
  const { data, error } = await supabaseAdmin('knowledge_points', {
    method: 'POST',
    body: { lesson_id: body.lesson_id, title: body.title, description: body.description || null, sort_order: body.sort_order || 0 },
    query: '?select=*',
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const body = await request.json()
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: '缺少id' }, { status: 400 })

  const { error } = await supabaseAdmin('knowledge_points', {
    method: 'PATCH',
    body,
    query: `?id=eq.${id}`,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: '缺少id' }, { status: 400 })

  const { error } = await supabaseAdmin('knowledge_points', { method: 'DELETE', query: `?id=eq.${id}` })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
