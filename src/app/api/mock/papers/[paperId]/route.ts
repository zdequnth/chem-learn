import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/admin'
import { loadPaperForTeacher, loadSourceOutline, isAdminUser } from '@/lib/mock-source'
import { importRemoteImage, isLocalImage } from '@/lib/storage'
import { normaliseMineruText } from '@/lib/mineru-text'
import { NextResponse } from 'next/server'

// One paper, with its questions in paper order and their chapter/lesson resolved
// against the bound gate course.
export async function GET(_request: Request, { params }: { params: Promise<{ paperId: string }> }) {
  const { paperId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const { paper, course, error, status } = await loadPaperForTeacher(user.id, paperId, await isAdminUser())
  if (error) return NextResponse.json({ error }, { status: status || 400 })

  const outline = course?.mock_source_course_id ? await loadSourceOutline(course.mock_source_course_id) : null

  const { data: links } = await supabaseAdmin('mock_paper_questions', {
    query: `?paper_id=eq.${paperId}&order=sort_order&select=question_id,sort_order`,
  })
  const questionIds = (links || []).map((l: any) => l.question_id)

  let questions: any[] = []
  if (questionIds.length) {
    const { data: qs } = await supabaseAdmin('questions', {
      query: `?id=in.(${questionIds.join(',')})&select=id,stem,explanation,image_url,difficulty,lesson_id,is_ai_generated,answer_type,answer_text,group_ref`,
    })
    const { data: opts } = await supabaseAdmin('question_options', {
      query: `?question_id=in.(${questionIds.join(',')})&order=display_order&select=id,question_id,content,is_correct`,
    })
    const byId = new Map((qs || []).map((q: any) => [q.id, q]))
    const refByLesson = new Map((outline?.lessons || []).map((l) => [l.lessonId, l]))
    questions = (links || []).map((l: any) => {
      const q: any = byId.get(l.question_id)
      if (!q) return null
      const ref = refByLesson.get(q.lesson_id)
      return {
        id: q.id,
        sortOrder: l.sort_order,
        stem: q.stem,
        groupRef: q.group_ref ?? null,
        explanation: q.explanation,
        imageUrl: q.image_url,
        answerType: q.answer_type ?? 'choice',
        answerText: q.answer_text ?? '',
        difficulty: q.difficulty,
        lessonId: q.lesson_id,
        lessonRef: ref?.ref ?? null,
        chapterTitle: ref?.chapterTitle ?? null,
        lessonTitle: ref?.lessonTitle ?? null,
        options: (opts || []).filter((o: any) => o.question_id === q.id).map((o: any) => ({ id: o.id, content: o.content, isCorrect: o.is_correct })),
      }
    }).filter(Boolean)
  }

  return NextResponse.json({
    paper: { id: paper!.id, title: paper!.title, mode: paper!.mode ?? 'choice', durationMinutes: paper!.duration_minutes, courseId: paper!.mock_course_id, isPublished: !!paper!.is_published },
    courseName: course?.name ?? '',
    sourceCourseName: outline?.courseName ?? null,
    questions,
  })
}

// PATCH { title?, durationMinutes? }
export async function PATCH(request: Request, { params }: { params: Promise<{ paperId: string }> }) {
  const { paperId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const { error, status } = await loadPaperForTeacher(user.id, paperId, await isAdminUser())
  if (error) return NextResponse.json({ error }, { status: status || 400 })

  const body = await request.json()
  const patch: any = { updated_at: new Date().toISOString() }
  if (typeof body.title === 'string' && body.title.trim()) patch.title = body.title.trim()
  if (body.durationMinutes !== undefined) patch.duration_minutes = Math.min(600, Math.max(1, Number(body.durationMinutes) || 60))
  // A paper starts unpublished; the teacher publishes it once the AI's questions
  // have been reviewed. Students only ever see published papers.
  if (typeof body.isPublished === 'boolean') patch.is_published = body.isPublished

  const { error: e } = await supabaseAdmin('mock_papers', { method: 'PATCH', body: patch, query: `?id=eq.${paperId}` })
  if (e) return NextResponse.json({ error: e.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// POST { add?: Question[], remove?: string[], order?: [{questionId, sortOrder}] }
// One mutation endpoint, so the client does not need three round trips.
export async function POST(request: Request, { params }: { params: Promise<{ paperId: string }> }) {
  const { paperId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const { paper, course, error, status } = await loadPaperForTeacher(user.id, paperId, await isAdminUser())
  if (error) return NextResponse.json({ error }, { status: status || 400 })

  const body = await request.json()
  const outline = course?.mock_source_course_id ? await loadSourceOutline(course.mock_source_course_id) : null
  const validLesson = new Set((outline?.lessons || []).map((l) => l.lessonId))

  // --- add
  const add: any[] = Array.isArray(body.add) ? body.add : []
  if (add.length) {
    const { data: last } = await supabaseAdmin('mock_paper_questions', {
      query: `?paper_id=eq.${paperId}&order=sort_order.desc&limit=1&select=sort_order`,
    })
    let next = ((last?.[0]?.sort_order ?? -1) as number) + 1
    const imageWarnings: string[] = []
    const paperMode: 'choice' | 'short' = (paper as any)?.mode === 'short' ? 'short' : 'choice'
    for (const q of add) {
      if (!q?.lessonId || !validLesson.has(q.lessonId)) {
        return NextResponse.json({ error: '新增的题必须指定所属章节/课时' }, { status: 400 })
      }
      if ((q?.answerType === 'short' ? 'short' : 'choice') !== paperMode) {
        return NextResponse.json({ error: '新增的题和这份试卷的题型不一致' }, { status: 400 })
      }
      let imageUrl: string | null = q.imageUrl?.trim?.() || null
      if (imageUrl && !isLocalImage(imageUrl)) {
        const got = await importRemoteImage(imageUrl)
        if (got.url) imageUrl = got.url
        else { imageWarnings.push(got.error || '取图失败'); imageUrl = null }
      }
      const isShort = paperMode === 'short'
      const { data: qRows } = await supabaseAdmin('questions', {
        method: 'POST',
        body: {
          lesson_id: q.lessonId,
          question_type: 'mock',
          answer_type: isShort ? 'short' : 'choice',
          answer_text: isShort ? (normaliseMineruText(q.answerText) || null) : null,
          group_ref: String(q.groupRef ?? '').trim() ? String(q.groupRef ?? "").trim() || null : null,
          difficulty: Math.min(5, Math.max(1, Number(q.difficulty) || 3)),
          stem: normaliseMineruText(q.stem),
          explanation: normaliseMineruText(q.explanation),
          image_url: imageUrl,
          is_approved: true,
          is_ai_generated: q.isAiGenerated !== false,
          created_by: user.id,
        },
        query: '?select=id',
      })
      const qid = qRows?.[0]?.id
      if (!qid) continue
      const opts = (Array.isArray(q.options) ? q.options : []).filter((o: any) => String(o?.content ?? '').trim())
      for (let k = 0; k < opts.length; k++) {
        await supabaseAdmin('question_options', {
          method: 'POST',
          body: { question_id: qid, content: String(opts[k].content).trim(), is_correct: opts[k].isCorrect === true, display_order: k },
        })
      }
      await supabaseAdmin('mock_paper_questions', {
        method: 'POST', body: { paper_id: paperId, question_id: qid, sort_order: next++ },
      })
    }
    if (imageWarnings.length) return NextResponse.json({ success: true, imageWarnings })
  }

  // --- order
  if (Array.isArray(body.order)) {
    for (const o of body.order) {
      if (!o?.questionId) continue
      await supabaseAdmin('mock_paper_questions', {
        method: 'PATCH', body: { sort_order: Number(o.sortOrder) || 0 },
        query: `?paper_id=eq.${paperId}&question_id=eq.${o.questionId}`,
      })
    }
  }

  // --- remove: deleting the question also drops its options (cascade) and its
  //     membership row. Any mock answer rows are cleared first — that FK has no
  //     cascade, same as the gate/boss answer tables.
  if (Array.isArray(body.remove) && body.remove.length) {
    for (const qid of body.remove) {
      await supabaseAdmin('mock_test_answers', { method: 'DELETE', query: `?question_id=eq.${qid}` })
      await supabaseAdmin('questions', { method: 'DELETE', query: `?id=eq.${qid}&question_type=eq.mock` })
    }
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ paperId: string }> }) {
  const { paperId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const { error, status } = await loadPaperForTeacher(user.id, paperId, await isAdminUser())
  if (error) return NextResponse.json({ error }, { status: status || 400 })

  // Delete the questions too — a mock question belongs to its paper and nothing
  // else, so leaving them behind would litter the lesson it points at.
  const { data: links } = await supabaseAdmin('mock_paper_questions', {
    query: `?paper_id=eq.${paperId}&select=question_id`,
  })
  for (const l of (links || []) as any[]) {
    await supabaseAdmin('mock_test_answers', { method: 'DELETE', query: `?question_id=eq.${l.question_id}` })
    await supabaseAdmin('questions', { method: 'DELETE', query: `?id=eq.${l.question_id}&question_type=eq.mock` })
  }
  await supabaseAdmin('mock_papers', { method: 'DELETE', query: `?id=eq.${paperId}` })
  return NextResponse.json({ success: true })
}
