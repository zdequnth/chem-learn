import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/admin'
import { NextResponse } from 'next/server'

async function checkLessonAccess(userId: string, lessonId: string): Promise<boolean> {
  const role = (await (await createClient()).auth.getUser()).data.user?.user_metadata?.role
  if (role === 'admin') return true
  const { data: ln } = await supabaseAdmin('lessons', { query: `?id=eq.${lessonId}&select=chapter_id` })
  if (!ln || ln.length === 0) return false
  const { data: ch } = await supabaseAdmin('chapters', { query: `?id=eq.${ln[0].chapter_id}&select=course_id` })
  if (!ch || ch.length === 0) return false
  const courseId = ch[0].course_id
  const { data: course } = await supabaseAdmin('courses', { query: `?id=eq.${courseId}&select=owner_id` })
  if (course?.[0]?.owner_id === userId) return true
  const { data: cc } = await supabaseAdmin('course_collaborators', { query: `?course_id=eq.${courseId}&teacher_id=eq.${userId}&select=id` })
  return (cc || []).length > 0
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const body = await request.json()
  const { questions } = body

  // Check access for all unique lesson_ids
  const lessonIds = [...new Set<string>((questions || []).map((q: any) => q.lesson_id))]
  for (const lid of lessonIds) {
    if (!await checkLessonAccess(user.id, lid)) {
      return NextResponse.json({ error: '无权操作' }, { status: 403 })
    }
  }

  let saved = 0
  for (const q of questions) {
    // Insert question
    const { data: qData, error: qErr } = await supabaseAdmin('questions', {
      method: 'POST',
      body: {
        lesson_id: q.lesson_id,
        question_type: q.question_type || 'gate_test',
        difficulty: q.difficulty || 3,
        stem: q.stem,
        explanation: q.explanation || '',
        image_url: q.image_url || null,
        is_approved: q.is_approved !== false,
        is_ai_generated: q.is_ai_generated !== false,
        created_by: user.id,
      },
      query: '?select=id',
    })

    if (qErr || !qData) continue

    const questionId = Array.isArray(qData) ? qData[0]?.id : qData.id
    if (!questionId) continue

    // Insert options
    let order = 0
    for (const opt of q.options || []) {
      await supabaseAdmin('question_options', {
        method: 'POST',
        body: {
          question_id: questionId,
          content: opt.content,
          is_correct: opt.isCorrect === true,
          display_order: order++,
        },
      })
    }
    saved++
  }

  return NextResponse.json({ saved })
}
