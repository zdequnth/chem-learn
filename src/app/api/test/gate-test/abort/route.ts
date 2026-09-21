import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/admin'
import { NextResponse } from 'next/server'

// Ends an in-progress gate test early (e.g. the student switched windows twice)
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const { sessionId, focusLost } = await request.json()
  if (!sessionId) return NextResponse.json({ error: '缺少sessionId' }, { status: 400 })

  const { data: sessions } = await supabaseAdmin('gate_test_sessions', {
    query: `?id=eq.${sessionId}&student_id=eq.${user.id}&select=id,status`,
  })
  const s = sessions?.[0]
  if (!s) return NextResponse.json({ error: '无权操作' }, { status: 403 })
  if (s.status !== 'in_progress') return NextResponse.json({ success: true })

  await supabaseAdmin('gate_test_sessions', {
    method: 'PATCH',
    body: { status: 'failed', completed_at: new Date().toISOString() },
    query: `?id=eq.${sessionId}`,
  })
  if (Number(focusLost) > 0) {
    await supabaseAdmin('gate_test_sessions', {
      method: 'PATCH',
      body: { focus_lost_count: Number(focusLost) },
      query: `?id=eq.${sessionId}`,
    })
  }
  return NextResponse.json({ success: true })
}
