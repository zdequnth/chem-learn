import { createClient } from '@/lib/supabase/server'
import { loadMockCourse, loadSourceOutline, isAdminUser } from '@/lib/mock-source'
import { NextResponse } from 'next/server'

// The bound gate course's chapter/lesson outline, as a numbered list. Used to
// populate the teacher's lesson picker and to show what the AI's "2.1" refs mean.
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const courseId = new URL(request.url).searchParams.get('courseId')
  if (!courseId) return NextResponse.json({ error: '缺少courseId' }, { status: 400 })

  const { course, error, status } = await loadMockCourse(user.id, courseId, await isAdminUser())
  if (error) return NextResponse.json({ error }, { status: status || 400 })

  if (!course!.mock_source_course_id) {
    return NextResponse.json({ error: '这门模拟考课程还没有绑定通关课程' }, { status: 400 })
  }

  const outline = await loadSourceOutline(course!.mock_source_course_id)
  if (!outline) return NextResponse.json({ error: '绑定的通关课程不存在' }, { status: 404 })

  return NextResponse.json({
    courseName: outline.courseName,
    // Grouped for the picker; refs match exactly what the AI returns.
    chapters: [...new Set(outline.lessons.map((l) => l.chapterId))].map((cid) => {
      const inCh = outline.lessons.filter((l) => l.chapterId === cid)
      return { id: cid, title: inCh[0].chapterTitle, lessons: inCh.map((l) => ({ ref: l.ref, id: l.lessonId, title: l.lessonTitle })) }
    }),
  })
}
