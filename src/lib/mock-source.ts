// Server-only helpers for mock exam courses. Kept out of src/lib/mock-exam.ts
// because that file is imported by client components.
import { supabaseAdmin } from './admin'

export interface OutlineLesson {
  ref: string          // "5.3" — chapter number . lesson number, by position
  lessonId: string
  chapterId: string
  chapterTitle: string
  lessonTitle: string
}

export interface SourceOutline {
  courseId: string
  courseName: string
  lessons: OutlineLesson[]
  byRef: Map<string, OutlineLesson>
  // The numbered list handed to the AI. Refs, never UUIDs — models corrupt
  // 36-character ids, and a "5.3" token can be validated exactly.
  promptList: string
}

// The outline of the gate course a mock course is built from. Chapter/lesson
// numbers come from POSITION, not sort_order, because some courses have
// duplicate sort_order values.
export async function loadSourceOutline(sourceCourseId: string): Promise<SourceOutline | null> {
  const { data: courseRows } = await supabaseAdmin('courses', {
    query: `?id=eq.${sourceCourseId}&select=id,name`,
  })
  const course = courseRows?.[0]
  if (!course) return null

  const { data: chapters } = await supabaseAdmin('chapters', {
    query: `?course_id=eq.${sourceCourseId}&order=sort_order&select=id,title`,
  })
  const chs = chapters || []
  const lessons: OutlineLesson[] = []
  const lines: string[] = []

  for (let ci = 0; ci < chs.length; ci++) {
    const ch = chs[ci]
    lines.push(`第${ci + 1}章 ${ch.title}`)
    const { data: ls } = await supabaseAdmin('lessons', {
      query: `?chapter_id=eq.${ch.id}&order=sort_order&select=id,title`,
    })
    ;(ls || []).forEach((l: any, li: number) => {
      const ref = `${ci + 1}.${li + 1}`
      lines.push(`  ${ref} ${l.title}`)
      lessons.push({ ref, lessonId: l.id, chapterId: ch.id, chapterTitle: ch.title, lessonTitle: l.title })
    })
  }

  return {
    courseId: course.id,
    courseName: course.name,
    lessons,
    byRef: new Map(lessons.map((l) => [l.ref, l])),
    promptList: lines.join('\n'),
  }
}

export interface MockCourse {
  id: string
  name: string
  kind: string
  owner_id: string
  mock_source_course_id: string | null
}

// A mock course is editable by its owner and by collaborators, same as any other
// course. RLS does not help here — the routes read through the service role.
export async function loadMockCourse(
  userId: string,
  mockCourseId: string,
  isAdmin = false,
): Promise<{ course?: MockCourse; error?: string; status?: number }> {
  const { data } = await supabaseAdmin('courses', {
    query: `?id=eq.${mockCourseId}&select=id,name,kind,owner_id,mock_source_course_id`,
  })
  const course = data?.[0]
  if (!course) return { error: '课程不存在', status: 404 }
  if (course.kind !== 'mock') return { error: '这不是模拟考课程', status: 400 }
  if (isAdmin || course.owner_id === userId) return { course }

  const { data: cc } = await supabaseAdmin('course_collaborators', {
    query: `?course_id=eq.${mockCourseId}&teacher_id=eq.${userId}&select=id`,
  })
  if ((cc || []).length > 0) return { course }
  return { error: '无权操作', status: 403 }
}

// Same check, but reached from a paper id rather than a course id.
export async function loadPaperForTeacher(
  userId: string,
  paperId: string,
  isAdmin = false,
): Promise<{ paper?: any; course?: MockCourse; error?: string; status?: number }> {
  const { data } = await supabaseAdmin('mock_papers', {
    query: `?id=eq.${paperId}&select=id,mock_course_id,title,duration_minutes,sort_order`,
  })
  const paper = data?.[0]
  if (!paper) return { error: '试卷不存在', status: 404 }
  const res = await loadMockCourse(userId, paper.mock_course_id, isAdmin)
  if (res.error) return { error: res.error, status: res.status }
  return { paper, course: res.course }
}

export async function isAdminUser(): Promise<boolean> {
  const { createClient } = await import('./supabase/server')
  const role = (await (await createClient()).auth.getUser()).data.user?.user_metadata?.role
  return role === 'admin'
}
