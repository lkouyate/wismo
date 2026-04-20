'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { signOut } from 'firebase/auth'
import { auth } from '@/lib/firebase-client'

export function useInactivityTimeout(
  timeoutMs = 7_200_000,  // 120 min → auto sign-out
  warnMs = 6_900_000,     // 115 min → show warning
) {
  const [warning, setWarning] = useState(false)
  const router = useRouter()
  const warnTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const logoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimers = useCallback(() => {
    if (warnTimer.current) clearTimeout(warnTimer.current)
    if (logoutTimer.current) clearTimeout(logoutTimer.current)
  }, [])

  const resetTimers = useCallback(() => {
    clearTimers()
    setWarning(false)
    warnTimer.current = setTimeout(() => setWarning(true), warnMs)
    logoutTimer.current = setTimeout(async () => {
      if (auth) await signOut(auth)
      router.replace('/login')
    }, timeoutMs)
  }, [clearTimers, warnMs, timeoutMs, router])

  useEffect(() => {
    resetTimers()
    const events = ['mousemove', 'keydown', 'click', 'touchstart'] as const
    events.forEach(e => window.addEventListener(e, resetTimers, { passive: true }))
    return () => {
      clearTimers()
      events.forEach(e => window.removeEventListener(e, resetTimers))
    }
  }, [resetTimers, clearTimers])

  const extendSession = useCallback(() => resetTimers(), [resetTimers])

  return { warning, extendSession }
}
