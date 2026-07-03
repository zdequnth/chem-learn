'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/app/providers'
import Navbar from '@/components/Navbar'
import { ArrowLeft, Loader2, Edit3, Save, X, Users } from 'lucide-react'

interface StudentProgress {
  id: string
  display_name: string
  totalPassed: number
  totalLessons: number
  percent: number
  chapterProgress: { chapterId: string; chapterTitle: string; total: number; passed: number; percent: number }[]
}

interface ClassDetail {
  id: string
  name: string
  invite_code: string
  message: string | null
  teacher_id: string
  course_id: string | null
}

export default function ClassDetailPage() {
  const { classId } = useParams<{ classId: string }>()
  const router = useRouter()
  const { user, profile, loading: authLoading } = useAuth()

  const [cls, setCls] = useState<ClassDetail | null>(null)
  const [students, setStudents] = useState<StudentProgress[]>([])
  const [isOwner, setIsOwner] = useState(false)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editMessage, setEditMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<'name' | 'progress'>('name')

  useEffect(() => {
    if (!authLoading && (!user || (profile && profile.role !== 'teacher' && profile.role !== 'admin'))) {
      router.push('/dashboard')
    }
  }, [user, profile, authLoading, router])

  useEffect(() => {
    if (!profile) return
    fetchDetail()
  }, [profile, classId])

  const fetchDetail = async () => {
    setLoading(true)
    const res = await fetch(`/api/classes/detail?classId=${classId}`)
    const json = await res.json()
    if (json.error) { setLoading(false); return }
    setCls(json.class)
    setStudents(json.students || [])
    setIsOwner(json.isOwner)
    setEditName(json.class.name || '')
    setEditMessage(json.class.message || '')
    setLoading(false)
  }

  const handleSave = async () => {
    setSaving(true)
    await fetch(`/api/classes?id=${classId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName, message: editMessage }),
    })
    setCls(cls ? { ...cls, name: editName, message: editMessage } : null)
    setEditing(false)
    setSaving(false)
  }

  if (authLoading || !profile) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 pt-24 pb-20">
        <Link href="/teacher/classes" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="w-4 h-4" /> 返回班级列表
        </Link>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>
        ) : !cls ? (
          <div className="text-center py-20"><p className="text-muted-foreground">班级不存在</p></div>
        ) : (
          <>
            {/* Header */}
            <div className="bg-card rounded-2xl border p-6 mb-6">
              {editing ? (
                <div className="space-y-3">
                  <input value={editName} onChange={e => setEditName(e.target.value)}
                    className="w-full px-4 py-2 text-lg font-semibold border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" />
                  <textarea value={editMessage} onChange={e => setEditMessage(e.target.value)}
                    rows={3} placeholder="班级留言/公告"
                    className="w-full px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 resize-none" />
                  <div className="flex gap-2">
                    <button onClick={handleSave} disabled={saving}
                      className="flex items-center gap-1 px-4 py-2 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600 disabled:opacity-50">
                      <Save className="w-4 h-4" /> 保存
                    </button>
                    <button onClick={() => setEditing(false)} className="px-4 py-2 bg-gray-200 rounded-lg">取消</button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex items-start justify-between mb-2">
                    <h1 className="text-2xl font-bold">{cls.name}</h1>
                    {isOwner && (
                      <button onClick={() => setEditing(true)}
                        className="text-sm text-muted-foreground hover:text-foreground">
                        <Edit3 className="w-4 h-4 inline" /> 编辑
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground mb-2">
                    <span>邀请码：<code className="px-2 py-0.5 bg-gray-100 rounded font-mono">{cls.invite_code}</code></span>
                    <span>{students.length} 名学生</span>
                  </div>
                  {cls.message && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
                      📢 {cls.message}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Students Progress */}
            <div className="bg-card rounded-2xl border p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Users className="w-5 h-5" /> 学生进度（{students.length}人）
                </h2>
                {students.length > 0 && (
                  <div className="flex gap-1 text-xs">
                    <button onClick={() => setSortBy('name')}
                      className={`px-2 py-1 rounded ${sortBy === 'name' ? 'bg-emerald-100 text-emerald-700 font-medium' : 'text-muted-foreground hover:bg-gray-100'}`}>
                      姓名 ↑
                    </button>
                    <button onClick={() => setSortBy('progress')}
                      className={`px-2 py-1 rounded ${sortBy === 'progress' ? 'bg-emerald-100 text-emerald-700 font-medium' : 'text-muted-foreground hover:bg-gray-100'}`}>
                      进度 ↓
                    </button>
                  </div>
                )}
              </div>

              {students.length === 0 ? (
                <p className="text-center py-12 text-muted-foreground">还没有学生加入</p>
              ) : (
                <div className="space-y-2">
                  {[...students]
                    .sort((a, b) => sortBy === 'name'
                      ? a.display_name.localeCompare(b.display_name, 'zh')
                      : b.percent - a.percent)
                    .map(s => (
                    <div key={s.id} className="border rounded-xl">
                      <button onClick={() => setExpandedStudent(expandedStudent === s.id ? null : s.id)}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left">
                        <span className="font-medium text-sm w-24 shrink-0 truncate">{s.display_name}</span>
                        <div className="flex-1 bg-gray-200 rounded-full h-3">
                          <div className="bg-emerald-500 h-3 rounded-full transition-all" style={{ width: `${s.percent}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground w-10 text-right shrink-0">{s.percent}%</span>
                      </button>

                      {/* Per-chapter breakdown */}
                      {expandedStudent === s.id && s.chapterProgress.length > 0 && (
                        <div className="px-4 pb-3 space-y-2 border-t">
                          {s.chapterProgress.map(cp => (
                            <div key={cp.chapterId} className="pl-3 border-l-2 border-emerald-200">
                              <div className="flex items-center justify-between text-xs mb-0.5">
                                <span className="text-muted-foreground">{cp.chapterTitle}</span>
                                <span>{cp.passed}/{cp.total} · {cp.percent}%</span>
                              </div>
                              <div className="w-full bg-gray-100 rounded-full h-2">
                                <div className="bg-blue-400 h-2 rounded-full transition-all" style={{ width: `${cp.total > 0 ? (cp.passed / cp.total) * 100 : 0}%` }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
