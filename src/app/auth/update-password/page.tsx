'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLang, tr } from '@/lib/i18n'

export default function UpdatePasswordPage() {
  const supabase = createClient()
  const { lang } = useLang()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < 6) { setError(tr(lang, '密码至少6位', 'Password must be at least 6 characters')); return }
    if (password !== confirm) { setError(tr(lang, '两次密码不一致', 'Passwords do not match')); return }
    setBusy(true)

    const { error: err } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (err) {
      setError(err.message)
    } else {
      setError(tr(lang, '密码重置成功！请用新密码登录', 'Password reset! Please log in with your new password'))
      setTimeout(() => {
        window.location.href = '/login'
      }, 2000)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-indigo-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🔐</div>
          <h1 className="text-3xl font-bold">{tr(lang, '设置新密码', 'Set New Password')}</h1>
          <p className="text-muted-foreground mt-1">{tr(lang, '请输入你的新密码', 'Enter your new password')}</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              placeholder={tr(lang, '新密码（至少6位）', 'New Password (min 6)')} minLength={6}
              className="w-full px-4 py-2.5 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" />
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required
              placeholder={tr(lang, '确认新密码', 'Confirm New Password')} minLength={6}
              className="w-full px-4 py-2.5 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" />
            {error && (
              <div className={`p-3 rounded-lg text-sm ${error.includes('成功') || error.includes('reset!') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                {error}
              </div>
            )}
            <button type="submit" disabled={busy}
              className="w-full py-2.5 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600 disabled:opacity-50">
              {busy ? tr(lang, '处理中...', 'Processing...') : tr(lang, '重置密码', 'Reset Password')}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
