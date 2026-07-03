'use client'

import { useLayoutEffect } from 'react'

export function RecoveryRedirect() {
  useLayoutEffect(() => {
    // Don't run on update-password page itself
    if (window.location.pathname.startsWith('/auth/update-password')) return

    const hash = window.location.hash
    // Check for any auth-related hash (recovery, access_token, etc.)
    if (hash && (hash.includes('type=recovery') || hash.includes('access_token') || hash.includes('refresh_token'))) {
      // The user just clicked a password reset link — redirect to update-password page
      window.location.replace('/auth/update-password' + hash)
    }
  }, [])

  return null
}

