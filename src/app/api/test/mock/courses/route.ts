import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/admin'
import { NextResponse } from 'next/server'

// The mock courses THIS STUDENT may sit.
//
// Two traps this avoids:
//  1. Not /api/courses — that lists the courses a teacher OWNS, which is empty
//     for a student.
//  2. A mock course has its own publish switch AND each paper has one. Requiring
//     both is a trap: a teacher publishes "AP CHEM 2012" and reasonably expects
//     students to see it, but the course switch is still off. So a PUBLISHED
//     PAPER is on its own enough to surface the course.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const { data: members } = await supabaseAdmin('class_members', {
    query: `?student_id=eq.${user.id}&select=class_id`,
  })
  const classIds = [...new Set((members || []).map((m: any) => m.class_id).filter(Boolean))]
  const { data: classes } = classIds.length
    ? await supabaseAdmin('classes', { query: `?id=in.(${classIds.join(',')})&select=course_id` })
    : { data: [] as any[] }
  const fromClasses = (classes || []).map((c: any) => c.course_id).filter(Boolean)

  const { data: published } = await supabaseAdmin('courses', {
    query: `?is_published=eq.true&select=id`,
  })
  const publishedIds = (published || []).map((c: any) => c.id)

  // Courses with at least one published paper count as visible, whether or not
  // the course itself was published.
  const { data: pubPapers } = await supabaseAdmin('mock_papers', {
    query: `?is_published=eq.true&select=mock_course_id`,
  })
  const withPaper = [...new Set((pubPapers || []).map((p: any) => p.mock_course_id))]

  const wantIds = [...new Set([...fromClasses, ...publishedIds, ...withPaper])]
  if (wantIds.length === 0) return NextResponse.json({ courses: [] })

  const { data: courses } = await supabaseAdmin('courses', {
    query: `?id=in.(${wantIds.join(',')})&kind=eq.mock&select=id,name`,
  })
  const visible = courses || []
  if (visible.length === 0) return NextResponse.json({ courses: [] })

  // ...and it must still have a published paper to sit.
  const hasPaper = new Set(withPaper)
  const { data: papers } = await supabaseAdmin('mock_papers', {
    query: `?mock_course_id=in.(${visible.map((c: any) => c.id).join(',')})&is_published=eq.true&select=mock_course_id`,
  })
  for (const p of (papers || []) as any[]) hasPaper.add(p.mock_course_id)

  return NextResponse.json({
    courses: visible
      .filter((c: any) => hasPaper.has(c.id))
      .map((c: any) => ({ id: c.id, name: c.name })),
  })
}
