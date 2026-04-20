'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/components/providers/FirebaseProvider'
import { collection, query, orderBy, limit, onSnapshot, where, Timestamp, doc } from 'firebase/firestore'
import { db } from '@/lib/firebase-client'
import { formatDistanceToNow } from 'date-fns'
import Link from 'next/link'

type Period = '1d' | '7d' | '30d'

interface Conversation {
  id: string
  customerEmail: string
  customerCompany: string
  status: string
  confidence: string
  createdAt: Timestamp
}

interface MfgInfo {
  katanaConnected: boolean
  gmailConnected: boolean
  gmailEmail?: string
  gmailWatchExpiry?: number
  isLive?: boolean
}

const CONFIDENCE_COLORS: Record<string, string> = {
  high: '#166534',
  medium: '#92400e',
  needs_attention: '#991b1b',
}

export default function DashboardPage() {
  const { user } = useAuth()
  const [period, setPeriod] = useState<Period>('7d')
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [metrics, setMetrics] = useState({ total: 0, resolved: 0, escalated: 0 })
  const [loading, setLoading] = useState(true)
  const [mfgInfo, setMfgInfo] = useState<MfgInfo | null>(null)

  useEffect(() => {
    if (!user) return
    setLoading(true)
    const days = period === '1d' ? 1 : period === '7d' ? 7 : 30
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    // Real-time listener for manufacturer info
    const unsubMfg = onSnapshot(doc(db, 'manufacturers', user.uid), (snap) => {
      if (snap.exists()) setMfgInfo(snap.data() as MfgInfo)
    })

    // Real-time listener for conversations
    const colRef = collection(db, 'manufacturers', user.uid, 'conversations')
    const q = query(colRef, where('createdAt', '>=', since), orderBy('createdAt', 'desc'), limit(50))

    const unsubConvos = onSnapshot(q, (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Conversation))
      setConversations(docs)
      setMetrics({
        total: docs.length,
        resolved: docs.filter((d) => d.status === 'resolved').length,
        escalated: docs.filter((d) => d.status === 'escalated').length,
      })
      setLoading(false)
    }, () => { setLoading(false) })

    return () => { unsubMfg(); unsubConvos() }
  }, [user, period])

  const resolutionRate = metrics.total > 0 ? Math.round((metrics.resolved / metrics.total) * 100) : null

  // Gmail watch status
  const watchExpiry = mfgInfo?.gmailWatchExpiry ? new Date(mfgInfo.gmailWatchExpiry) : null
  const watchDaysLeft = watchExpiry ? Math.ceil((watchExpiry.getTime() - Date.now()) / 86400000) : null
  const watchExpired = watchDaysLeft !== null && watchDaysLeft <= 0
  const watchExpiringSoon = watchDaysLeft !== null && watchDaysLeft > 0 && watchDaysLeft <= 2
  const setupIncomplete = mfgInfo && (!mfgInfo.katanaConnected || !mfgInfo.gmailConnected)

  return (
    <div style={{ padding: '2rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700 }}>Overview</h1>
        <div style={{ display: 'flex', gap: 4, background: 'var(--gray-100)', borderRadius: 9, padding: 4 }}>
          {(['1d', '7d', '30d'] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              style={{
                padding: '0.3rem 0.75rem', borderRadius: 6, border: 'none',
                background: period === p ? 'var(--white)' : 'transparent',
                fontSize: '0.8rem', fontWeight: period === p ? 600 : 400, cursor: 'pointer',
                color: period === p ? 'var(--black)' : 'var(--gray-500)',
                boxShadow: period === p ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              {p === '1d' ? 'Today' : p === '7d' ? '7 days' : '30 days'}
            </button>
          ))}
        </div>
      </div>

      {/* Setup / integration status strip */}
      {mfgInfo && (
        <div style={{
          background: setupIncomplete ? '#fffbeb' : 'var(--white)',
          border: `1px solid ${setupIncomplete ? '#fde68a' : 'var(--gray-200)'}`,
          borderRadius: 'var(--border-radius-lg)',
          padding: '0.875rem 1.25rem',
          marginBottom: 24,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
            {setupIncomplete && (
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#92400e' }}>Complete setup:</span>
            )}
            <span style={{ fontSize: '0.8rem', color: mfgInfo.katanaConnected ? '#166534' : '#b45309' }}>
              {mfgInfo.katanaConnected ? '✓' : '○'} Katana
            </span>
            <span style={{ fontSize: '0.8rem', color: mfgInfo.gmailConnected ? (watchExpired ? '#991b1b' : watchExpiringSoon ? '#92400e' : '#166534') : '#b45309' }}>
              {mfgInfo.gmailConnected ? (watchExpired ? '⚠' : '✓') : '○'} Gmail
              {mfgInfo.gmailConnected && watchExpiringSoon && !watchExpired && ` (watch expiring in ${watchDaysLeft}d)`}
              {mfgInfo.gmailConnected && watchExpired && ' (watch expired)'}
            </span>
            <span style={{ fontSize: '0.8rem', color: '#166534' }}>✓ UPS Tracking</span>
          </div>
          <Link
            href="/dashboard/integrations"
            style={{ fontSize: '0.75rem', color: 'var(--gray-500)', textDecoration: 'none' }}
          >
            Manage →
          </Link>
        </div>
      )}

      {/* Metric cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Queries handled', value: loading ? '—' : metrics.total, icon: '📨' },
          { label: 'Resolved automatically', value: loading ? '—' : metrics.resolved, icon: '✓' },
          { label: 'Escalated', value: loading ? '—' : metrics.escalated, icon: '⚠' },
          {
            label: 'Resolution rate',
            value: loading ? '—' : resolutionRate !== null ? `${resolutionRate}%` : '—',
            icon: '📈',
            accent: resolutionRate !== null && resolutionRate >= 80,
          },
        ].map((m) => (
          <div key={m.label} className="card">
            <div style={{ fontSize: '1.75rem', marginBottom: 4 }}>{m.icon}</div>
            <div style={{ fontSize: '2rem', fontWeight: 700, marginBottom: 4, color: m.accent ? '#166534' : undefined }}>
              {m.value}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--gray-500)' }}>{m.label}</div>
          </div>
        ))}
      </div>

      {/* Recent conversations */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontWeight: 600 }}>Recent Conversations</div>
          <Link href="/dashboard/conversations" style={{ fontSize: '0.8rem', color: 'var(--gray-500)', textDecoration: 'none' }}>
            View all →
          </Link>
        </div>

        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--gray-400)', fontSize: '0.875rem' }}>Loading...</div>
        ) : conversations.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--gray-400)', fontSize: '0.875rem' }}>
            No conversations yet. They&apos;ll appear here once customers start sending inquiries.
          </div>
        ) : (
          <div>
            {conversations.slice(0, 5).map((c) => (
              <div key={c.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0.75rem 0', borderBottom: '1px solid var(--gray-100)',
              }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>{c.customerCompany}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>{c.customerEmail}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{
                    fontSize: '0.7rem',
                    color: CONFIDENCE_COLORS[c.confidence] ?? 'var(--gray-500)',
                    background: c.confidence === 'high' ? '#dcfce7' : c.confidence === 'medium' ? '#fef9c3' : '#fee2e2',
                    padding: '0.2rem 0.5rem', borderRadius: 9999,
                  }}>
                    {c.confidence?.replace('_', ' ')}
                  </span>
                  <span className={`badge-${c.status === 'resolved' ? 'green' : c.status === 'escalated' ? 'red' : 'yellow'}`}>
                    {c.status}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--gray-400)' }}>
                    {c.createdAt?.toDate ? formatDistanceToNow(c.createdAt.toDate(), { addSuffix: true }) : '—'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
