'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { useAuth } from '@/components/providers/FirebaseProvider'
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc, Timestamp, arrayUnion } from 'firebase/firestore'
import { db } from '@/lib/firebase-client'
import { formatDistanceToNow, isPast } from 'date-fns'

interface Escalation {
  id: string
  conversationId: string
  reason: string
  slaDeadline: Timestamp
  status: 'open' | 'resolved'
  assignedTo: string | null
  internalNotes: string[]
  createdAt: Timestamp
}

export default function EscalationsPage() {
  const { user } = useAuth()
  const [escalations, setEscalations] = useState<Escalation[]>([])
  const [loading, setLoading] = useState(true)
  const [noteInput, setNoteInput] = useState<Record<string, string>>({})
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!user) return
    const q = query(
      collection(db, 'manufacturers', user.uid, 'escalations'),
      where('status', '==', 'open'),
      orderBy('slaDeadline', 'asc')
    )
    const unsub = onSnapshot(q, (snap) => {
      setEscalations(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Escalation)))
      setLoading(false)
    })
    return unsub
  }, [user])

  async function handleResolve(id: string) {
    if (!user) return
    await updateDoc(doc(db, 'manufacturers', user.uid, 'escalations', id), {
      status: 'resolved',
    })
  }

  async function handleAddNote(id: string) {
    if (!user || !noteInput[id]?.trim()) return
    await updateDoc(doc(db, 'manufacturers', user.uid, 'escalations', id), {
      internalNotes: arrayUnion(noteInput[id].trim()),
    })
    setNoteInput((prev) => ({ ...prev, [id]: '' }))
  }

  return (
    <div style={{ padding: '2rem' }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 6 }}>Escalations</h1>
      <p style={{ color: 'var(--gray-500)', fontSize: '0.875rem', marginBottom: 24 }}>
        Customer inquiries that need your personal attention.
      </p>

      {loading ? (
        <div style={{ textAlign: 'center', color: 'var(--gray-400)', padding: '3rem' }}>Loading...</div>
      ) : escalations.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--gray-400)' }}>
          <div style={{ fontSize: '2rem', marginBottom: 12 }}>✓</div>
          <div style={{ fontWeight: 500, color: 'var(--gray-600)' }}>No open escalations</div>
          <div style={{ fontSize: '0.875rem', marginTop: 4 }}>All customer inquiries are resolved.</div>
        </div>
      ) : (
        escalations.map((e) => {
          const deadline = e.slaDeadline?.toDate?.()
          const overdue = deadline ? deadline.getTime() < now.getTime() : false
          const minsLeft = deadline ? Math.round((deadline.getTime() - now.getTime()) / 60000) : null

          return (
            <div key={e.id} style={{
              background: 'var(--white)',
              border: `1px solid ${overdue ? '#fca5a5' : 'var(--gray-200)'}`,
              borderRadius: 'var(--border-radius-lg)',
              padding: '1.25rem',
              marginBottom: 16,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{e.reason}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>
                    {e.createdAt?.toDate ? formatDistanceToNow(e.createdAt.toDate(), { addSuffix: true }) : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  {overdue ? (
                    <span className="badge-red">⚠ Overdue</span>
                  ) : minsLeft !== null ? (
                    <span className={minsLeft < 30 ? 'badge-yellow' : 'badge-gray'}>
                      {minsLeft}m left
                    </span>
                  ) : null}
                </div>
              </div>

              {/* Notes */}
              {e.internalNotes.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  {e.internalNotes.map((note, i) => (
                    <div key={i} style={{
                      background: 'var(--gray-50)', borderRadius: 6,
                      padding: '0.5rem 0.75rem', fontSize: '0.8rem', color: 'var(--gray-600)', marginBottom: 4,
                    }}>
                      {note}
                    </div>
                  ))}
                </div>
              )}

              {/* Add note */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input
                  type="text"
                  placeholder="Add internal note..."
                  value={noteInput[e.id] ?? ''}
                  onChange={(ev) => setNoteInput((p) => ({ ...p, [e.id]: ev.target.value }))}
                  onKeyDown={(ev) => ev.key === 'Enter' && handleAddNote(e.id)}
                  className="input-field"
                  style={{ flex: 1 }}
                />
                <button onClick={() => handleAddNote(e.id)} className="btn-secondary" style={{ padding: '0.625rem 1rem' }}>
                  Add
                </button>
              </div>

              <button onClick={() => handleResolve(e.id)} className="btn-primary">
                Mark Resolved
              </button>
            </div>
          )
        })
      )}
    </div>
  )
}
