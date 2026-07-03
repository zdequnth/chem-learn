'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/app/providers'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/Navbar'
import type { Course } from '@/lib/types'
import { Plus, Users, Copy, Loader2, Trash2 } from 'lucide-react'

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

  const [classes, setClasses] = useState<ClassData[]>([])
  const [courses, setCourses] = useState<Course[]>([])
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

  if (authLoading || !profile) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 pt-24 pb-20">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold mb-1">班级管理</h1>
            <p className="text-sm text-muted-foreground">创建班级并分享邀请码给学生加入</p>
          </div>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600 transition-colors">
            <Plus className="w-4 h-4" /> 新建班级
          </button>
        </div>

        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowCreate(false)}>
            <div className="bg-card rounded-2xl shadow-xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
              <h2 className="text-lg font-semibold mb-4">新建班级</h2>
              <div className="space-y-3">
                <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="班级名称（如 G10-H 化学 Period 1）"
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
            {classes.map(cls => (
              <Link key={cls.id} href={`/teacher/classes/${cls.id}`}
                className="bg-card rounded-xl border p-5 block hover:shadow-md hover:border-emerald-200 transition-all">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-lg">{cls.name}</h3>
                    <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1"><Users className="w-4 h-4" /> {cls.student_count} 名学生</span>
                      <span onClick={e => { e.preventDefault(); copyInviteCode(cls.invite_code) }}
                        className="flex items-center gap-1 text-blue-600 hover:text-blue-700 cursor-pointer">
                        <Copy className="w-3.5 h-3.5" /> 邀请码: {cls.invite_code}
                      </span>
                    </div>
                  </div>
                  <button onClick={e => { e.preventDefault(); handleDelete(cls.id) }}
                    className="p-2 hover:bg-red-50 rounded-lg text-red-400 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
