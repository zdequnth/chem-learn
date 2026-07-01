import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/admin'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const body = await request.json()
  const { questions } = body // array of { stem, options, explanation, difficulty, question_type, lesson_id }

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
