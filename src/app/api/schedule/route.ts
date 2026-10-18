import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/admin'
import { NextResponse } from 'next/server'
import {
  DEFAULT_SETTINGS, addDays, isDateString, parseItemInput,
  rowToItem, type ScheduleMark, type ScheduleSettings,
} from '@/lib/schedule'

const ITEM_FIELDS = 'id,title,kind,class_id,color,repeat,weekday,event_date,start_period,end_period,note'

// GET ?week=YYYY-MM-DD → settings + every item + the marks that fall in that week.
// Items are few (a teacher's whole term), so returning all of them keeps the page
// from having to re-fetch when the user edits one.
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const week = new URL(request.url).searchParams.get('week')

  const { data: settingRows } = await supabaseAdmin('schedule_settings', {
    query: `?teacher_id=eq.${user.id}&select=term_start,term_weeks,periods`,
  })
  const s = settingRows?.[0]
  const settings: ScheduleSettings = s
    ? { termStart: s.term_start, termWeeks: s.term_weeks, periods: s.periods }
    : DEFAULT_SETTINGS

  const { data: itemRows, error } = await supabaseAdmin('schedule_items', {
    query: `?teacher_id=eq.${user.id}&select=${ITEM_FIELDS}&order=start_period`,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const items = (itemRows || []).map(rowToItem)

  let marks: ScheduleMark[] = []
  if (isDateString(week) && items.length) {
    const { data: markRows } = await supabaseAdmin('schedule_marks', {
      query: `?teacher_id=eq.${user.id}&occurrence_date=gte.${week}&occurrence_date=lte.${addDays(week, 6)}&select=item_id,occurrence_date,status`,
    })
    marks = (markRows || []).map((m: any) => ({
      itemId: m.item_id,
      date: m.occurrence_date,
      status: m.status,
    }))
  }

  return NextResponse.json({ settings, items, marks })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const { input, error: parseError } = parseItemInput(await request.json().catch(() => null))
  if (!input) return NextResponse.json({ error: parseError }, { status: 400 })

  if (input.classId) {
    // Never let a plan point at somebody else's class.
    const { data: owned } = await supabaseAdmin('classes', {
      query: `?id=eq.${input.classId}&teacher_id=eq.${user.id}&select=id`,
    })
    if (!owned?.length) return NextResponse.json({ error: '班级不存在' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin('schedule_items', {
    method: 'POST',
    body: {
      teacher_id: user.id,
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
    },
    query: `?select=${ITEM_FIELDS}`,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ item: rowToItem(Array.isArray(data) ? data[0] : data) })
}
