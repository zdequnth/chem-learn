'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/app/providers'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/Navbar'
import type { Course } from '@/lib/types'
import { kindTheme } from '@/lib/course-kind'
import { Plus, Users, Copy, Loader2, Trash2 } from 'lucide-react'
import { useLang, t } from '@/lib/i18n'

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
  const [bindings, setBindings] = useState<{ id: string; kind: string; courseId: string; courseName: string }[] | null>(null)
  const [bindPick, setBindPick] = useState<Record<string, string>>({})
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
    if (!newCourse) { alert('请选择关联课程'); return }
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
    if (!confirm('确定删除此班级？')) return
    await fetch(`/api/classes?id=${id}`, { method: 'DELETE' })
    fetchData()
  }

  const copyInviteCode = (code: string) => {
    navigator.clipboard.writeText(code)
    alert('邀请码已复制：' + code)
  }

  // ── course bindings: one course per kind
  const openBind = async (classId: string, className: string) => {
    setBindFor({ id: classId, name: className })
    setBindings(null)
    const j = await fetch(`/api/class-courses?classId=${classId}`).then(r => r.json()).catch(() => ({}))
    setBindings(j.bindings || [])
  }

  const bindCourse = async (kind: string) => {
    const courseId = bindPick[kind]
    if (!courseId) return
    const bound = (bindings || []).find(b => b.kind === kind)
    if (bound && kind !== 'gate') {
      if (!confirm(`这个班已经绑定了「${bound.courseName}」，换成新的？\n（学生的词汇进度按词记、模拟考成绩按卷子记，都不受影响）`)) return
    }
    const r = await fetch('/api/class-courses', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ classId: bindFor!.id, courseId }),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok || j.error) return alert('绑定失败：' + (j.error || r.status))
    setBindPick(p => ({ ...p, [kind]: '' }))
    openBind(bindFor!.id, bindFor!.name)
  }

  const unbindCourse = async (kind: string, name: string) => {
    if (!confirm(`解除与「${name}」的绑定？`)) return
    const r = await fetch(`/api/class-courses?classId=${bindFor!.id}&kind=${kind}`, { method: 'DELETE' })
    const j = await r.json().catch(() => ({}))
    if (!r.ok || j.error) return alert('解除失败：' + (j.error || r.status))
    openBind(bindFor!.id, bindFor!.name)
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
            <h1 className="text-2xl font-bold mb-1">{t('classes', lang) + (lang==='zh'?'管理':'')}</h1>
            <p className="text-sm text-muted-foreground">{lang==='zh'?'创建班级并分享邀请码给学生加入':'Create classes and share invite codes with students'}</p>
          </div>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600 transition-colors">
            <Plus className="w-4 h-4" /> {lang==='zh'?'新建班级':'New Class'}
          </button>
        </div>

        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowCreate(false)}>
            <div className="bg-card rounded-2xl shadow-xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
              <h2 className="text-lg font-semibold mb-4">新建班级</h2>
              <div className="space-y-3">
                <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="年份+年级+课程+班级，如 2026 G9 化学A-3班"
                  className="w-full px-4 py-2.5 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" />
                <select value={newCourse} onChange={e => setNewCourse(e.target.value)}
                  className="w-full px-4 py-2.5 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500">
                  <option value="">选择课程（必选）</option>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="flex gap-3 mt-4">
                <button onClick={handleCreate} className="flex-1 py-2.5 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600">创建</button>
                <button onClick={() => setShowCreate(false)} className="flex-1 py-2.5 bg-accent rounded-lg font-medium">取消</button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>
        ) : classes.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <Users className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <h2 className="text-xl font-semibold mb-2">还没有班级</h2>
            <p>点击上方按钮创建第一个班级</p>
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
                          {theme.label.replace('课程', '')}
                        </span>
                        {course && (
                          <span className={`text-xs font-normal ${k !== 'gate' ? theme.text : 'text-muted-foreground'}`}>
                            {course.name}
                          </span>
                        )}
                      </h3>
                      <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1"><Users className="w-4 h-4" /> {cls.student_count} 名学生</span>
                        <span onClick={e => { e.preventDefault(); copyInviteCode(cls.invite_code) }}
                          className="flex items-center gap-1 text-blue-600 hover:text-blue-700 cursor-pointer">
                          <Copy className="w-3.5 h-3.5" /> 邀请码: {cls.invite_code}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={e => { e.preventDefault(); openBind(cls.id, cls.name) }}
                        className="px-3 py-1.5 text-xs rounded-lg border font-medium hover:bg-accent transition-colors">
                        绑定课程
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setBindFor(null)}>
          <div className="bg-card rounded-2xl shadow-xl p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-1">绑定课程</h2>
            <p className="text-sm text-muted-foreground mb-4">{bindFor.name}</p>

            {!bindings ? (
              <div className="py-10 text-center"><Loader2 className="w-6 h-6 animate-spin inline text-gray-400" /></div>
            ) : (
              <div className="space-y-4">
                {([
                  ['gate', '🧪 通关课程', '决定这个班的进度条算哪门课；绑定后不可更改'],
                  ['vocab', '📖 背单词课程', '可选；绑上后学生首页会多一张卡片'],
                  ['mock', '📝 模拟考课程', '可选；绑上后学生首页会多一张卡片'],
                ] as const).map(([kind, label, hint]) => {
                  const bound = bindings.find(b => b.kind === kind)
                  const options = courses.filter(c => (c.kind ?? 'gate') === kind)
                  return (
                    <div key={kind} className="border rounded-xl p-3">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className="text-sm font-medium">{label}</span>
                        {bound ? (
                          <>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">{bound.courseName}</span>
                            {kind === 'gate'
                              ? <span className="text-xs text-muted-foreground">已锁定</span>
                              : <button onClick={() => unbindCourse(kind, bound.courseName)}
                                  className="text-xs text-red-500 hover:underline">解除</button>}
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">未绑定</span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <select value={bindPick[kind] || ''} onChange={e => setBindPick(p => ({ ...p, [kind]: e.target.value }))}
                          className="flex-1 px-3 py-2 border rounded-lg bg-background text-sm">
                          <option value="">{bound ? '换成…' : '选择课程…'}</option>
                          {options.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <button onClick={() => bindCourse(kind)} disabled={!bindPick[kind]}
                          className="px-3 py-2 rounded-lg text-sm font-medium text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40">
                          {bound ? '更换' : '绑定'}
                        </button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1.5">
                        {hint}
                        {options.length === 0 && ` · 你还没有${label.slice(2)}`}
                      </p>
                    </div>
                  )
                })}
                <p className="text-xs text-muted-foreground">
                  一类课程只能绑一个。背单词 / 模拟考课程也可以不绑，直接「发布」那门课就对学生可见。
                </p>
              </div>
            )}

            <div className="flex justify-end mt-5">
              <button onClick={() => setBindFor(null)} className="px-4 py-2 border rounded-lg text-sm hover:bg-accent transition-colors">关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
