import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/admin'
import { loadMockCourse, isAdminUser } from '@/lib/mock-source'
import { importRemoteImage, isLocalImage } from '@/lib/storage'
import { NextResponse } from 'next/server'

// Papers of one mock course.
//   GET  ?courseId=          → paper list with question / attempt counts
//   POST { courseId, title, durationMinutes, questions:[...] }
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const courseId = new URL(request.url).searchParams.get('courseId')
  if (!courseId) return NextResponse.json({ error: '缺少courseId' }, { status: 400 })

  const { error, status } = await loadMockCourse(user.id, courseId, await isAdminUser())
  if (error) return NextResponse.json({ error }, { status: status || 400 })

  const { data: papers } = await supabaseAdmin('mock_papers', {
    query: `?mock_course_id=eq.${courseId}&order=sort_order&select=id,title,duration_minutes,sort_order`,
  })
  const ids = (papers || []).map((p: any) => p.id)
  const counts = new Map<string, number>()
  const attempts = new Map<string, number>()
  if (ids.length) {
    const { data: pq } = await supabaseAdmin('mock_paper_questions', {
      query: `?paper_id=in.(${ids.join(',')})&select=paper_id`,
    })
    for (const r of (pq || []) as any[]) counts.set(r.paper_id, (counts.get(r.paper_id) || 0) + 1)
    const { data: ss } = await supabaseAdmin('mock_test_sessions', {
      query: `?paper_id=in.(${ids.join(',')})&status=eq.submitted&select=paper_id`,
    })
    for (const r of (ss || []) as any[]) attempts.set(r.paper_id, (attempts.get(r.paper_id) || 0) + 1)
  }

  return NextResponse.json({
    papers: (papers || []).map((p: any) => ({
      id: p.id,
      title: p.title,
      durationMinutes: p.duration_minutes,
      questionCount: counts.get(p.id) || 0,
      attemptCount: attempts.get(p.id) || 0,
    })),
  })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const body = await request.json()
  const { courseId, title, durationMinutes, questions } = body
  if (!courseId) return NextResponse.json({ error: '缺少courseId' }, { status: 400 })
  if (!title?.trim()) return NextResponse.json({ error: '请填写试卷标题' }, { status: 400 })

  const { course, error, status } = await loadMockCourse(user.id, courseId, await isAdminUser())
  if (error) return NextResponse.json({ error }, { status: status || 400 })
  if (!course!.mock_source_course_id) {
    return NextResponse.json({ error: '这门模拟考课程还没有绑定通关课程' }, { status: 400 })
  }

  const list: any[] = Array.isArray(questions) ? questions : []
  if (list.length === 0) return NextResponse.json({ error: '试卷里至少要有一道题' }, { status: 400 })

  // Every question must name a lesson OF THE BOUND GATE COURSE — that mapping is
  // the whole point, so it is validated rather than trusted.
  const { data: chapters } = await supabaseAdmin('chapters', {
    query: `?course_id=eq.${course!.mock_source_course_id}&select=id`,
  })
  const chIds = (chapters || []).map((c: any) => c.id)
  const { data: lessons } = chIds.length
    ? await supabaseAdmin('lessons', { query: `?chapter_id=in.(${chIds.join(',')})&select=id` })
    : { data: [] as any[] }
  const validLesson = new Set((lessons || []).map((l: any) => l.id))

  const bad = list.findIndex((q) => !q?.lessonId || !validLesson.has(q.lessonId))
  if (bad >= 0) {
    return NextResponse.json({ error: `第 ${bad + 1} 题没有指定所属章节/课时（或指定的课时不属于这门课的绑定课程）` }, { status: 400 })
  }

  const { data: paperRows, error: pErr } = await supabaseAdmin('mock_papers', {
    method: 'POST',
    body: {
      mock_course_id: courseId,
      title: title.trim(),
      duration_minutes: Math.min(600, Math.max(1, Number(durationMinutes) || 60)),
      sort_order: 0,
    },
    query: '?select=id',
  })
  if (pErr || !paperRows?.[0]) return NextResponse.json({ error: pErr?.message || '创建试卷失败' }, { status: 500 })
  const paperId = paperRows[0].id

  const imageWarnings: string[] = []
  let saved = 0
  for (let i = 0; i < list.length; i++) {
    const q = list[i]

    // Pull any third-party image (e.g. a PDF parser's CDN link) into our own
    // storage, otherwise it shows for the teacher but breaks for students.
    let imageUrl: string | null = typeof q.imageUrl === 'string' && q.imageUrl.trim() ? q.imageUrl.trim() : null
    if (imageUrl && !isLocalImage(imageUrl)) {
      const got = await importRemoteImage(imageUrl)
      if (got.url) imageUrl = got.url
      else { imageWarnings.push(`第 ${i + 1} 题配图未能入库（${got.error}）`); imageUrl = null }
    }

    const { data: qRows, error: qErr } = await supabaseAdmin('questions', {
      method: 'POST',
      body: {
        lesson_id: q.lessonId,
        question_type: 'mock',
        difficulty: Math.min(5, Math.max(1, Number(q.difficulty) || 3)),
        stem: String(q.stem ?? '').trim(),
        explanation: String(q.explanation ?? '').trim(),
        image_url: imageUrl,
        is_approved: true,
        is_ai_generated: q.isAiGenerated !== false,
        created_by: user.id,
      },
      query: '?select=id',
    })
    const questionId = qRows?.[0]?.id
    if (qErr || !questionId) continue

    const opts = (Array.isArray(q.options) ? q.options : []).filter((o: any) => String(o?.content ?? '').trim())
    for (let k = 0; k < opts.length; k++) {
      await supabaseAdmin('question_options', {
        method: 'POST',
        body: {
          question_id: questionId,
          content: String(opts[k].content).trim(),
          is_correct: opts[k].isCorrect === true,
          display_order: k,
        },
      })
    }
    await supabaseAdmin('mock_paper_questions', {
      method: 'POST',
      body: { paper_id: paperId, question_id: questionId, sort_order: i },
    })
    saved++
  }

  return NextResponse.json({ paperId, saved, imageWarnings })
}
