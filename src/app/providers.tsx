'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import type { Profile } from '@/lib/types'

interface AuthContextType {
  user: User | null
  profile: Profile | null
  loading: boolean
  refreshProfile: () => Promise<void>
  signOut: () => void
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  refreshProfile: async () => {},
  signOut: async () => {},
})

export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  const resolveProfile = useCallback(async (userId: string, userEmail?: string, userMeta?: any) => {
    // IMMEDIATELY set a local profile from metadata so UI doesn't block
    const localProfile: Profile = {
      id: userId,
      role: userMeta?.role || 'student',
      display_name: userMeta?.display_name || userEmail || '用户',
      avatar_url: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    setProfile(localProfile)

    // Try to get real profile from DB; if missing, upsert to fix foreign keys after DB reset
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()
      if (data) {
        setProfile(data as Profile)
      } else if (!data && !error) {
        // Profile missing in DB — upsert it so foreign keys work
        await supabase.from('profiles').upsert({
          id: userId,
          role: userMeta?.role || 'student',
          display_name: userMeta?.display_name || userEmail || '用户',
        }, { onConflict: 'id' })
      }
    } catch (e) {
      // DB not available — local profile is fine
    }
  }, [supabase])

  const refreshProfile = useCallback(async () => {
    if (user) await resolveProfile(user.id, user.email, user.user_metadata)
  }, [user, resolveProfile])

  const signOut = useCallback(() => {
    // Fire-and-forget Supabase signOut
    supabase.auth.signOut().catch(() => {})
    // Clear Supabase auth cookies manually
    const cookieNames = document.cookie.split(';').map(c => c.split('=')[0].trim()).filter(Boolean)
    cookieNames.forEach(name => {
      document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/'
      document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=' + window.location.hostname
    })
    window.location.href = '/login'
  }, [supabase])

  useEffect(() => {
    let resolved = false

    async function initAuth() {
      try {
        const { data } = await supabase.auth.getSession()
        if (resolved) return
        const currentUser = data.session?.user ?? null
        setUser(currentUser)
        if (currentUser) {
          await resolveProfile(currentUser.id, currentUser.email, currentUser.user_metadata)
        } else {
          setProfile(null)
        }
      } catch (e) {
        console.error('Auth init error:', e)
      } finally {
        if (!resolved) {
          setLoading(false)
          resolved = true
        }
      }
    }

    const timeout = setTimeout(() => {
      if (!resolved) {
        setLoading(false)
        resolved = true
      }
    }, 8000)

    initAuth()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        const currentUser = session?.user ?? null

        // Always update user on auth state changes
        setUser(currentUser)

        if (currentUser) {
          await resolveProfile(currentUser.id, currentUser.email, currentUser.user_metadata)
        } else {
          setProfile(null)
        }

        if (!resolved) {
          setLoading(false)
          resolved = true
        }
      }
    )

    return () => {
      clearTimeout(timeout)
      subscription.unsubscribe()
    }
  }, [supabase, resolveProfile])

  return (
    <AuthContext.Provider value={{ user, profile, loading, refreshProfile, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}
