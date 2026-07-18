'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/app/providers'
import Navbar from '@/components/Navbar'
import { ArrowLeft, Loader2 } from 'lucide-react'

const subjectNames: Record<string, string> = {
  Chinese: '语文', Math: '数学', English: '英语',
  'Second foreign Language': '二外', Physics: '物理', Chemistry: '化学',
  Biology: '生物', Humanities: '人文',
}
const subjectIcons: Record<string, string> = {
  Chinese: '📖', Math: '📐', English: '🌍', 'Second foreign Language': '🗣️',
  Physics: '⚛️', Chemistry: '🧪', Biology: '🧬', Humanities: '📜',
}

export default function SubjectCoursesPage() {
  const params = useParams()
  const subject = decodeURIComponent((params?.subject as string) || '')
  const { user, loading: authLoading } = useAuth()

  const [courses, setCourses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [favorites, setFavorites] = useState<string[]>([])

  useEffect(() => {
    if (!user) return
    fetch('/api/student/course-data').then(r => r.json()).then(json => {
      const all = (json.courses || []).filter((c: any) => c.subject === subject && c.is_published)
      setCourses(all)
      setLoading(false)
    })
    fetch('/api/student/favorites').then(r => r.json()).then(json => {
      setFavorites(json.favorites || [])
    })
  }, [user, subject])

  const toggleFavorite = async (courseId: string) => {
    if (favorites.includes(courseId)) {
      setFavorites(favorites.filter(id => id !== courseId))
      await fetch(`/api/student/favorites?courseId=${courseId}`, { method: 'DELETE' })
    } else {
      setFavorites([...favorites, courseId])
      await fetch('/api/student/favorites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ courseId }) })
    }
  }

  if (authLoading || !user) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 pt-24 pb-20">
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="w-4 h-4" /> 返回仪表盘
        </Link>
        <h1 className="text-2xl font-bold mb-2 flex items-center gap-2">
          <span>{subjectIcons[subject] || '📚'}</span>
          {subjectNames[subject] || subject}
        </h1>
        <p className="text-muted-foreground mb-8">{courses.length} 门课程</p>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>
        ) : courses.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-4xl mb-4">📭</div>
            <p className="text-muted-foreground">该学科暂无已发布课程</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {courses.map(c => (
              <Link key={c.id} href={`/courses/${c.id}`}
                className="bg-card rounded-2xl p-6 border shadow-sm hover:shadow-md hover:border-emerald-200 transition-all group">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-emerald-100 to-emerald-200 rounded-xl flex items-center justify-center text-2xl">
                    {c.icon || '📚'}
                  </div>
                  <button onClick={e => { e.preventDefault(); e.stopPropagation(); toggleFavorite(c.id) }}
                    className="text-lg hover:scale-110 transition-transform">
                    {favorites.includes(c.id) ? '⭐' : '☆'}
                  </button>
                </div>
                <h3 className="text-lg font-semibold mb-1">{c.name}</h3>
                {c.grade_level && <span className="inline-block px-2 py-0.5 bg-blue-50 text-blue-600 text-xs rounded-full font-medium mb-2">{c.grade_level}</span>}
                {c.description && <p className="text-sm text-muted-foreground line-clamp-2">{c.description}</p>}
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
