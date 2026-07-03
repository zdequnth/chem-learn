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
  const [forgotPassword, setForgotPassword] = useState(false)
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

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) { setError('请输入邮箱'); return }
    setError('')
    setBusy(true)
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: '/auth/update-password',
    })
    if (err) { setError(err.message) }
    else { setError('密码重置邮件已发送，请检查邮箱（含垃圾箱）') }
    setBusy(false)
  }

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
          {forgotPassword ? (
            <>
              <h2 className="text-lg font-semibold text-center mb-4">找回密码</h2>
              <p className="text-sm text-muted-foreground text-center mb-4">输入注册邮箱，我们会发送重置链接</p>
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                  placeholder="注册邮箱" className="w-full px-4 py-2.5 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" />
                {error && <div className={`p-3 rounded-lg text-sm ${error.includes('已发送') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>{error}</div>}
                <button type="submit" disabled={busy}
                  className="w-full py-2.5 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600 disabled:opacity-50">
                  {busy ? '发送中...' : '发送重置邮件'}
                </button>
                <button type="button" onClick={() => { setForgotPassword(false); setError('') }}
                  className="w-full py-2 text-sm text-muted-foreground hover:text-foreground">
                  ← 返回登录
                </button>
              </form>
            </>
          ) : (
          <>
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
            {error && <div className={`p-3 rounded-lg text-sm ${error.includes('成功') || error.includes('已发送') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>{error}</div>}
            <button type="submit" disabled={busy}
              className="w-full py-2.5 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600 disabled:opacity-50">
              {busy ? '处理中...' : isSignup ? '注册' : '登录'}
            </button>
            {!isSignup && (
              <button type="button" onClick={() => { setForgotPassword(true); setError('') }}
                className="w-full text-center text-sm text-muted-foreground hover:text-emerald-600">
                忘记密码？
              </button>
            )}
          </form>
          </>
          )}
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
