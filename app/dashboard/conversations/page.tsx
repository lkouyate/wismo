'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { useAuth } from '@/components/providers/FirebaseProvider'
import { collection, query, orderBy, getDocs, where, limit, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase-client'
import { formatDistanceToNow } from 'date-fns'

interface Conversation {
  id: string
  customerEmail: string
  customerCompany: string
  customerMessage: string
  agentResponse: string
  status: string
  confidence: string
  dataSources: string[]
  poNumber?: string
  createdAt: Timestamp
  sentAt: Timestamp | null
}

const STATUS_BADGE: Record<string, string> = {
  resolved: 'badge-green',
  escalated: 'badge-red',
  draft: 'badge-yellow',
  draft_discarded: 'badge-gray',
}

export default function ConversationsPage() {
  const { user } = useAuth()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Conversation | null>(null)
  const [statusFilter, setStatusFilter] = useState('all')

  useEffect(() => {
    if (!user) return
    loadConversations()
  }, [user, statusFilter])

  async function loadConversations() {
    if (!user) return
    setLoading(true)
    try {
      const colRef = collection(db, 'manufacturers', user.uid, 'conversations')
      let q
      if (statusFilter === 'all') {
        q = query(colRef, orderBy('createdAt', 'desc'), limit(100))
      } else {
        q = query(colRef, where('status', '==', statusFilter), orderBy('createdAt', 'desc'), limit(100))
      }
      const snap = await getDocs(q)
      setConversations(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Conversation)))
    } catch { /* ignore */ }
    setLoading(false)
  }

  return (
    <div style={{ padding: '2rem' }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 20 }}>Conversations</h1>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {['all', 'resolved', 'draft', 'escalated'].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            style={{
              padding: '0.375rem 0.875rem',
              borderRadius: 9,
              border: '1px solid var(--gray-200)',
              background: statusFilter === s ? 'var(--black)' : 'var(--white)',
              color: statusFilter === s ? 'var(--white)' : 'var(--gray-600)',
              fontSize: '0.8rem',
              fontWeight: 500,
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {s}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 1.2fr' : '1fr', gap: 20 }}>
        {/* List */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--gray-400)' }}>Loading...</div>
          ) : conversations.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--gray-400)', fontSize: '0.875rem' }}>
              No conversations found.
            </div>
          ) : (
            conversations.map((c) => (
              <div
                key={c.id}
                onClick={() => setSelected(selected?.id === c.id ? null : c)}
                style={{
                  padding: '0.875rem 1.25rem',
                  borderBottom: '1px solid var(--gray-100)',
                  cursor: 'pointer',
                  background: selected?.id === c.id ? 'var(--gray-50)' : 'var(--white)',
                  transition: 'background 0.1s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{c.customerCompany}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>{c.customerEmail}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span className={STATUS_BADGE[c.status] ?? 'badge-gray'}>{c.status}</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--gray-400)' }}>
                      {c.createdAt?.toDate
                        ? formatDistanceToNow(c.createdAt.toDate(), { addSuffix: true })
                        : '—'}
                    </span>
                  </div>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)', marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.customerMessage?.slice(0, 80)}...
                </div>
              </div>
            ))
          )}
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '1rem' }}>{selected.customerCompany}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--gray-500)' }}>{selected.customerEmail}</div>
              </div>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: 'var(--gray-400)' }}>×</button>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--gray-400)', marginBottom: 6 }}>CUSTOMER MESSAGE</div>
              <div style={{ background: 'var(--gray-50)', borderRadius: 9, padding: '0.75rem', fontSize: '0.875rem', color: 'var(--gray-600)', whiteSpace: 'pre-wrap' }}>
                {selected.customerMessage}
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--gray-400)', marginBottom: 6 }}>AGENT RESPONSE</div>
              <div style={{ background: 'var(--gray-50)', borderRadius: 9, padding: '0.75rem', fontSize: '0.875rem', color: 'var(--gray-600)', whiteSpace: 'pre-wrap' }}>
                {selected.agentResponse || '(No response generated)'}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: '0.75rem', color: 'var(--gray-500)' }}>
              <span className={STATUS_BADGE[selected.status] ?? 'badge-gray'}>{selected.status}</span>
              {selected.poNumber && <span className="badge-gray">PO: {selected.poNumber}</span>}
              {selected.dataSources?.map((s) => <span key={s} className="badge-gray">{s.toUpperCase()}</span>)}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
