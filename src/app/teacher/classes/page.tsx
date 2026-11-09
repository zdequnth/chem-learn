'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/app/providers'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/Navbar'
import CourseBindings from '@/components/CourseBindings'
import type { Course } from '@/lib/types'
import { kindTheme } from '@/lib/course-kind'
import { Plus, Users, Copy, Loader2, Trash2 } from 'lucide-react'
import { useLang, t, tr } from '@/lib/i18n'

const KIND_SHORT: Record<string, { zh: string; en: string }> = {
  gate: { zh: '过关', en: 'Gate' },
  vocab: { zh: '背单词', en: 'Vocabulary' },
  mock: { zh: '模拟考', en: 'Mock Exam' },
}

interface ClassData {
  id: string
  name: string
  course_id: string | null
  invite_code: string
  student_count: number
}

export default function TeacherClassesPage() {
  const router = useRouter()
  const { user, profile, loading: authLoading } = useAuth()
  const supabase = createClient()
  const { lang } = useLang()

  const [classes, setClasses] = useState<ClassData[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [bindFor, setBindFor] = useState<{ id: string; name: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newCourse, setNewCourse] = useState('')

  useEffect(() => {
    if (!authLoading && (!user || (profile && profile.role !== 'teacher' && profile.role !== 'admin'))) {
      router.push('/dashboard')
    }
  }, [user, profile, authLoading, router])

  useEffect(() => {
    if (!profile) return
    fetchData()
    fetch('/api/courses').then(r => r.json()).then(json => setCourses((json.courses || []) as Course[]))
  }, [profile])

  const fetchData = async () => {
    const res = await fetch('/api/classes')
    const json = await res.json()
    if (json.classes) {
      setClasses(json.classes.map((c: any) => ({
        id: c.id, name: c.name, course_id: c.course_id,
        invite_code: c.invite_code, student_count: c.student_count || 0,
      })))
    }
    setLoading(false)
  }

  const handleCreate = async () => {
    if (!newName.trim()) return
    if (!newCourse) { alert(tr(lang, '请选择关联课程', 'Please select a course')); return }
    await fetch('/api/classes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), course_id: newCourse || null }),
    })
    setShowCreate(false)
    setNewName('')
    setNewCourse('')
    fetchData()
  }

  const handleDelete = async (id: string) => {
    if (!confirm(tr(lang, '确定删除此班级？', 'Delete this class?'))) return
    await fetch(`/api/classes?id=${id}`, { method: 'DELETE' })
    fetchData()
  }

  const copyInviteCode = (code: string) => {
    navigator.clipboard.writeText(code)
    alert(tr(lang, '邀请码已复制：', 'Invite code copied: ') + code)
  }

  if (authLoading || !profile) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 pt-24 pb-20">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold mb-1">{tr(lang, t('classes', lang) + '管理', 'Class Management')}</h1>
            <p className="text-sm text-muted-foreground">{tr(lang, '创建班级并分享邀请码给学生加入', 'Create classes and share invite codes with students')}</p>
          </div>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600 transition-colors">
            <Plus className="w-4 h-4" /> {tr(lang, '新建班级', 'New Class')}
          </button>
        </div>

        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
            <div className="bg-card rounded-2xl shadow-xl p-6 w-full max-w-md mx-4">
              <h2 className="text-lg font-semibold mb-4">{tr(lang, '新建班级', 'New Class')}</h2>
              <div className="space-y-3">
                <input value={newName} onChange={e => setNewName(e.target.value)} placeholder={tr(lang, '年份+年级+课程+班级，如 2026 G9 化学A-3班', 'Year + grade + course + class, e.g. 2026 G9 Chemistry A-3')}
                  className="w-full px-4 py-2.5 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" />
                <select value={newCourse} onChange={e => setNewCourse(e.target.value)}
                  className="w-full px-4 py-2.5 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500">
                  <option value="">{tr(lang, '选择课程（必选）', 'Select a course (required)')}</option>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="flex gap-3 mt-4">
                <button onClick={handleCreate} className="flex-1 py-2.5 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600">{tr(lang, '创建', 'Create')}</button>
                <button onClick={() => setShowCreate(false)} className="flex-1 py-2.5 bg-accent rounded-lg font-medium">{tr(lang, '取消', 'Cancel')}</button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>
        ) : classes.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <Users className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <h2 className="text-xl font-semibold mb-2">{tr(lang, '还没有班级', 'No classes yet')}</h2>
            <p>{tr(lang, '点击上方按钮创建第一个班级', 'Click the button above to create your first class')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {classes.map(cls => {
              // A class takes the colour of the course it belongs to, so a
              // vocabulary or mock class never looks like a gate-test one.
              const course = courses.find(c => c.id === cls.course_id)
              const theme = kindTheme(course?.kind)
              const k = course?.kind ?? 'gate'
              return (
                <Link key={cls.id} href={`/teacher/classes/${cls.id}`}
                  className={`rounded-xl border p-5 block hover:shadow-md transition-all ${
                    k === 'gate' ? 'bg-card border-gray-200 hover:border-emerald-300' : theme.banner}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-lg flex items-center gap-2">
                        {k !== 'gate' && <span>{theme.emoji}</span>}
                        {cls.name}
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${theme.pill}`}>
                          {tr(lang, KIND_SHORT[k]?.zh ?? '过关', KIND_SHORT[k]?.en ?? 'Gate')}
                        </span>
                        {course && (
                          <span className={`text-xs font-normal ${k !== 'gate' ? theme.text : 'text-muted-foreground'}`}>
                            {course.name}
                          </span>
                        )}
                      </h3>
                      <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1"><Users className="w-4 h-4" /> {tr(lang, `${cls.student_count} 名学生`, `${cls.student_count} students`)}</span>
                        <span onClick={e => { e.preventDefault(); copyInviteCode(cls.invite_code) }}
                          className="flex items-center gap-1 text-blue-600 hover:text-blue-700 cursor-pointer">
                          <Copy className="w-3.5 h-3.5" /> {tr(lang, '邀请码:', 'Invite code:')} {cls.invite_code}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={e => { e.preventDefault(); setBindFor({ id: cls.id, name: cls.name }) }}
                        className="px-3 py-1.5 text-xs rounded-lg border font-medium hover:bg-accent transition-colors">
                        {tr(lang, '绑定课程', 'Bind Course')}
                      </button>
                      <button onClick={e => { e.preventDefault(); handleDelete(cls.id) }}
                        className="p-2 hover:bg-red-50 rounded-lg text-red-400 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </main>

      {/* Course bindings: one course per kind. The gate course is locked once set
          (student progress hangs off its lessons); the other two can be swapped. */}
      {bindFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="bg-card rounded-2xl shadow-xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-1">{tr(lang, '绑定课程', 'Bind Course')}</h2>
            <p className="text-sm text-muted-foreground mb-4">{bindFor.name}</p>

            <CourseBindings classId={bindFor.id} />

            <div className="flex justify-end mt-5">
              <button onClick={() => setBindFor(null)} className="px-4 py-2 border rounded-lg text-sm hover:bg-accent transition-colors">{tr(lang, '关闭', 'Close')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
