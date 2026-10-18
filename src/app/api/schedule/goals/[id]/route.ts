import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/admin'
import { NextResponse } from 'next/server'
import { parseGoalInput, rowToGoal } from '@/lib/schedule'

async function loadOwnedGoal(teacherId: string, id: string) {
  const { data } = await supabaseAdmin('schedule_goals', {
    query: `?id=eq.${id}&teacher_id=eq.${teacherId}&select=*`,
  })
  return data?.[0] ?? null
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const existing = await loadOwnedGoal(user.id, id)
  if (!existing) return NextResponse.json({ error: '目标不存在' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const { input, error: parseError } = parseGoalInput({
    title: existing.title,
    note: existing.note,
    horizon: existing.horizon,
    dueDate: existing.due_date,
    ...body,
  })
  if (!input) return NextResponse.json({ error: parseError }, { status: 400 })

  const status = body?.status === 'done' ? 'done' : body?.status === 'open' ? 'open' : existing.status

  const { data, error } = await supabaseAdmin('schedule_goals', {
    method: 'PATCH',
    body: {
      title: input.title,
      note: input.note,
      horizon: input.horizon,
      due_date: input.dueDate,
      status,
      updated_at: new Date().toISOString(),
    },
    query: `?id=eq.${id}&teacher_id=eq.${user.id}&select=*`,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ goal: rowToGoal(Array.isArray(data) ? data[0] : data) })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const existing = await loadOwnedGoal(user.id, id)
  if (!existing) return NextResponse.json({ error: '目标不存在' }, { status: 404 })

  // Steps stay on the calendar (goal_id becomes NULL) — deleting the plan
  // should not silently erase work the teacher already scheduled.
  const { error } = await supabaseAdmin('schedule_goals', {
    method: 'DELETE',
    query: `?id=eq.${id}&teacher_id=eq.${user.id}`,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
