'use client'

import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/components/providers/FirebaseProvider'
import { collection, query, orderBy, getDocs, onSnapshot, where, limit, startAfter, Timestamp } from 'firebase/firestore'
import type { QueryConstraint, QueryDocumentSnapshot, DocumentData } from 'firebase/firestore'
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

const PAGE_SIZE = 30

function escapeCsvField(v: string) {
  return `"${(v ?? '').replace(/"/g, '""')}"`
}

export default function ConversationsPage() {
  const { user } = useAuth()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [selected, setSelected] = useState<Conversation | null>(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const lastDocRef = useRef<QueryDocumentSnapshot<DocumentData> | null>(null)

  // Real-time listener for the initial page of conversations
  useEffect(() => {
    if (!user) return
    lastDocRef.current = null
    setConversations([])
    setLoading(true)

    const colRef = collection(db, 'manufacturers', user.uid, 'conversations')
    const constraints: QueryConstraint[] = []
    if (statusFilter !== 'all') constraints.push(where('status', '==', statusFilter))
    constraints.push(orderBy('createdAt', 'desc'))
    constraints.push(limit(PAGE_SIZE + 1))

    const unsub = onSnapshot(query(colRef, ...constraints), (snap) => {
      const docs = snap.docs.slice(0, PAGE_SIZE).map(d => ({ id: d.id, ...d.data() } as Conversation))
      setHasMore(snap.docs.length > PAGE_SIZE)
      lastDocRef.current = snap.docs[PAGE_SIZE - 1] ?? null
      setConversations(docs)
      setLoading(false)
    }, () => { setLoading(false) })

    return unsub
  }, [user, statusFilter])

  // Load more uses getDocs (pagination beyond the real-time window)
  async function loadConversations() {
    if (!user || !lastDocRef.current) return
    setLoadingMore(true)

    try {
      const colRef = collection(db, 'manufacturers', user.uid, 'conversations')
      const constraints: QueryConstraint[] = []
      if (statusFilter !== 'all') constraints.push(where('status', '==', statusFilter))
      constraints.push(orderBy('createdAt', 'desc'))
      constraints.push(startAfter(lastDocRef.current))
      constraints.push(limit(PAGE_SIZE + 1))

      const snap = await getDocs(query(colRef, ...constraints))
      const docs = snap.docs.slice(0, PAGE_SIZE).map(d => ({ id: d.id, ...d.data() } as Conversation))
      setHasMore(snap.docs.length > PAGE_SIZE)
      lastDocRef.current = snap.docs[PAGE_SIZE - 1] ?? null
      setConversations(prev => [...prev, ...docs])
    } catch { /* ignore */ }

    setLoadingMore(false)
  }

  // Client-side filter
  const filtered = conversations.filter(c => {
    if (search) {
      const q = search.toLowerCase()
      if (
        !c.customerCompany?.toLowerCase().includes(q) &&
        !c.customerEmail?.toLowerCase().includes(q) &&
        !c.customerMessage?.toLowerCase().includes(q)
      ) return false
    }
    if (dateFrom && c.createdAt?.toDate && c.createdAt.toDate() < new Date(dateFrom)) return false
    if (dateTo) {
      const to = new Date(dateTo); to.setHours(23, 59, 59)
      if (c.createdAt?.toDate && c.createdAt.toDate() > to) return false
    }
    return true
  })

  function exportCSV() {
    const headers = ['Company', 'Email', 'Status', 'Confidence', 'PO Number', 'Created At', 'Customer Message', 'Agent Response']
    const rows = filtered.map(c => [
      escapeCsvField(c.customerCompany),
      escapeCsvField(c.customerEmail),
      c.status,
      c.confidence,
      c.poNumber ?? '',
      c.createdAt?.toDate ? c.createdAt.toDate().toISOString() : '',
      escapeCsvField(c.customerMessage),
      escapeCsvField(c.agentResponse),
    ])
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'conversations.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700 }}>Conversations</h1>
        <button
          onClick={exportCSV}
          disabled={filtered.length === 0}
          className="btn-secondary"
          style={{ fontSize: '0.8rem', padding: '0.4rem 0.875rem' }}
        >
          Export CSV
        </button>
      </div>

      {/* Status filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {['all', 'resolved', 'draft', 'escalated'].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            style={{
              padding: '0.375rem 0.875rem', borderRadius: 9,
              border: '1px solid var(--gray-200)',
              background: statusFilter === s ? 'var(--black)' : 'var(--white)',
              color: statusFilter === s ? 'var(--white)' : 'var(--gray-600)',
              fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer', textTransform: 'capitalize',
            }}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Search + date range */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search company, email, message…"
          style={{
            flex: 1, minWidth: 200, padding: '0.4rem 0.75rem',
            border: '1px solid var(--gray-200)', borderRadius: 8, fontSize: '0.8rem',
          }}
        />
        <input
          type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          style={{ padding: '0.4rem 0.75rem', border: '1px solid var(--gray-200)', borderRadius: 8, fontSize: '0.8rem' }}
        />
        <span style={{ fontSize: '0.75rem', color: 'var(--gray-400)' }}>–</span>
        <input
          type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          style={{ padding: '0.4rem 0.75rem', border: '1px solid var(--gray-200)', borderRadius: 8, fontSize: '0.8rem' }}
        />
        {(search || dateFrom || dateTo) && (
          <button
            onClick={() => { setSearch(''); setDateFrom(''); setDateTo('') }}
            style={{ padding: '0.4rem 0.75rem', border: '1px solid var(--gray-200)', borderRadius: 8, fontSize: '0.8rem', background: 'white', cursor: 'pointer', color: 'var(--gray-500)' }}
          >
            Clear
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 1.2fr' : '1fr', gap: 20 }}>
        {/* List */}
        <div>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {loading ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--gray-400)' }}>Loading...</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--gray-400)', fontSize: '0.875rem' }}>
                No conversations found.
              </div>
            ) : (
              filtered.map(c => (
                <div
                  key={c.id}
                  onClick={() => setSelected(selected?.id === c.id ? null : c)}
                  style={{
                    padding: '0.875rem 1.25rem', borderBottom: '1px solid var(--gray-100)',
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
                        {c.createdAt?.toDate ? formatDistanceToNow(c.createdAt.toDate(), { addSuffix: true }) : '—'}
                      </span>
                    </div>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)', marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.customerMessage?.slice(0, 80)}…
                  </div>
                </div>
              ))
            )}
          </div>

          {hasMore && !loading && (
            <div style={{ marginTop: 12, textAlign: 'center' }}>
              <button
                onClick={() => loadConversations()}
                disabled={loadingMore}
                className="btn-secondary"
                style={{ fontSize: '0.8rem' }}
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}

          {!loading && (
            <div style={{ marginTop: 8, fontSize: '0.75rem', color: 'var(--gray-400)', textAlign: 'right' }}>
              {filtered.length}{filtered.length < conversations.length ? ` of ${conversations.length}` : ''} conversations
              {hasMore ? ' · more available' : ''}
            </div>
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

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span className={STATUS_BADGE[selected.status] ?? 'badge-gray'}>{selected.status}</span>
              {selected.poNumber && <span className="badge-gray">PO: {selected.poNumber}</span>}
              {selected.dataSources?.map(s => <span key={s} className="badge-gray">{s.toUpperCase()}</span>)}
            </div>

            {selected.createdAt?.toDate && (
              <div style={{ marginTop: 12, fontSize: '0.75rem', color: 'var(--gray-400)' }}>
                {selected.createdAt.toDate().toLocaleString()}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
