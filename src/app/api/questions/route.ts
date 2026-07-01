import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/admin'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const lessonId = searchParams.get('lessonId')
  if (!lessonId) return NextResponse.json({ error: '缺少lessonId' }, { status: 400 })

  // Get questions with options via join
  const { data: questions } = await supabaseAdmin('questions', {
    query: `?lesson_id=eq.${lessonId}&order=created_at.desc&select=*`,
  })

  // Get options for all questions
  let allOptions: any[] = []
  const qIds = (questions || []).map((q: any) => q.id)
  if (qIds.length > 0) {
    const { data: opts } = await supabaseAdmin('question_options', {
      query: `?question_id=in.(${qIds.join(',')})&order=display_order&select=*`,
    })
    allOptions = opts || []
  }

  const result = (questions || []).map((q: any) => ({
    ...q,
    options: allOptions.filter((o: any) => o.question_id === q.id),
  }))

  return NextResponse.json({ questions: result })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const body = await request.json()
  const { id, is_approved } = body
  if (!id) return NextResponse.json({ error: '缺少id' }, { status: 400 })

  const { error } = await supabaseAdmin('questions', {
    method: 'PATCH',
    body: { is_approved: is_approved },
    query: `?id=eq.${id}`,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  const lessonId = searchParams.get('lessonId')

  if (lessonId) {
    // Batch delete: all questions in a lesson
    const { error } = await supabaseAdmin('questions', {
      method: 'DELETE',
      query: `?lesson_id=eq.${lessonId}`,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, deletedAll: true })
  }

  if (id) {
    const { error } = await supabaseAdmin('questions', {
      method: 'DELETE',
      query: `?id=eq.${id}`,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: '缺少id或lessonId' }, { status: 400 })
}
