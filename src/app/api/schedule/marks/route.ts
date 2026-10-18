import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/admin'
import { NextResponse } from 'next/server'
import { isDateString } from '@/lib/schedule'

// A mark belongs to ONE occurrence — "done" on Monday must not tick off next Monday.
// Clearing is a delete; setting replaces whatever was there, so the client can
// switch done ↔ skipped without knowing the current state.
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const itemId = typeof body?.itemId === 'string' ? body.itemId : ''
  const date = body?.date
  const status = body?.status
  if (!itemId || !isDateString(date)) {
    return NextResponse.json({ error: '缺少安排或日期' }, { status: 400 })
  }
  if (status !== 'done' && status !== 'skipped' && status !== 'none') {
    return NextResponse.json({ error: '状态不正确' }, { status: 400 })
  }

  const { data: owned } = await supabaseAdmin('schedule_items', {
    query: `?id=eq.${itemId}&teacher_id=eq.${user.id}&select=id`,
  })
  if (!owned?.length) return NextResponse.json({ error: '安排不存在' }, { status: 404 })

  await supabaseAdmin('schedule_marks', {
    method: 'DELETE',
    query: `?item_id=eq.${itemId}&occurrence_date=eq.${date}&teacher_id=eq.${user.id}`,
  })

  if (status === 'none') return NextResponse.json({ ok: true })

  const { error } = await supabaseAdmin('schedule_marks', {
    method: 'POST',
    body: {
      teacher_id: user.id,
      item_id: itemId,
      occurrence_date: date,
      status,
    },
    query: '?select=item_id',
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
