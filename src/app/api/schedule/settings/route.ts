import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/admin'
import { NextResponse } from 'next/server'
import { parseSettingsInput } from '@/lib/schedule'

// One row per teacher: term dates + the 13 period times. Replaced whole rather
// than merged, so saving the dialog always leaves the same complete shape.
export async function PUT(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const { settings, error: parseError } = parseSettingsInput(await request.json().catch(() => null))
  if (!settings) return NextResponse.json({ error: parseError }, { status: 400 })

  const fields = {
    term_start: settings.termStart,
    term_weeks: settings.termWeeks,
    periods: settings.periods,
    updated_at: new Date().toISOString(),
  }

  // PATCH first so a failed write can never leave the teacher with no settings row.
  const { data: updated, error } = await supabaseAdmin('schedule_settings', {
    method: 'PATCH',
    body: fields,
    query: `?teacher_id=eq.${user.id}&select=teacher_id`,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (!Array.isArray(updated) || updated.length === 0) {
    const { error: insertError } = await supabaseAdmin('schedule_settings', {
      method: 'POST',
      body: { teacher_id: user.id, ...fields },
    })
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({ settings })
}
