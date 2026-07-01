import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/admin'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  // Ensure profile exists
  await supabaseAdmin('profiles', {
    method: 'POST',
    body: { id: user.id, role: (user.user_metadata as any)?.role || 'student', display_name: (user.user_metadata as any)?.display_name || user.email || '用户' },
  }).catch(() => {})

  const { searchParams } = new URL(request.url)
  const lessonId = searchParams.get('lessonId')
  if (!lessonId) return NextResponse.json({ error: '缺少lessonId' }, { status: 400 })

  // Lesson + chapter + course
  const { data: lessons } = await supabaseAdmin('lessons', { query: `?id=eq.${lessonId}&select=*` })
  const lesson = lessons?.[0] || null
  if (!lesson) return NextResponse.json({ lesson: null })

  const { data: chapters } = await supabaseAdmin('chapters', { query: `?id=eq.${lesson.chapter_id}&select=*` })
  const chapter = chapters?.[0] || null

  let course = null
  if (chapter) {
    const { data: courses } = await supabaseAdmin('courses', { query: `?id=eq.${chapter.course_id}&select=*` })
    course = courses?.[0] || null
  }

  // Progress
  const { data: progress } = await supabaseAdmin('student_progress', {
    query: `?student_id=eq.${user.id}&lesson_id=eq.${lessonId}&select=*`,
  })

  // Lock status — check latest session regardless of status
  const { data: lockData } = await supabaseAdmin('gate_test_sessions', {
    query: `?student_id=eq.${user.id}&lesson_id=eq.${lessonId}&order=started_at.desc&limit=1&select=locked_until`,
  })

  // Knowledge points
  const { data: kps } = await supabaseAdmin('knowledge_points', {
    query: `?lesson_id=eq.${lessonId}&order=sort_order&select=*`,
  })

  // Video links
  let videoLinks: any[] = []
  const kpIds = (kps || []).map((kp: any) => kp.id)
  if (kpIds.length > 0) {
    const { data: vl } = await supabaseAdmin('video_links', {
      query: `?knowledge_point_id=in.(${kpIds.join(',')})&order=sort_order&select=*`,
    })
    videoLinks = vl || []
  }

  return NextResponse.json({
    lesson,
    chapter,
    course,
    progress: progress?.[0] || null,
    lockedUntil: lockData?.[0]?.locked_until || null,
    knowledgePoints: kps || [],
    videoLinks,
  })
}
