'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/app/providers'
import { createClient } from '@/lib/supabase/client'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState('student')
  const [inviteCode, setInviteCode] = useState('')
  const [isSignup, setIsSignup] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (searchParams.get('signup') === 'true') setIsSignup(true)
  }, [searchParams])

  useEffect(() => {
    if (!authLoading && user) {
      router.push('/dashboard')
    }
  }, [user, authLoading, router])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setBusy(true)

    if (isSignup) {
      if (role === 'teacher' && inviteCode !== process.env.NEXT_PUBLIC_TEACHER_CODE) {
        setError('教师邀请码不正确')
        setBusy(false)
        return
      }
      const result = await supabase.auth.signUp({
        email, password,
        options: { data: { display_name: name, role } },
      })
      if (result.error) {
        setError(result.error.message)
      } else {
        setError('注册成功，请登录')
        setIsSignup(false)
      }
    } else {
      const result = await supabase.auth.signInWithPassword({ email, password })
      if (result.error) {
        setError(result.error.message)
      }
      // On success, onAuthStateChange in providers will fire and redirect
    }
    setBusy(false)
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-blue-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🧪</div>
          <h1 className="text-3xl font-bold">ChemLearn</h1>
          <p className="text-muted-foreground mt-1">化学闯关学习平台</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-8">
          <div className="flex mb-6 bg-gray-100 rounded-lg p-1">
            <button onClick={() => setIsSignup(false)}
              className={`flex-1 py-2 rounded-md text-sm font-medium ${!isSignup ? 'bg-white shadow' : 'text-gray-500'}`}>
              登录
            </button>
            <button onClick={() => setIsSignup(true)}
              className={`flex-1 py-2 rounded-md text-sm font-medium ${isSignup ? 'bg-white shadow' : 'text-gray-500'}`}>
              注册
            </button>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            {isSignup && (
              <>
                <input type="text" value={name} onChange={e => setName(e.target.value)} required
                  placeholder="你的姓名" className="w-full px-4 py-2.5 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" />
                <div className="flex gap-2">
                  <button type="button" onClick={() => setRole('student')}
                    className={`flex-1 py-2 rounded-lg text-sm ${role === 'student' ? 'bg-emerald-100 text-emerald-700 ring-2 ring-emerald-500' : 'bg-gray-50 text-gray-500'}`}>
                    我是学生
                  </button>
                  <button type="button" onClick={() => setRole('teacher')}
                    className={`flex-1 py-2 rounded-lg text-sm ${role === 'teacher' ? 'bg-blue-100 text-blue-700 ring-2 ring-blue-500' : 'bg-gray-50 text-gray-500'}`}>
                    我是老师
                  </button>
                </div>
                {role === 'teacher' && (
                  <input type="text" value={inviteCode} onChange={e => setInviteCode(e.target.value)}
                    placeholder="教师邀请码（向管理员索取）" className="w-full px-4 py-2.5 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" />
                )}
              </>
            )}
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              placeholder="邮箱" className="w-full px-4 py-2.5 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" />
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6}
              placeholder="密码（至少6位）" className="w-full px-4 py-2.5 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" />
            {error && <div className={`p-3 rounded-lg text-sm ${error.includes('成功') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>{error}</div>}
            <button type="submit" disabled={busy}
              className="w-full py-2.5 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600 disabled:opacity-50">
              {busy ? '处理中...' : isSignup ? '注册' : '登录'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  )
}
