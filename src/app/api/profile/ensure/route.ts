import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/admin'
import { NextResponse } from 'next/server'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const meta = user.user_metadata as any
  const { error } = await supabaseAdmin('profiles', {
    method: 'POST',
    body: {
      id: user.id,
      role: meta?.role || 'student',
      display_name: meta?.display_name || user.email || '用户',
    },
  })

  // If duplicate (already exists), that's fine
  if (error && !error.message?.includes('duplicate') && !error.message?.includes('unique')) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
