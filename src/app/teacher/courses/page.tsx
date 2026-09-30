'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/app/providers'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/Navbar'
import type { Course } from '@/lib/types'
import { Plus, Edit3, Loader2, ArrowLeft } from 'lucide-react'
import { useLang, t } from '@/lib/i18n'

export default function TeacherCoursesPage() {
  const router = useRouter()
  const { user, profile, loading: authLoading } = useAuth()
  const supabase = createClient()
  const { lang } = useLang()

  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newCourse, setNewCourse] = useState({ name: '', description: '', grade_level: '', icon: '🧪', subject: 'Chemistry', kind: 'gate' })

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
    try {
      const res = await fetch('/api/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCourse.name.trim(),
          description: newCourse.description.trim(),
          grade_level: newCourse.grade_level.trim(),
          icon: newCourse.icon || '🧪',
          subject: newCourse.subject,
          kind: newCourse.kind,
          sort_order: courses.length,
        }),
      })
      const json = await res.json()
      if (json.error) {
        alert('创建失败: ' + json.error)
      } else {
        setShowCreate(false)
        setNewCourse({ name: '', description: '', grade_level: '', icon: '🧪', subject: 'Chemistry', kind: 'gate' })
        fetchCourses()
      }
    } catch (e: any) {
      alert('创建出错: ' + (e?.message || '未知错误'))
    }
  }

  const handleTogglePublish = async (course: Course) => {
    await fetch(`/api/courses/${course.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_published: !course.is_published }),
    })
    fetchCourses()
  }

  // A course's kind is fixed when it is created — the two kinds behave so
  // differently that switching after the fact only causes confusion.

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这门课程吗？所有章节、课时和题目将被永久删除。')) return
    await fetch(`/api/courses?id=${id}`, { method: 'DELETE' })
    fetchCourses()
  }

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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowCreate(false)}>
            <div className="bg-card rounded-2xl shadow-xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
              <h2 className="text-lg font-semibold mb-4">{t('newCourse', lang)}</h2>
              <div className="space-y-3">
                <div>
                  <div className="text-xs text-muted-foreground mb-1.5">
                    {lang === 'zh' ? '课程类型（创建后不可更改）' : 'Course type (fixed after creation)'}
                  </div>
                  <div className="flex gap-2">
                    {([['gate', '📚 过关课程'], ['vocab', '📖 背单词课程']] as const).map(([k, label]) => (
                      <button key={k} type="button" onClick={() => setNewCourse({ ...newCourse, kind: k })}
                        className={`flex-1 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                          newCourse.kind === k
                            ? (k === 'vocab' ? 'bg-amber-500 border-amber-500 text-white' : 'bg-emerald-500 border-emerald-500 text-white')
                            : 'hover:bg-accent'}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5">
                    {newCourse.kind === 'vocab'
                      ? (lang === 'zh' ? '学生点进这门课会直接进入背单词，不显示关卡测试。' : 'Students go straight to the word list; no gate tests.')
                      : (lang === 'zh' ? '正常的章节 → 课时 → 关卡测试。' : 'Normal chapters → lessons → gate tests.')}
                  </p>
                </div>
                <select value={newCourse.subject} onChange={e => setNewCourse({ ...newCourse, subject: e.target.value })}
                  className="w-full px-4 py-2.5 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500">
                  {[{k:'Chinese',n:lang==='zh'?'语文 📖':'Chinese 📖'},{k:'Math',n:lang==='zh'?'数学 📐':'Math 📐'},{k:'English',n:lang==='zh'?'英语 🌍':'English 🌍'},{k:'Second foreign Language',n:lang==='zh'?'二外 🗣️':'2nd Lang 🗣️'},{k:'Physics',n:lang==='zh'?'物理 ⚛️':'Physics ⚛️'},{k:'Chemistry',n:lang==='zh'?'化学 🧪':'Chemistry 🧪'},{k:'Biology',n:lang==='zh'?'生物 🧬':'Biology 🧬'},{k:'Humanities',n:lang==='zh'?'人文 📜':'Humanities 📜'}].map(s => <option key={s.k} value={s.k}>{s.n}</option>)}
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
            {courses.map(course => (
              <div key={course.id} className="bg-card rounded-xl border p-5 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0 ${(course as any).kind === 'vocab' ? 'bg-gradient-to-br from-amber-100 to-amber-200' : 'bg-gradient-to-br from-emerald-100 to-emerald-200'}`}>
                    {(course as any).kind === 'vocab' ? '📖' : (course.icon || '🧪')}
                  </div>
                  <div>
                    <h3 className="font-semibold">{(course as any).kind === 'vocab' ? `📖 ${course.name}` : course.name}</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      {course.grade_level && <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full">{course.grade_level}</span>}
                      {(course as any).kind === 'vocab'
                        ? <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">背单词课程</span>
                        : <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">过关课程</span>}
                      <span className={`text-xs px-2 py-0.5 rounded-full ${course.is_published ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                        {course.is_published ? '已发布' : '未发布'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => handleTogglePublish(course)}
                    className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${course.is_published ? 'bg-amber-50 text-amber-600 hover:bg-amber-100' : 'bg-green-50 text-green-600 hover:bg-green-100'}`}>
                    {course.is_published ? '取消发布' : '发布'}
                  </button>
                  {/* A vocabulary course needs both: the chapter/lesson editor
                      and its word bank. */}
                  {(course as any).kind === 'vocab' && (
                    <Link href={`/teacher/vocab?course=${course.id}`}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs bg-amber-50 text-amber-700 rounded-lg font-medium hover:bg-amber-100 transition-colors">
                      📖 词库
                    </Link>
                  )}
                  <Link href={`/teacher/courses/${course.id}`}
                    className={`flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${(course as any).kind === 'vocab'
                      ? 'bg-amber-50 text-amber-700 hover:bg-amber-100' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}>
                    <Edit3 className="w-3 h-3" /> 编辑
                  </Link>
                  <button onClick={() => handleDelete(course.id)}
                    className="px-3 py-1.5 text-xs bg-red-50 text-red-600 rounded-lg font-medium hover:bg-red-100 transition-colors">
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
