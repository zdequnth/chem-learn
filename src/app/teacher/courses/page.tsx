'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/app/providers'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/Navbar'
import type { Course, CourseKind } from '@/lib/types'
import { COURSE_KINDS } from '@/lib/types'
import { KIND_THEME, kindTheme } from '@/lib/course-kind'
import { Plus, Edit3, Loader2, ArrowLeft, FileText } from 'lucide-react'
import { useLang, t, tr } from '@/lib/i18n'

const KIND_TEXT: Record<CourseKind, { zh: string; en: string; zhBlurb: string; enBlurb: string }> = {
  gate: {
    zh: '过关课程', en: 'Gate Course',
    zhBlurb: '上新课时用：一章节、一课时地过关',
    enBlurb: 'For new material: pass chapter by chapter, lesson by lesson',
  },
  vocab: {
    zh: '背单词课程', en: 'Vocabulary Course',
    zhBlurb: '按课时背专业词汇，卡片 + 发音 + 测验',
    enBlurb: 'Learn subject vocabulary by lesson with cards, audio, and quizzes',
  },
  mock: {
    zh: '模拟考课程', en: 'Mock Exam Course',
    zhBlurb: '考前一两个月冲刺：限时做完整套题',
    enBlurb: 'Exam-season sprint: full papers under time limits',
  },
}

