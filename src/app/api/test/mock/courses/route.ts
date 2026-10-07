import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/admin'
import { NextResponse } from 'next/server'

// The mock courses THIS STUDENT may sit.
//
// Not /api/courses — that one lists courses a teacher owns, which is empty for a
// student. Same scoping rule as the vocabulary page: their classes' courses,
// plus every published course. Publishing is the teacher's switch for showing or
// hiding a mock course, and a class only ever points at one course, so a class
// tied to e.g. AP 化学 could otherwise never see a separate mock course.
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
    query: `?is_published=eq.true&select=id,name`,
  })
  const nameById = new Map((published || []).map((c: any) => [c.id, c.name]))

  // The class-linked courses may not be published, so fetch any name we are missing.
  const wantIds = [...new Set([...fromClasses, ...(published || []).map((c: any) => c.id)])]
  if (wantIds.length === 0) return NextResponse.json({ courses: [] })

  const { data: courses } = await supabaseAdmin('courses', {
    query: `?id=in.(${wantIds.join(',')})&kind=eq.mock&select=id,name`,
  })
  const visible = courses || []
  if (visible.length === 0) return NextResponse.json({ courses: [] })

  // Only offer a course that actually has a PUBLISHED paper to sit.
  const { data: papers } = await supabaseAdmin('mock_papers', {
    query: `?mock_course_id=in.(${visible.map((c: any) => c.id).join(',')})&is_published=eq.true&select=mock_course_id`,
  })
  const hasPaper = new Set((papers || []).map((p: any) => p.mock_course_id))

  return NextResponse.json({
    courses: visible
      .filter((c: any) => hasPaper.has(c.id))
      .map((c: any) => ({ id: c.id, name: c.name || nameById.get(c.id) })),
  })
}
