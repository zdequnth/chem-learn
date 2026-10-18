import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/admin'
import { NextResponse } from 'next/server'
import { parseGoalInput, rowToGoal, type ScheduleGoal } from '@/lib/schedule'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const { data: goalRows, error } = await supabaseAdmin('schedule_goals', {
    query: `?teacher_id=eq.${user.id}&order=created_at.desc&select=*`,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const goals: ScheduleGoal[] = (goalRows || []).map((r: any) => rowToGoal(r))

  // Progress is per step: a goal's steps are one-off items, so "done" means the
  // teacher ticked that occurrence.
  const { data: itemRows } = await supabaseAdmin('schedule_items', {
    query: `?teacher_id=eq.${user.id}&goal_id=not.is.null&select=id,goal_id`,
  })
  const { data: doneRows } = await supabaseAdmin('schedule_marks', {
    query: `?teacher_id=eq.${user.id}&status=eq.done&select=item_id`,
  })
  const done = new Set((doneRows || []).map((m: any) => m.item_id))

  const byGoal = new Map<string, { total: number; done: number }>()
  for (const row of itemRows || []) {
    const cur = byGoal.get(row.goal_id) || { total: 0, done: 0 }
    cur.total++
    if (done.has(row.id)) cur.done++
    byGoal.set(row.goal_id, cur)
  }

  return NextResponse.json({
    goals: goals.map(g => ({
      ...g,
      itemCount: byGoal.get(g.id)?.total ?? 0,
      doneCount: byGoal.get(g.id)?.done ?? 0,
    })),
  })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const { input, error: parseError } = parseGoalInput(await request.json().catch(() => null))
  if (!input) return NextResponse.json({ error: parseError }, { status: 400 })

  const { data, error } = await supabaseAdmin('schedule_goals', {
    method: 'POST',
    body: {
      teacher_id: user.id,
      title: input.title,
      note: input.note,
      horizon: input.horizon,
      due_date: input.dueDate,
    },
    query: '?select=*',
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ goal: rowToGoal(Array.isArray(data) ? data[0] : data) })
}
