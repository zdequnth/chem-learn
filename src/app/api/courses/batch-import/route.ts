import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/admin'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const { courseId, markdown } = await request.json()
  if (!courseId || !markdown?.trim()) return NextResponse.json({ error: '缺少参数' }, { status: 400 })

  // Parse: # Chapter Title, ## Lesson Title
  const lines = markdown.split('\n')
  let currentChapterId: string | null = null
  let chapterOrder = 0
  let lessonOrder = 0
  const result = { chapters: 0, lessons: 0 }

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    if (trimmed.startsWith('# ') && !trimmed.startsWith('## ')) {
      // New chapter
      const title = trimmed.replace(/^# /, '').trim()
      const { data: ch } = await supabaseAdmin('chapters', {
        method: 'POST',
        body: { course_id: courseId, title, sort_order: chapterOrder },
        query: '?select=id',
      })
      if (ch?.[0]?.id) {
        currentChapterId = ch[0].id
        chapterOrder++
        lessonOrder = 0
        result.chapters++
      }
    } else if (trimmed.startsWith('## ')) {
      // New lesson
      const title = trimmed.replace(/^## /, '').trim()
      if (!currentChapterId) {
        // Create a default chapter first
        const { data: ch } = await supabaseAdmin('chapters', {
          method: 'POST',
          body: { course_id: courseId, title: '新章节', sort_order: chapterOrder },
          query: '?select=id',
        })
        if (ch?.[0]?.id) {
          currentChapterId = ch[0].id
          chapterOrder++
          result.chapters++
        }
      }
      if (currentChapterId) {
        await supabaseAdmin('lessons', {
          method: 'POST',
          body: { chapter_id: currentChapterId, title, sort_order: lessonOrder },
        })
        lessonOrder++
        result.lessons++
      }
    }
  }

  return NextResponse.json(result)
}
