import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/admin'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  // Ensure profile exists (may have been deleted by DB reset)
  await supabaseAdmin('profiles', {
    method: 'POST',
    body: { id: user.id, role: (user.user_metadata as any)?.role || 'student', display_name: (user.user_metadata as any)?.display_name || user.email || '用户' },
  }).catch(() => {})

  const { searchParams } = new URL(request.url)
  const courseId = searchParams.get('courseId')

  if (courseId) {
    // Fetch single course with chapters, lessons, progress
    const { data: courses } = await supabaseAdmin('courses', {
      query: `?id=eq.${courseId}&select=*`,
    })
    const course = courses?.[0] || null
    if (!course) return NextResponse.json({ course: null })

    const { data: chapters } = await supabaseAdmin('chapters', {
      query: `?course_id=eq.${courseId}&order=sort_order&select=*`,
    })
    const { data: lessons } = await supabaseAdmin('lessons', {
      query: `?chapter_id=in.(${(chapters || []).map((c: any) => c.id).join(',')})&order=sort_order&select=*`,
    })
    const lessonIds = (lessons || []).map((l: any) => l.id)
    let progress: any[] = []
    if (lessonIds.length > 0) {
      const { data: p } = await supabaseAdmin('student_progress', {
        query: `?student_id=eq.${user.id}&lesson_id=in.(${lessonIds.join(',')})&select=*`,
      })
      progress = p || []
    }

    // Auto-unlock first lesson
    const firstLesson = (lessons || []).sort((a: any, b: any) => a.sort_order - b.sort_order)[0]
    if (firstLesson && !progress.find((p: any) => p.lesson_id === firstLesson.id)) {
      await supabaseAdmin('student_progress', {
        method: 'POST',
        body: { student_id: user.id, lesson_id: firstLesson.id, status: 'unlocked' },
      })
    }

    return NextResponse.json({ course, chapters: chapters || [], lessons: lessons || [], progress })
  }

  // Fetch courses based on role
  const role = (user.user_metadata as any)?.role
  const isTeacher = role === 'teacher' || role === 'admin'
  if (isTeacher) {
    // Get owned courses
    const { data: owned } = await supabaseAdmin('courses', {
      query: `?owner_id=eq.${user.id}&order=sort_order&select=*`,
    })
    // Get collaborated courses
    const { data: collabIds } = await supabaseAdmin('course_collaborators', {
      query: `?teacher_id=eq.${user.id}&select=course_id`,
    })
    const courseIds = (collabIds || []).map((c: any) => c.course_id)
    let collabCourses: any[] = []
    if (courseIds.length > 0) {
      const { data: cc } = await supabaseAdmin('courses', {
        query: `?id=in.(${courseIds.join(',')})&order=sort_order&select=*`,
      })
      collabCourses = cc || []
    }
    const all = [...(owned || []), ...collabCourses]
    return NextResponse.json({ courses: all })
  }
  const { data: courses } = await supabaseAdmin('courses', {
    query: '?is_published=eq.true&order=sort_order&select=*',
  })
  return NextResponse.json({ courses: courses || [] })
}
