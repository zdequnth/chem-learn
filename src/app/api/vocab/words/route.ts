import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/admin'
import { normaliseDifficulty } from '@/lib/types'
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

const TEXT_FIELDS = ['term', 'ipa', 'pos', 'zh', 'en_def', 'example_en', 'example_zh', 'image_url', 'note']

function cleanWord(raw: any) {
  const out: any = {}
  for (const f of TEXT_FIELDS) out[f] = typeof raw?.[f] === 'string' ? raw[f].trim() || null : null
  out.difficulty = normaliseDifficulty(raw?.difficulty)
  return out
}

// GET ?lessonId=  → the lesson's words, each with the caller's own progress
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const lessonId = searchParams.get('lessonId')
  if (!lessonId) return NextResponse.json({ error: '缺少lessonId' }, { status: 400 })

  const { data: words } = await supabaseAdmin('vocab_words', {
    query: `?lesson_id=eq.${lessonId}&order=sort_order.asc&select=*`,
  })
  const list = words || []

  let progress: any[] = []
  if (list.length > 0) {
    const ids = list.map((w: any) => w.id).join(',')
    const { data } = await supabaseAdmin('vocab_progress', {
      query: `?student_id=eq.${user.id}&word_id=in.(${ids})&select=word_id,last_result,box,due_at`,
    })
    progress = data || []
  }
  const byWord = new Map(progress.map((p: any) => [p.word_id, p]))

  return NextResponse.json({
    words: list.map((w: any) => ({ ...w, progress: byWord.get(w.id) || null })),
  })
}

// POST {lesson_id, words:[...]} → batch create. Used by both manual add and the
// paste-JSON import, so it must tolerate junk: missing fields, blank terms, and
// terms already present in the lesson.
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const body = await request.json()
  const lessonId = body?.lesson_id
  const incoming = Array.isArray(body?.words) ? body.words : []
  if (!lessonId) return NextResponse.json({ error: '缺少lesson_id' }, { status: 400 })
  if (!await checkLessonAccess(user.id, lessonId)) {
    return NextResponse.json({ error: '无权操作' }, { status: 403 })
  }

  const { data: existing } = await supabaseAdmin('vocab_words', {
    query: `?lesson_id=eq.${lessonId}&select=term,sort_order`,
  })
  const have = new Set((existing || []).map((w: any) => String(w.term).toLowerCase()))
  let nextOrder = (existing || []).reduce((m: number, w: any) => Math.max(m, w.sort_order ?? 0), -1) + 1

  const rows: any[] = []
  for (const raw of incoming) {
    const w = cleanWord(raw)
    if (!w.term || !w.zh) continue
    const key = w.term.toLowerCase()
    if (have.has(key)) continue
    have.add(key)
    rows.push({ ...w, lesson_id: lessonId, sort_order: nextOrder++ })
  }

  if (rows.length === 0) return NextResponse.json({ saved: 0, skipped: incoming.length })

  const { data, error } = await supabaseAdmin('vocab_words', {
    method: 'POST', body: rows, query: '?select=*',
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ saved: (data || []).length, skipped: incoming.length - rows.length, words: data })
}

// PUT {id, ...} → edit one word
export async function PUT(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const body = await request.json()
  const { id } = body
  if (!id) return NextResponse.json({ error: '缺少id' }, { status: 400 })

  const { data: w } = await supabaseAdmin('vocab_words', { query: `?id=eq.${id}&select=lesson_id` })
  if (!w?.[0]) return NextResponse.json({ error: '词条不存在' }, { status: 404 })
  if (!await checkLessonAccess(user.id, w[0].lesson_id)) {
    return NextResponse.json({ error: '无权操作' }, { status: 403 })
  }

  const patch = { ...cleanWord(body), updated_at: new Date().toISOString() }
  if (!patch.term || !patch.zh) return NextResponse.json({ error: '术语和中文释义不能为空' }, { status: 400 })

  const { error } = await supabaseAdmin('vocab_words', {
    method: 'PATCH', body: patch, query: `?id=eq.${id}`,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  const lessonId = searchParams.get('lessonId')

  if (lessonId) {
    if (!await checkLessonAccess(user.id, lessonId)) {
      return NextResponse.json({ error: '无权操作' }, { status: 403 })
    }
    const { error } = await supabaseAdmin('vocab_words', { method: 'DELETE', query: `?lesson_id=eq.${lessonId}` })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, deletedAll: true })
  }

  if (id) {
    const { data: w } = await supabaseAdmin('vocab_words', { query: `?id=eq.${id}&select=lesson_id` })
    if (w?.[0] && !await checkLessonAccess(user.id, w[0].lesson_id)) {
      return NextResponse.json({ error: '无权操作' }, { status: 403 })
    }
    const { error } = await supabaseAdmin('vocab_words', { method: 'DELETE', query: `?id=eq.${id}` })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: '缺少id或lessonId' }, { status: 400 })
}
