import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/admin'
import { buildReview, loadPaperForTeacher, loadSession, isAdminUser } from '@/lib/mock-source'
import { NextResponse } from 'next/server'

// One student's answers on one paper — what a teacher gets by clicking a score in
// the overview matrix. Authorised through the paper's course, then it reuses
// buildReview, which is the same shape the student sees after submitting.
//   GET ?sessionId=
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const sessionId = new URL(request.url).searchParams.get('sessionId')
  if (!sessionId) return NextResponse.json({ error: '缺少sessionId' }, { status: 400 })

  const session = await loadSession(sessionId)
  if (!session) return NextResponse.json({ error: '考试记录不存在' }, { status: 404 })
  // ...and not just anyone's: the caller must be able to edit the paper's course.
  if (session.status !== 'submitted') return NextResponse.json({ error: '这一场还没交卷' }, { status: 400 })

  const { error, status } = await loadPaperForTeacher(user.id, session.paper_id, await isAdminUser())
  if (error) return NextResponse.json({ error }, { status: status || 400 })

  const { data: profiles } = await supabaseAdmin('profiles', {
    query: `?id=eq.${session.student_id}&select=display_name`,
  })

  const review = await buildReview(session)
  return NextResponse.json({ studentName: profiles?.[0]?.display_name || '（未知）', review })
}
