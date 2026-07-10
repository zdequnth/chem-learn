import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/admin'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const { sourceChapterId, targetCourseId } = await request.json()
  if (!sourceChapterId || !targetCourseId) return NextResponse.json({ error: '缺少参数' }, { status: 400 })

  // Get source chapter
  const { data: srcCh } = await supabaseAdmin('chapters', {
    query: `?id=eq.${sourceChapterId}&select=*`,
  })
  const src = srcCh?.[0]
  if (!src) return NextResponse.json({ error: '源章节不存在' }, { status: 404 })

  // Get target course's max sort_order
  const { data: targetChs } = await supabaseAdmin('chapters', {
    query: `?course_id=eq.${targetCourseId}&select=sort_order&order=sort_order.desc&limit=1`,
  })
  const nextOrder = (targetChs?.[0]?.sort_order ?? -1) + 1

  // 1. Create new chapter
  const { data: newCh } = await supabaseAdmin('chapters', {
    method: 'POST',
    body: { course_id: targetCourseId, title: src.title, description: src.description, sort_order: nextOrder },
    query: '?select=id',
  })
  const newChapterId = (newCh as any)?.[0]?.id
  if (!newChapterId) return NextResponse.json({ error: '创建章节失败' }, { status: 500 })

  // 2. Get source lessons
  const { data: srcLessons } = await supabaseAdmin('lessons', {
    query: `?chapter_id=eq.${sourceChapterId}&order=sort_order&select=*`,
  })

  let lessonCopies = 0, kpCopies = 0, videoCopies = 0, questionCopies = 0
  const lessonIdMap = new Map<string, string>() // old → new

  for (const l of (srcLessons || [])) {
    // Copy lesson
    const { data: newL } = await supabaseAdmin('lessons', {
      method: 'POST',
      body: { chapter_id: newChapterId, title: l.title, description: l.description, sort_order: l.sort_order },
      query: '?select=id',
    })
    const newLessonId = (newL as any)?.[0]?.id
    if (!newLessonId) continue
    lessonIdMap.set(l.id, newLessonId)
    lessonCopies++

    // 3. Copy knowledge points + their video links
    const { data: kps } = await supabaseAdmin('knowledge_points', {
      query: `?lesson_id=eq.${l.id}&order=sort_order&select=*`,
    })
    const kpIdMap = new Map<string, string>()
    for (const kp of (kps || [])) {
      const { data: newKp } = await supabaseAdmin('knowledge_points', {
        method: 'POST',
        body: { lesson_id: newLessonId, title: kp.title, description: kp.description, sort_order: kp.sort_order },
        query: '?select=id',
      })
      const newKpId = (newKp as any)?.[0]?.id
      if (!newKpId) continue
      kpIdMap.set(kp.id, newKpId)
      kpCopies++

      // Copy video links for this KP
      const { data: vls } = await supabaseAdmin('video_links', {
        query: `?knowledge_point_id=eq.${kp.id}&select=title,url,platform,sort_order`,
      })
      for (const vl of (vls || [])) {
        await supabaseAdmin('video_links', {
          method: 'POST',
          body: { knowledge_point_id: newKpId, title: vl.title, url: vl.url, platform: vl.platform, sort_order: vl.sort_order },
        })
        videoCopies++
      }
    }

    // 4. Copy questions + options
    const { data: questions } = await supabaseAdmin('questions', {
      query: `?lesson_id=eq.${l.id}&select=*`,
    })
    for (const q of (questions || [])) {
      const targetKpId = q.knowledge_point_id ? (kpIdMap.get(q.knowledge_point_id) || null) : null
      const { data: newQ } = await supabaseAdmin('questions', {
        method: 'POST',
        body: {
          lesson_id: newLessonId,
          knowledge_point_id: targetKpId,
          question_type: q.question_type,
          difficulty: q.difficulty || 3,
          stem: q.stem,
          explanation: q.explanation || '',
          image_url: q.image_url,
          is_approved: q.is_approved,
          is_ai_generated: q.is_ai_generated,
        },
        query: '?select=id',
      })
      const newQId = (newQ as any)?.[0]?.id
      if (!newQId) continue
      questionCopies++

      // Copy options
      const { data: opts } = await supabaseAdmin('question_options', {
        query: `?question_id=eq.${q.id}&select=content,is_correct,display_order`,
      })
      for (const o of (opts || [])) {
        await supabaseAdmin('question_options', {
          method: 'POST',
          body: { question_id: newQId, content: o.content, is_correct: o.is_correct, display_order: o.display_order },
        })
      }
    }
  }

  return NextResponse.json({
    chapterId: newChapterId,
    lessons: lessonCopies, knowledgePoints: kpCopies, videoLinks: videoCopies, questions: questionCopies,
  })
}
