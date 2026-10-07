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

  // One entry per (class × bound course). A class can hold one course of each
  // kind, and each needs its own card — the progress bar is per course, not per
  // class.
  let myClasses: any[] = []
  if (classIds.length > 0) {
    const { data: classes } = await supabaseAdmin('classes', {
      query: `?id=in.(${classIds.join(',')})&select=*`,
    })

    // class_courses is the source of truth; a class created before 020 is covered
    // by the migration's backfill, and classes.course_id is still mirrored for the
    // gate binding.
    const { data: bindings } = await supabaseAdmin('class_courses', {
      query: `?class_id=in.(${classIds.join(',')})&select=class_id,course_id,kind`,
    })
    const byClass = new Map<string, { course_id: string; kind: string }[]>()
    for (const b of (bindings || []) as any[]) {
      byClass.set(b.class_id, [...(byClass.get(b.class_id) || []), { course_id: b.course_id, kind: b.kind }])
    }
    // Fallback for any class the backfill missed.
    for (const cls of (classes || []) as any[]) {
      if (cls.course_id && !(byClass.get(cls.id) || []).length) {
        byClass.set(cls.id, [{ course_id: cls.course_id, kind: 'gate' }])
      }
    }

    const courseIds = [...new Set([...byClass.values()].flat().map((b) => b.course_id).filter(Boolean))]

    const [chaptersRes, coursesRes] = await Promise.all([
      courseIds.length > 0
        ? supabaseAdmin('chapters', { query: `?course_id=in.(${courseIds.join(',')})&select=id,course_id` })
        : Promise.resolve({ data: [] }),
      courseIds.length > 0
        ? supabaseAdmin('courses', { query: `?id=in.(${courseIds.join(',')})&select=id,name,kind` })
        : Promise.resolve({ data: [] }),
    ])

    const allChapters = chaptersRes.data || []
    const chapterIds = allChapters.map((ch: any) => ch.id)
    const coursesMap = new Map((coursesRes.data || []).map((c: any) => [c.id, c.name]))
    const courseKind = new Map((coursesRes.data || []).map((c: any) => [c.id, c.kind || 'gate']))

    const lessonsRes = chapterIds.length > 0
      ? await supabaseAdmin('lessons', { query: `?chapter_id=in.(${chapterIds.join(',')})&select=id,chapter_id` })
      : { data: [] }
    const allLessons = lessonsRes.data || []

    for (const cls of (classes || []) as any[]) {
      for (const b of byClass.get(cls.id) || []) {
        let passed = 0; let total = 0
        if ((courseKind.get(b.course_id) || b.kind) === 'gate') {
          const chIds = allChapters.filter((ch: any) => ch.course_id === b.course_id).map((ch: any) => ch.id)
          const lns = allLessons.filter((l: any) => chIds.includes(l.chapter_id))
          total = lns.length
          passed = lns.filter((l: any) =>
            (myProgress || []).some((p: any) => p.lesson_id === l.id && p.status === 'passed')
          ).length
        }
        myClasses.push({
          ...cls,
          // unique per card: a class with three courses produces three cards
          key: `${cls.id}:${b.course_id}`,
          course_id: b.course_id,
          passed, total,
          percent: total > 0 ? Math.round((passed / total) * 100) : 0,
          courseName: coursesMap.get(b.course_id) || '',
          courseKind: courseKind.get(b.course_id) || b.kind,
        })
      }
    }
  }

  return NextResponse.json({ classes: myClasses })
}
