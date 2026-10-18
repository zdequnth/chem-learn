import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/admin'
import { NextResponse } from 'next/server'
import { parseItemInput, rowToItem } from '@/lib/schedule'

const ITEM_FIELDS = 'id,title,kind,class_id,color,repeat,weekday,event_date,start_period,end_period,note,goal_id'

// Used by the timetable importer and by "accept AI plan": both create a batch of
// rows in one go, after the teacher has already confirmed what they should be.
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const raw = Array.isArray(body?.items) ? body.items : []
  if (raw.length === 0) return NextResponse.json({ error: '没有要导入的安排' }, { status: 400 })
  if (raw.length > 100) return NextResponse.json({ error: '一次最多导入 100 条' }, { status: 400 })

  const inputs = []
  for (const [i, item] of raw.entries()) {
    const { input, error } = parseItemInput(item)
    if (!input) return NextResponse.json({ error: `第 ${i + 1} 条：${error}` }, { status: 400 })
    inputs.push(input)
  }

  const classIds = [...new Set(inputs.map(i => i.classId).filter(Boolean))] as string[]
  if (classIds.length) {
    const { data: owned } = await supabaseAdmin('classes', {
      query: `?id=in.(${classIds.join(',')})&teacher_id=eq.${user.id}&select=id`,
    })
    if ((owned || []).length !== classIds.length) {
      return NextResponse.json({ error: '有班级不存在或不属于你' }, { status: 400 })
    }
  }

  let goalId: string | null = null
  if (typeof body?.goalId === 'string' && body.goalId) {
    const { data: owned } = await supabaseAdmin('schedule_goals', {
      query: `?id=eq.${body.goalId}&teacher_id=eq.${user.id}&select=id`,
    })
    if (!owned?.length) return NextResponse.json({ error: '目标不存在' }, { status: 400 })
    goalId = body.goalId
  }

  const rows = inputs.map(input => ({
    teacher_id: user.id,
    goal_id: goalId,
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
  }))

  const { data, error } = await supabaseAdmin('schedule_items', {
    method: 'POST',
    body: rows,
    query: `?select=${ITEM_FIELDS}`,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ items: (data || []).map(rowToItem) })
}
