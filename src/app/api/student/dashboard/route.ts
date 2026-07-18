import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/admin'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  // Ensure profile exists
  await supabaseAdmin('profiles', {
    method: 'POST',
    body: { id: user.id, role: (user.user_metadata as any)?.role || 'student', display_name: (user.user_metadata as any)?.display_name || user.email || '用户' },
  }).catch(() => {})

  // Get student's classes
  const { data: memberships } = await supabaseAdmin('class_members', {
    query: `?student_id=eq.${user.id}&select=class_id`,
  })
  const classIds = (memberships || []).map((m: any) => m.class_id)

  const { data: myProgress } = await supabaseAdmin('student_progress', {
    query: `?student_id=eq.${user.id}&select=lesson_id,status`,
  })

  // Build per-class progress — preload everything in parallel
  let myClasses: any[] = []
  if (classIds.length > 0) {
    const { data: classes } = await supabaseAdmin('classes', {
      query: `?id=in.(${classIds.join(',')})&select=*`,
    })

    // Get all relevant course IDs
    const courseIds = [...new Set((classes || []).map((c: any) => c.course_id).filter(Boolean))]

    // Parallel: fetch all chapters, all courses
    const [chaptersRes, coursesRes] = await Promise.all([
      courseIds.length > 0
        ? supabaseAdmin('chapters', { query: `?course_id=in.(${courseIds.join(',')})&select=id,course_id` })
        : Promise.resolve({ data: [] }),
      courseIds.length > 0
        ? supabaseAdmin('courses', { query: `?id=in.(${courseIds.join(',')})&select=id,name` })
        : Promise.resolve({ data: [] }),
    ])

    const allChapters = chaptersRes.data || []
    const chapterIds = allChapters.map((ch: any) => ch.id)
    const coursesMap = new Map((coursesRes.data || []).map((c: any) => [c.id, c.name]))

    // Fetch all lessons in parallel
    const lessonsRes = chapterIds.length > 0
      ? await supabaseAdmin('lessons', { query: `?chapter_id=in.(${chapterIds.join(',')})&select=id,chapter_id` })
      : { data: [] }
    const allLessons = lessonsRes.data || []

    for (const cls of (classes || [])) {
      let passed = 0; let total = 0
      if (cls.course_id) {
        const chIds = allChapters.filter((ch: any) => ch.course_id === cls.course_id).map((ch: any) => ch.id)
        const lns = allLessons.filter((l: any) => chIds.includes(l.chapter_id))
        total = lns.length
        passed = lns.filter((l: any) =>
          (myProgress || []).some((p: any) => p.lesson_id === l.id && p.status === 'passed')
        ).length
      }
      myClasses.push({ ...cls, passed, total, percent: total > 0 ? Math.round((passed / total) * 100) : 0, courseName: coursesMap.get(cls.course_id) || '' })
    }
  }

  return NextResponse.json({ classes: myClasses })
}
