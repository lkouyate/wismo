'use client'


import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { doc, getDoc, Timestamp } from 'firebase/firestore'
import { useAuth } from '@/components/providers/FirebaseProvider'
import { db } from '@/lib/firebase-client'
import { Sidebar } from '@/components/dashboard/Sidebar'
import { useInactivityTimeout } from '@/hooks/useInactivityTimeout'
import { getTrialDaysLeft } from '@/lib/billing-shared'
import { ToastProvider } from '@/components/ui/Toast'
import Link from 'next/link'

type Level = 'info' | 'warning' | 'error'
interface Announcement { active: boolean; message: string; level: Level }

const BANNER_COLORS: Record<Level, { bg: string; color: string; border: string }> = {
  info:    { bg: '#dbeafe', color: '#1e40af', border: '#bfdbfe' },
  warning: { bg: '#fef9c3', color: '#92400e', border: '#fde68a' },
  error:   { bg: '#fee2e2', color: '#991b1b', border: '#fecaca' },
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [announcement, setAnnouncement] = useState<Announcement | null>(null)
  const [trialDaysLeft, setTrialDaysLeft] = useState<number | null>(null)
  const [plan, setPlan] = useState<string | null>(null)
  const { warning, extendSession } = useInactivityTimeout()

  useEffect(() => {
    if (loading) return
    if (!user) router.replace('/login')
  }, [user, loading, router])

  useEffect(() => {
    if (!user || !db) return
    getDoc(doc(db, 'platformConfig', 'announcement'))
      .then(snap => {
        if (snap.exists()) {
          const data = snap.data() as Announcement
          if (data.active && data.message) setAnnouncement(data)
        }
      })
      .catch(() => {})

    getDoc(doc(db, 'manufacturers', user.uid))
      .then(snap => {
        if (snap.exists()) {
          const d = snap.data()
          setPlan(d.plan ?? 'free_trial')
          setTrialDaysLeft(getTrialDaysLeft(d.trialEndsAt as Timestamp))
        }
      })
      .catch(() => {})
  }, [user])

  if (loading || !user) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div style={{ width: 32, height: 32, border: '2px solid #e5e5e5', borderTopColor: '#0a0a0a', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  const banner = announcement ? BANNER_COLORS[announcement.level] : null
  const showTrialBanner = plan === 'free_trial' && trialDaysLeft !== null && trialDaysLeft <= 3

  return (
    <ToastProvider>
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div style={{ flex: 1, overflow: 'auto', background: 'var(--gray-50)', display: 'flex', flexDirection: 'column' }}>
        {banner && announcement && (
          <div style={{ background: banner.bg, color: banner.color, borderBottom: `1px solid ${banner.border}`, padding: '10px 20px', fontSize: 13, fontWeight: 500 }}>
            {announcement.message}
          </div>
        )}
        {showTrialBanner && (
          <div style={{
            background: trialDaysLeft! <= 0 ? '#fee2e2' : '#fef9c3',
            color: trialDaysLeft! <= 0 ? '#991b1b' : '#92400e',
            borderBottom: `1px solid ${trialDaysLeft! <= 0 ? '#fecaca' : '#fde68a'}`,
            padding: '10px 20px', fontSize: 13, fontWeight: 500,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span>
              {trialDaysLeft! <= 0
                ? '⚠ Your free trial has expired.'
                : `⚠ Your free trial expires in ${trialDaysLeft} day${trialDaysLeft === 1 ? '' : 's'}.`}
            </span>
            <Link href="/dashboard/settings/billing" style={{ fontSize: 12, fontWeight: 600, color: 'inherit', textDecoration: 'underline' }}>
              Upgrade now →
            </Link>
          </div>
        )}
        <main style={{ flex: 1 }}>
          {children}
        </main>
      </div>

      {/* Inactivity warning dialog */}
      {warning && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: 'white', borderRadius: 14, padding: '28px 32px', maxWidth: 360, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 8 }}>Still there?</div>
            <p style={{ fontSize: '0.875rem', color: 'var(--gray-500)', marginBottom: 20 }}>
              Your session will expire in 5 minutes due to inactivity. Click below to stay logged in.
            </p>
            <button onClick={extendSession} className="btn-primary" style={{ width: '100%' }}>
              Stay logged in
            </button>
          </div>
        </div>
      )}
    </div>
    </ToastProvider>
  )
}
