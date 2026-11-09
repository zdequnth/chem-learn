'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/app/providers'
import Navbar from '@/components/Navbar'
import { Loader2, Users } from 'lucide-react'
import { useLang, tr } from '@/lib/i18n'

interface UserRecord {
  id: string
  role: string
  display_name: string
  created_at: string
}

export default function AdminUsersPage() {
  const router = useRouter()
  const { user, profile, loading: authLoading } = useAuth()
  const { lang } = useLang()
  const [users, setUsers] = useState<UserRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [changing, setChanging] = useState<string | null>(null)
  const [forbidden, setForbidden] = useState(false)

  useEffect(() => {
    if (!authLoading && !user) router.push('/login')
  }, [user, authLoading, router])

  const fetchUsers = async () => {
    const res = await fetch('/api/admin/users')
    if (res.status === 403) { setLoading(false); setForbidden(true); return }
    const json = await res.json()
    setUsers(json.users || [])
    setLoading(false)
  }

  useEffect(() => {
    if (!user) return
    fetchUsers()
  }, [user])

  const handleChangeRole = async (userId: string, newRole: string) => {
    setChanging(userId)
    await fetch(`/api/admin/users?id=${userId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: newRole }),
    })
    fetchUsers()
    setChanging(null)
  }

  if (authLoading || !profile) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>
  }

  if (forbidden) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <main className="max-w-4xl mx-auto px-4 pt-24 pb-20 text-center">
          <div className="text-6xl mb-4">🔒</div>
          <h2 className="text-2xl font-bold mb-2">{tr(lang, '暂无访问权限', 'No access')}</h2>
          <p className="text-muted-foreground mb-6">{tr(lang, '此页面仅限管理员访问，如需帮助请联系系统管理员', 'This page is for administrators only. Contact your system administrator for help.')}</p>
          <a href="/dashboard" className="px-6 py-2.5 bg-purple-500 text-white rounded-lg font-medium hover:bg-purple-600">{tr(lang, '返回仪表盘', 'Back to dashboard')}</a>
        </main>
      </div>
    )
  }

  const filtered = filter === 'all' ? users : users.filter(u => u.role === filter)
  const counts = { all: users.length, teacher: users.filter(u => u.role === 'teacher').length, student: users.filter(u => u.role === 'student').length, admin: users.filter(u => u.role === 'admin').length }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 pt-24 pb-20">
        <h1 className="text-2xl font-bold mb-2 flex items-center gap-2"><Users className="w-6 h-6" /> {tr(lang, '用户管理', 'User management')}</h1>
        <p className="text-muted-foreground mb-6">{tr(lang, `共 ${users.length} 名用户`, `${users.length} users`)}</p>

        <div className="flex gap-2 mb-6">
          {[
            { k: 'all', l: tr(lang, '全部', 'All') },
            { k: 'teacher', l: tr(lang, '教师', 'Teachers') },
            { k: 'student', l: tr(lang, '学生', 'Students') },
            { k: 'admin', l: tr(lang, '管理员', 'Admins') },
          ].map(f => (
            <button key={f.k} onClick={() => setFilter(f.k)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium ${filter === f.k ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-muted-foreground hover:bg-gray-200'}`}>
              {f.l} ({(counts as any)[f.k] || 0})
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>
        ) : (
          <div className="bg-card rounded-2xl border overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">{tr(lang, '姓名', 'Name')}</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">{tr(lang, '角色', 'Role')}</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">{tr(lang, '注册时间', 'Registered')}</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">{tr(lang, '操作', 'Actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm">{u.display_name}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        u.role === 'admin' ? 'bg-red-100 text-red-700' :
                        u.role === 'teacher' ? 'bg-blue-100 text-blue-700' :
                        'bg-green-100 text-green-700'
                      }`}>{u.role === 'admin' ? tr(lang, '管理员', 'Admin') : u.role === 'teacher' ? tr(lang, '教师', 'Teacher') : tr(lang, '学生', 'Student')}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{u.created_at ? new Date(u.created_at).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US') : '-'}</td>
                    <td className="px-4 py-3">
                      {u.role !== 'admin' ? (
                        <button onClick={() => handleChangeRole(u.id, 'admin')} disabled={changing === u.id}
                          className="text-xs px-2 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100 disabled:opacity-50 mr-1">→ {tr(lang, '管理员', 'Admin')}</button>
                      ) : null}
                      {u.role !== 'teacher' ? (
                        <button onClick={() => handleChangeRole(u.id, 'teacher')} disabled={changing === u.id}
                          className="text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 disabled:opacity-50 mr-1">→ {tr(lang, '教师', 'Teacher')}</button>
                      ) : null}
                      {u.role !== 'student' ? (
                        <button onClick={() => handleChangeRole(u.id, 'student')} disabled={changing === u.id}
                          className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 disabled:opacity-50">→ {tr(lang, '学生', 'Student')}</button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
