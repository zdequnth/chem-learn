'use client'

import { useEffect } from 'react'

export function RecoveryRedirect() {
  useEffect(() => {
    const hash = window.location.hash || window.location.search
    // Check for recovery token in URL (hash or query params)
    if (hash.includes('type=recovery')) {
      // Already on update-password page, don't redirect
      if (window.location.pathname.startsWith('/auth/update-password')) return
      // Redirect to update-password page, preserving the full hash
      window.location.replace('/auth/update-password' + window.location.hash + window.location.search)
    }
  }, [])

  return null
}
