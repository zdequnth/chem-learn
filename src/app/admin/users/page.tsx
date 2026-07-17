'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/app/providers'
import Navbar from '@/components/Navbar'
import { Loader2, Users } from 'lucide-react'

interface UserRecord {
  id: string
  role: string
  display_name: string
  created_at: string
}

export default function AdminUsersPage() {
  const router = useRouter()
  const { user, profile, loading: authLoading } = useAuth()
  const [users, setUsers] = useState<UserRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [changing, setChanging] = useState<string | null>(null)

  useEffect(() => {
    if (!authLoading && (!user || (profile?.role !== 'admin'))) {
      router.push('/dashboard')
    }
  }, [user, profile, authLoading, router])

  useEffect(() => {
    if (!profile || profile.role !== 'admin') return
    fetchUsers()
  }, [profile])

  const fetchUsers = async () => {
    const res = await fetch('/api/admin/users')
    const json = await res.json()
    setUsers(json.users || [])
    setLoading(false)
  }

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

  const filtered = filter === 'all' ? users : users.filter(u => u.role === filter)
  const counts = { all: users.length, teacher: users.filter(u => u.role === 'teacher').length, student: users.filter(u => u.role === 'student').length, admin: users.filter(u => u.role === 'admin').length }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 pt-24 pb-20">
        <h1 className="text-2xl font-bold mb-2 flex items-center gap-2"><Users className="w-6 h-6" /> 用户管理</h1>
        <p className="text-muted-foreground mb-6">共 {users.length} 名用户</p>

        <div className="flex gap-2 mb-6">
          {[{ k: 'all', l: '全部' }, { k: 'teacher', l: '教师' }, { k: 'student', l: '学生' }, { k: 'admin', l: '管理员' }].map(f => (
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
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">姓名</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">角色</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">注册时间</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">操作</th>
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
                      }`}>{u.role === 'admin' ? '管理员' : u.role === 'teacher' ? '教师' : '学生'}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{u.created_at ? new Date(u.created_at).toLocaleDateString('zh-CN') : '-'}</td>
                    <td className="px-4 py-3">
                      {u.role !== 'admin' ? (
                        <button onClick={() => handleChangeRole(u.id, 'admin')} disabled={changing === u.id}
                          className="text-xs px-2 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100 disabled:opacity-50 mr-1">→ 管理员</button>
                      ) : null}
                      {u.role !== 'teacher' ? (
                        <button onClick={() => handleChangeRole(u.id, 'teacher')} disabled={changing === u.id}
                          className="text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 disabled:opacity-50 mr-1">→ 教师</button>
                      ) : null}
                      {u.role !== 'student' ? (
                        <button onClick={() => handleChangeRole(u.id, 'student')} disabled={changing === u.id}
                          className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 disabled:opacity-50">→ 学生</button>
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
