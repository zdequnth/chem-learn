import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/admin'
import { NextResponse } from 'next/server'
import { parseItemInput, rowToItem } from '@/lib/schedule'

const ITEM_FIELDS = 'id,title,kind,class_id,color,repeat,weekday,event_date,start_period,end_period,note'

async function loadOwnedItem(teacherId: string, id: string) {
  const { data } = await supabaseAdmin('schedule_items', {
    query: `?id=eq.${id}&teacher_id=eq.${teacherId}&select=${ITEM_FIELDS}`,
  })
  return data?.[0] ?? null
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const existing = await loadOwnedItem(user.id, id)
  if (!existing) return NextResponse.json({ error: '安排不存在' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const { input, error: parseError } = parseItemInput({ ...rowToItem(existing), ...body })
  if (!input) return NextResponse.json({ error: parseError }, { status: 400 })

  if (input.classId) {
    const { data: owned } = await supabaseAdmin('classes', {
      query: `?id=eq.${input.classId}&teacher_id=eq.${user.id}&select=id`,
    })
    if (!owned?.length) return NextResponse.json({ error: '班级不存在' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin('schedule_items', {
    method: 'PATCH',
    body: {
      title: input.title,
      kind: input.kind,
      class_id: input.classId,
      color: input.color,
      repeat: input.repeat,
      weekday: input.weekday,
      event_date: input.eventDate,
      start_period: input.startPeriod,
      end_period: input.endPeriod,
      note: input.note,
      updated_at: new Date().toISOString(),
    },
    query: `?id=eq.${id}&teacher_id=eq.${user.id}&select=${ITEM_FIELDS}`,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ item: rowToItem(Array.isArray(data) ? data[0] : data) })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const existing = await loadOwnedItem(user.id, id)
  if (!existing) return NextResponse.json({ error: '安排不存在' }, { status: 404 })

  const { error } = await supabaseAdmin('schedule_items', {
    method: 'DELETE',
    query: `?id=eq.${id}&teacher_id=eq.${user.id}`,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