export default function TeacherCoursesPage() {
  const router = useRouter()
  const { user, profile, loading: authLoading } = useAuth()
  const supabase = createClient()
  const { lang } = useLang()

  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newCourse, setNewCourse] = useState({
    name: '', description: '', grade_level: '', icon: '🧪', subject: 'Chemistry',
    kind: 'gate' as CourseKind, mock_source_course_id: '',
  })

  useEffect(() => {
    if (!authLoading && (!user || (profile && profile.role !== 'teacher' && profile.role !== 'admin'))) {
      router.push('/dashboard')
    }
  }, [user, profile, authLoading, router])

  useEffect(() => {
    if (!profile) return
    fetchCourses()
  }, [profile])

  const fetchCourses = async () => {
    let done = false
    setTimeout(() => { if (!done) { setLoading(false); done = true } }, 5000)
    try {
      const res = await fetch('/api/courses')
      const json = await res.json()
      if (!done && json.courses) setCourses(json.courses as Course[])
      if (!done && json.error) console.error(json.error)
    } catch (e) {
      console.error(e)
    } finally {
      if (!done) { setLoading(false); done = true }
    }
  }

  const handleCreate = async () => {
    if (!newCourse.name.trim()) return
    if (newCourse.kind === 'mock' && !newCourse.mock_source_course_id) {
      alert(tr(lang, '模拟考课程必须选择绑定的通关课程', 'A mock exam course must be linked to a gate course.'))
      return
    }
    try {
      const res = await fetch('/api/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCourse.name.trim(),
          description: newCourse.description.trim(),
          grade_level: newCourse.grade_level.trim(),
          icon: newCourse.icon || KIND_THEME[newCourse.kind].emoji,
          subject: newCourse.subject,
          kind: newCourse.kind,
          mock_source_course_id: newCourse.kind === 'mock' ? newCourse.mock_source_course_id : null,
          sort_order: courses.length,
        }),
      })
      const json = await res.json()
      if (json.error) {
        alert(tr(lang, '创建失败: ', 'Create failed: ') + json.error)
      } else {
        setShowCreate(false)
        setNewCourse({ name: '', description: '', grade_level: '', icon: '🧪', subject: 'Chemistry', kind: 'gate', mock_source_course_id: '' })
        fetchCourses()
      }
    } catch (e: any) {
      alert(tr(lang, '创建出错: ', 'Create error: ') + (e?.message || tr(lang, '未知错误', 'Unknown error')))
    }
  }

  // Only gate courses can be the source of a mock course's papers.
  const gateCourses = courses.filter(c => (c.kind ?? 'gate') === 'gate')

  const handleDelete = async (id: string) => {
    const course = courses.find(c => c.id === id)
    const extra = course?.kind === 'mock'
      ? tr(lang, '\n\n注意：这门课绑定的通关课程不会被删除。', '\n\nNote: the gate course linked to this course will not be deleted.')
      : course?.kind === 'gate'
        ? tr(lang, '\n\n⚠️ 若有模拟考课程绑定到这门课，那些模拟考的题目会一起消失、试卷变空。', '\n\n⚠️ If any mock exam courses are linked to this course, their questions will disappear and those papers will become empty.')
        : ''
    if (!confirm(tr(lang,
      `确定要删除这门课程吗？所有章节、课时和题目将被永久删除。${extra}`,
      `Delete this course? All chapters, lessons, and questions will be permanently deleted.${extra}`))) return
    await fetch(`/api/courses?id=${id}`, { method: 'DELETE' })
    fetchCourses()
  }

  const handleTogglePublish = async (course: Course) => {
    await fetch(`/api/courses/${course.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_published: !course.is_published }),
    })
    fetchCourses()
  }

  // A course's kind is fixed when it is created — the kinds behave so
  // differently that switching after the fact only causes confusion.

  if (authLoading || !profile) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 pt-24 pb-20">
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link href="/dashboard" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-2 transition-colors">
              <ArrowLeft className="w-4 h-4" /> {lang === 'zh' ? '返回仪表盘' : 'Back to Dashboard'}
            </Link>
            <h1 className="text-2xl font-bold">{t('courseMgmt', lang)}</h1>
          </div>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-lg font-medium hover:from-emerald-600 hover:to-emerald-700 transition-colors">
            <Plus className="w-4 h-4" /> {t('newCourse', lang)}
          </button>
        </div>

        {/* Create dialog */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
            <div className="bg-card rounded-2xl shadow-xl p-6 w-full max-w-md mx-4">
              <h2 className="text-lg font-semibold mb-4">{t('newCourse', lang)}</h2>
              <div className="space-y-3">
                <div>
                  <div className="text-xs text-muted-foreground mb-1.5">
                    {lang === 'zh' ? '课程类型（创建后不可更改）' : 'Course type (fixed after creation)'}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {COURSE_KINDS.map(k => (
                      <button key={k} type="button" onClick={() => setNewCourse({ ...newCourse, kind: k })}
                        className={`py-2.5 rounded-lg border text-xs font-medium transition-colors ${
                          newCourse.kind === k ? KIND_THEME[k].solid : 'hover:bg-accent'}`}>
                        {KIND_THEME[k].emoji} {tr(lang, KIND_TEXT[k].zh, KIND_TEXT[k].en)}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5">
                    {tr(lang, KIND_TEXT[newCourse.kind].zhBlurb, KIND_TEXT[newCourse.kind].enBlurb)}
                    {newCourse.kind === 'mock' && tr(lang, '（题目来自绑定的通关课程，交卷后才看分数）', ' (Questions come from the linked gate course; scores are shown after submission)')}
                  </p>
                  {newCourse.kind === 'mock' && (
                    <div className="mt-2">
                      <select value={newCourse.mock_source_course_id}
                        onChange={e => setNewCourse({ ...newCourse, mock_source_course_id: e.target.value })}
                        className="w-full px-3 py-2.5 border rounded-lg outline-none focus:ring-2 focus:ring-violet-500 text-sm">
                        <option value="">{tr(lang, '选择绑定的通关课程…', 'Select a gate course…')}</option>
                        {gateCourses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <p className="text-xs text-muted-foreground mt-1">
                        {gateCourses.length === 0
                          ? tr(lang, '你还没有过关课程，先建一门再来绑定。', 'You have no gate course yet. Create one first.')
                          : tr(lang, '试卷里每道题都会对应到这门课的某个章节和课时。', 'Each paper question maps to a chapter and lesson of this course.')}
                      </p>
                    </div>
                  )}
                </div>
                <select value={newCourse.subject} onChange={e => setNewCourse({ ...newCourse, subject: e.target.value })}
                  className="w-full px-4 py-2.5 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500">
                  {[{k:'Chinese',n:tr(lang,'语文 📖','Chinese 📖')},{k:'Math',n:tr(lang,'数学 📐','Math 📐')},{k:'English',n:tr(lang,'英语 🌍','English 🌍')},{k:'Second foreign Language',n:tr(lang,'二外 🗣️','2nd Lang 🗣️')},{k:'Physics',n:tr(lang,'物理 ⚛️','Physics ⚛️')},{k:'Chemistry',n:tr(lang,'化学 🧪','Chemistry 🧪')},{k:'Biology',n:tr(lang,'生物 🧬','Biology 🧬')},{k:'Humanities',n:tr(lang,'人文 📜','Humanities 📜')}].map(s => <option key={s.k} value={s.k}>{s.n}</option>)}
                </select>
                <input value={newCourse.name} onChange={e => setNewCourse({ ...newCourse, name: e.target.value })}
                  placeholder={t('courseName', lang)} className="w-full px-4 py-2.5 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" />
                <input value={newCourse.grade_level} onChange={e => setNewCourse({ ...newCourse, grade_level: e.target.value })}
                  placeholder={t('gradeLevel', lang)} className="w-full px-4 py-2.5 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" />
                <textarea value={newCourse.description} onChange={e => setNewCourse({ ...newCourse, description: e.target.value })}
                  placeholder={t('courseDesc', lang)} rows={3} className="w-full px-4 py-2.5 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 resize-none" />
              </div>
              <div className="flex gap-3 mt-4">
                <button onClick={handleCreate} className="flex-1 py-2.5 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600 transition-colors">{t('add', lang)}</button>
                <button onClick={() => setShowCreate(false)} className="flex-1 py-2.5 bg-accent rounded-lg font-medium hover:bg-gray-200 transition-colors">{t('cancel', lang)}</button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>
        ) : courses.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">📭</div>
            <h2 className="text-xl font-semibold mb-2">{t('noCourses', lang)}</h2>
            <p className="text-muted-foreground mb-4">{t('noCoursesHint', lang)}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {courses.map(course => {
              const theme = kindTheme(course.kind)
              return (
              <div key={course.id} className="bg-card rounded-xl border p-5 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0 ${theme.iconTile}`}>
                    {course.kind && course.kind !== 'gate' ? theme.emoji : (course.icon || '🧪')}
                  </div>
                  <div>
                    <h3 className="font-semibold">{(course.kind ?? 'gate') !== 'gate' ? `${theme.emoji} ${course.name}` : course.name}</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      {course.grade_level && <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full">{course.grade_level}</span>}
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${theme.pill}`}>{tr(lang, KIND_TEXT[course.kind ?? 'gate'].zh, KIND_TEXT[course.kind ?? 'gate'].en)}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${course.is_published ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                        {course.is_published ? tr(lang, '已发布', 'Published') : tr(lang, '未发布', 'Unpublished')}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => handleTogglePublish(course)}
                    className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${course.is_published ? 'bg-amber-50 text-amber-600 hover:bg-amber-100' : 'bg-green-50 text-green-600 hover:bg-green-100'}`}>
                    {course.is_published ? tr(lang, '取消发布', 'Unpublish') : tr(lang, '发布', 'Publish')}
                  </button>
                  {/* Each kind needs both its own content editor and the main
                      editor (so collaborators and, for vocab, the chapter list
                      stay reachable). */}
                  {course.kind === 'vocab' && (
                    <Link href={`/teacher/vocab?course=${course.id}`}
                      className={`flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${theme.button}`}>
                      {tr(lang, '📖 词库', '📖 Vocabulary')}
                    </Link>
                  )}
                  {course.kind === 'mock' && (
                    <Link href={`/teacher/mock?course=${course.id}`}
                      className={`flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${theme.button}`}>
                      <FileText className="w-3 h-3" /> {tr(lang, '试卷', 'Papers')}
                    </Link>
                  )}
                  <Link href={`/teacher/courses/${course.id}`}
                    className={`flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${theme.button}`}>
                    <Edit3 className="w-3 h-3" /> {tr(lang, '编辑', 'Edit')}
                  </Link>
                  <button onClick={() => handleDelete(course.id)}
                    className="px-3 py-1.5 text-xs bg-red-50 text-red-600 rounded-lg font-medium hover:bg-red-100 transition-colors">
                    {tr(lang, '删除', 'Delete')}
                  </button>
                </div>
              </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
