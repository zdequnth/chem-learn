import { createClient } from '@/lib/supabase/server'
import { finaliseSession, buildReview, loadSession } from '@/lib/mock-source'
import { NextResponse } from 'next/server'

// Hand in the paper (also used when the countdown reaches zero).
//   POST { sessionId, reason?: 'manual'|'timeout' } → the review payload
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const { sessionId, reason } = await request.json()
  if (!sessionId) return NextResponse.json({ error: '缺少sessionId' }, { status: 400 })

  const session = await loadSession(sessionId)
  if (!session || session.student_id !== user.id) return NextResponse.json({ error: '考试不存在' }, { status: 404 })

  // Idempotent — submitting twice (button + timer) is fine.
  const done = await finaliseSession(session, reason === 'timeout' ? 'timeout' : 'manual')
  return NextResponse.json({ review: await buildReview(done) })
}
