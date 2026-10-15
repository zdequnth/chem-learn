// Writing a paper's questions to the database. Shared by "create a paper" and
// "save back over the same paper" — those two must not drift apart, or a paper
// built one way and edited the other would end up subtly different.
import { supabaseAdmin } from '@/lib/admin'
import { normaliseMineruText } from '@/lib/mineru-text'
import { importRemoteImage, isLocalImage } from '@/lib/storage'

/** Every lesson id belonging to the gate course a mock course is bound to. */
export async function loadValidLessonIds(sourceCourseId: string): Promise<Set<string>> {
  const { data: chapters } = await supabaseAdmin('chapters', {
    query: `?course_id=eq.${sourceCourseId}&select=id`,
  })
  const chIds = (chapters || []).map((c: any) => c.id)
  if (chIds.length === 0) return new Set()
  const { data: lessons } = await supabaseAdmin('lessons', {
    query: `?chapter_id=in.(${chIds.join(',')})&select=id`,
  })
  return new Set((lessons || []).map((l: any) => l.id))
}

/**
 * Everything that must hold before a batch of questions may be written.
 * Returns a message for the teacher, or null when it is fine.
 */
export function validatePaperQuestions(list: any[], mode: 'choice' | 'short', validLesson: Set<string>): string | null {
  const bad = list.findIndex((q) => !q?.lessonId || !validLesson.has(q.lessonId))
  if (bad >= 0) {
    return `第 ${bad + 1} 题没有指定所属章节/课时（或指定的课时不属于这门课的绑定课程）`
  }
  // The paper's mode wins over each question's own answerType — a short paper
  // must not smuggle in a choice question, or the student page renders neither.
  const mismatched = list.findIndex((q) => (q?.answerType === 'short' ? 'short' : 'choice') !== mode)
  if (mismatched >= 0) {
    return `第 ${mismatched + 1} 题的题型和这份试卷不一致（这份是${mode === 'short' ? '简答题' : '选择题'}卷）`
  }
  if (mode === 'short') {
    const noRef = list.findIndex((q) => !String(q?.answerText ?? '').trim())
    if (noRef >= 0) return `第 ${noRef + 1} 题是简答题但没填参考答案，AI 无法判分`
  }
  return null
}

/** Create the question rows and link them to the paper, in order. */
export async function createPaperQuestions(
  paperId: string,
  list: any[],
  mode: 'choice' | 'short',
  userId: string,
): Promise<{ saved: number; imageWarnings: string[] }> {
  const imageWarnings: string[] = []
  let saved = 0

  for (let i = 0; i < list.length; i++) {
    const q = list[i]

    // Pull any third-party image (e.g. a PDF parser's CDN link) into our own
    // storage, otherwise it shows for the teacher but breaks for students.
    const images: string[] = []
    for (const raw of (Array.isArray(q.images) ? q.images : [])) {
      const url = String(raw ?? '').trim()
      if (!url) continue
      if (isLocalImage(url)) { images.push(url); continue }
      const got = await importRemoteImage(url)
      if (got.url) images.push(got.url)
      else imageWarnings.push(`第 ${i + 1} 题配图未能入库（${got.error}）`)
    }

    const isShort = mode === 'short'
    const { data: qRows, error: qErr } = await supabaseAdmin('questions', {
      method: 'POST',
      body: {
        lesson_id: q.lessonId,
        question_type: 'mock',
        answer_type: isShort ? 'short' : 'choice',
        answer_text: isShort ? (normaliseMineruText(q.answerText) || null) : null,
        // The shared stem of a multi-part question. Consecutive questions with
        // the same one render as a group (1a, 1b, …).
        group_ref: String(q.groupRef ?? '').trim() || null,
        difficulty: Math.min(5, Math.max(1, Number(q.difficulty) || 3)),
        // Stored normalised, so MinerU's <eq>/<table> markup never reaches the
        // database, the grading prompt or the renderer.
        stem: normaliseMineruText(q.stem),
        explanation: normaliseMineruText(q.explanation),
        image_urls: images.length ? images : null,
        is_approved: true,
        is_ai_generated: q.isAiGenerated !== false,
        created_by: userId,
      },
      query: '?select=id',
    })
    const questionId = qRows?.[0]?.id
    if (qErr || !questionId) continue

    const opts = (Array.isArray(q.options) ? q.options : []).filter((o: any) => String(o?.content ?? '').trim())
    for (let k = 0; k < opts.length; k++) {
      await supabaseAdmin('question_options', {
        method: 'POST',
        body: { question_id: questionId, content: String(opts[k].content).trim(), is_correct: opts[k].isCorrect === true, display_order: k },
      })
    }
    await supabaseAdmin('mock_paper_questions', {
      method: 'POST',
      body: { paper_id: paperId, question_id: questionId, sort_order: i },
    })
    saved++
  }

  return { saved, imageWarnings }
}

/** Drop every question the paper currently holds, plus their options and links. */
export async function clearPaperQuestions(paperId: string): Promise<void> {
  const { data: links } = await supabaseAdmin('mock_paper_questions', {
    query: `?paper_id=eq.${paperId}&select=question_id`,
  })
  const ids = (links || []).map((l: any) => l.question_id).filter(Boolean)
  if (ids.length) {
    // Only mock questions, and only ones nobody has answered — the caller checks
    // for sessions before getting here.
    await supabaseAdmin('question_options', { method: 'DELETE', query: `?question_id=in.(${ids.join(',')})` })
    await supabaseAdmin('mock_test_answers', { method: 'DELETE', query: `?question_id=in.(${ids.join(',')})` })
    await supabaseAdmin('questions', { method: 'DELETE', query: `?id=in.(${ids.join(',')})&question_type=eq.mock` })
  }
  await supabaseAdmin('mock_paper_questions', { method: 'DELETE', query: `?paper_id=eq.${paperId}` })
}

/** How many exam sessions this paper has, submitted or still running. */
export async function countPaperSessions(paperId: string): Promise<number> {
  const { data } = await supabaseAdmin('mock_test_sessions', {
    query: `?paper_id=eq.${paperId}&select=id&limit=1000`,
  })
  return (data || []).length
}
