import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/admin'
import { NextResponse } from 'next/server'

// Pick another approved question testing the same knowledge point (falling back
// to the same lesson) for extra practice on a wrong question.
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const questionId = searchParams.get('questionId')
  if (!questionId) return NextResponse.json({ error: '缺少questionId' }, { status: 400 })

  const { data: cur } = await supabaseAdmin('questions', {
    query: `?id=eq.${questionId}&select=id,lesson_id,knowledge_point_id,question_type`,
  })
  const q = cur?.[0]
  if (!q) return NextResponse.json({ error: '题目不存在' }, { status: 404 })

  const qtype = q.question_type || 'gate_test'
  // Mock questions point at a lesson of the bound gate course, but there are only
  // ever a handful of mock questions per lesson — so on their own they rarely
  // turn up a match. For a mock question we therefore also draw on the gate
  // questions of the same lesson, which is exactly the drilling material a
  // student who just missed that topic needs.
  const types = qtype === 'mock' ? ['mock', 'gate_test'] : [qtype]
  const candidatesFor = async (filter: string, type: string) => {
    const { data } = await supabaseAdmin('questions', {
      query: `?${filter}&question_type=eq.${type}&is_approved=eq.true&id=neq.${q.id}&select=id,stem,image_url,explanation&limit=100`,
    })
    return data || []
  }
  const gather = async (filter: string) => {
    for (const t of types) {
      const found = await candidatesFor(filter, t)
      if (found.length > 0) return found
    }
    return []
  }

  let candidates = q.knowledge_point_id ? await candidatesFor(`knowledge_point_id=eq.${q.knowledge_point_id}`, qtype) : []
  let scope = 'knowledge_point'
  if (candidates.length === 0) {
    candidates = await gather(`lesson_id=eq.${q.lesson_id}`)
    scope = 'lesson'
  }
  if (candidates.length === 0) return NextResponse.json({ question: null })

  // Prefer questions the student has not already answered correctly — across
  // both the gate tests and any mock exams they have sat.
  const answeredCorrect = new Set<string>()
  const { data: sess } = await supabaseAdmin('gate_test_sessions', { query: `?student_id=eq.${user.id}&select=id` })
  const sids = (sess || []).map((s: any) => s.id)
  for (let i = 0; i < sids.length; i += 150) {
    const { data } = await supabaseAdmin('gate_test_answers', {
      query: `?session_id=in.(${sids.slice(i, i + 150).join(',')})&is_correct=eq.true&select=question_id`,
    })
    for (const a of (data || [])) answeredCorrect.add(a.question_id)
  }
  const { data: mockSess } = await supabaseAdmin('mock_test_sessions', {
    query: `?student_id=eq.${user.id}&status=eq.submitted&select=id`,
  })
  const msids = (mockSess || []).map((s: any) => s.id)
  for (let i = 0; i < msids.length; i += 150) {
    const { data } = await supabaseAdmin('mock_test_answers', {
      query: `?session_id=in.(${msids.slice(i, i + 150).join(',')})&is_correct=eq.true&select=question_id`,
    })
    for (const a of (data || [])) answeredCorrect.add(a.question_id)
  }
  const preferred = candidates.filter((c: any) => !answeredCorrect.has(c.id))
  const pool = preferred.length > 0 ? preferred : candidates
  const chosen = pool[Math.floor(Math.random() * pool.length)]

  const { data: opts } = await supabaseAdmin('question_options', {
    query: `?question_id=eq.${chosen.id}&order=display_order&select=id,content,is_correct`,
  })

  return NextResponse.json({
    question: {
      id: chosen.id,
      stem: chosen.stem,
      imageUrl: chosen.image_url || null,
      explanation: chosen.explanation || '',
      scope,
      options: (opts || []).map((o: any) => ({ id: o.id, content: o.content, isCorrect: o.is_correct })),
    },
  })
}
