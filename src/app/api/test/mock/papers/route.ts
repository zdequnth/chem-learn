import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/admin'
import { NextResponse } from 'next/server'

// The papers a student can sit, for one mock course.
//   GET ?courseId=  → { courseName, papers: [{ id, title, durationMinutes, questionCount, lastResult }] }
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const courseId = new URL(request.url).searchParams.get('courseId')
  if (!courseId) return NextResponse.json({ error: '缺少courseId' }, { status: 400 })

  const { data: courseRows } = await supabaseAdmin('courses', {
    query: `?id=eq.${courseId}&select=id,name,kind,is_published`,
  })
  const course = courseRows?.[0]
  if (!course || course.kind !== 'mock') return NextResponse.json({ error: '课程不存在' }, { status: 404 })

  const { data: papers } = await supabaseAdmin('mock_papers', {
    query: `?mock_course_id=eq.${courseId}&order=sort_order&select=id,title,duration_minutes`,
  })
  const ids = (papers || []).map((p: any) => p.id)

  const counts = new Map<string, number>()
  const mine = new Map<string, { status: string; percentage: number | null; submittedAt: string | null; sessionId: string }>()
  if (ids.length) {
    const { data: pq } = await supabaseAdmin('mock_paper_questions', {
      query: `?paper_id=in.(${ids.join(',')})&select=paper_id`,
    })
    for (const r of (pq || []) as any[]) counts.set(r.paper_id, (counts.get(r.paper_id) || 0) + 1)

    // This student's sessions: a live one (to resume) or the latest finished one.
    const { data: ss } = await supabaseAdmin('mock_test_sessions', {
      query: `?student_id=eq.${user.id}&paper_id=in.(${ids.join(',')})&order=started_at.desc&select=id,paper_id,status,score_percentage,submitted_at`,
    })
    for (const s of (ss || []) as any[]) {
      const prev = mine.get(s.paper_id)
      // an in-progress session always wins, otherwise keep the newest submitted
      if (!prev || (s.status === 'in_progress' && prev.status !== 'in_progress')) {
        mine.set(s.paper_id, { status: s.status, percentage: s.score_percentage, submittedAt: s.submitted_at, sessionId: s.id })
      }
    }
  }

  return NextResponse.json({
    courseName: course.name,
    papers: (papers || []).map((p: any) => ({
      id: p.id,
      title: p.title,
      durationMinutes: p.duration_minutes,
      questionCount: counts.get(p.id) || 0,
      lastResult: mine.get(p.id) || null,
    })),
  })
}
