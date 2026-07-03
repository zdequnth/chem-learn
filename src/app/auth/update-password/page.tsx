'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function UpdatePasswordPage() {
  const router = useRouter()
  const supabase = createClient()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // Supabase stores the recovery token in the URL hash after redirect
    const hash = window.location.hash
    if (!hash || !hash.includes('type=recovery')) {
      setError('无效的重置链接，请重新发起密码重置')
      return
    }
    setReady(true)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < 6) { setError('密码至少6位'); return }
    if (password !== confirm) { setError('两次密码不一致'); return }
    setBusy(true)

    const { error: err } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (err) {
      setError(err.message)
    } else {
      setError('密码重置成功！请使用新密码重新登录')
      setTimeout(() => window.location.href = '/login', 2000)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-blue-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🔐</div>
          <h1 className="text-3xl font-bold">设置新密码</h1>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-8">
          {!ready ? (
            <p className="text-center text-muted-foreground">验证链接中...</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-sm text-muted-foreground">请输入你的新密码</p>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
                placeholder="新密码（至少6位）" minLength={6}
                className="w-full px-4 py-2.5 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" />
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required
                placeholder="确认新密码" minLength={6}
                className="w-full px-4 py-2.5 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" />
              {error && (
                <div className={`p-3 rounded-lg text-sm ${error.includes('成功') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                  {error}
                </div>
              )}
              <button type="submit" disabled={busy}
                className="w-full py-2.5 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600 disabled:opacity-50">
                {busy ? '处理中...' : '重置密码'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
