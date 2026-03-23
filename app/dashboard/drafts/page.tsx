'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { useAuth } from '@/components/providers/FirebaseProvider'
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase-client'
import { auth } from '@/lib/firebase-client'
import { DraftCard } from '@/components/dashboard/DraftCard'

interface Draft {
  id: string
  customerEmail: string
  customerCompany: string
  customerMessage: string
  agentResponse: string
  confidence: 'high' | 'medium' | 'needs_attention'
  dataSources: string[]
  slaDeadline: Timestamp
}

export default function DraftsPage() {
  const { user } = useAuth()
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    const q = query(
      collection(db, 'manufacturers', user.uid, 'conversations'),
      where('status', '==', 'draft'),
      orderBy('slaDeadline', 'asc')
    )
    const unsub = onSnapshot(q, (snap) => {
      setDrafts(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Draft)))
      setLoading(false)
    })
    return unsub
  }, [user])

  async function handleSend(id: string, response: string) {
    if (!user) return
    try {
      const idToken = await auth.currentUser!.getIdToken()
      const res = await fetch('/api/gmail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, conversationId: id, editedResponse: response }),
      })
      if (!res.ok) {
        // Gmail not connected — mark resolved without actually sending
        await updateDoc(doc(db, 'manufacturers', user.uid, 'conversations', id), {
          agentResponse: response,
          status: 'resolved',
          isDraft: false,
          sentAt: new Date(),
        })
      }
    } catch {
      // Fallback: mark resolved without sending
      await updateDoc(doc(db, 'manufacturers', user.uid, 'conversations', id), {
        agentResponse: response,
        status: 'resolved',
        isDraft: false,
        sentAt: new Date(),
      })
    }
  }

  async function handleDiscard(id: string) {
    if (!user) return
    await updateDoc(doc(db, 'manufacturers', user.uid, 'conversations', id), {
      status: 'draft_discarded',
    })
    await addDoc(collection(db, 'manufacturers', user.uid, 'escalations'), {
      conversationId: id,
      reason: 'Draft discarded by manufacturer',
      slaDeadline: new Date(Date.now() + 60 * 60 * 1000),
      status: 'open',
      assignedTo: null,
      internalNotes: [],
      createdAt: serverTimestamp(),
    })
  }

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 4 }}>Drafts</h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--gray-500)' }}>
            Review and send AI-generated responses before they go out.
          </p>
        </div>
        {drafts.length > 0 && (
          <span style={{
            background: '#fef9c3', color: '#92400e',
            padding: '0.25rem 0.75rem', borderRadius: 9999,
            fontSize: '0.8rem', fontWeight: 600,
          }}>
            {drafts.length} pending
          </span>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--gray-400)' }}>Loading drafts...</div>
      ) : drafts.length === 0 ? (
        <div style={{
          background: 'var(--white)',
          border: '1px solid var(--gray-200)',
          borderRadius: 'var(--border-radius-lg)',
          padding: '3rem',
          textAlign: 'center',
          color: 'var(--gray-400)',
        }}>
          <div style={{ fontSize: '2rem', marginBottom: 12 }}>✓</div>
          <div style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--gray-600)', marginBottom: 8 }}>
            No drafts pending
          </div>
          <div style={{ fontSize: '0.875rem' }}>
            Drafts will appear here when WISMO receives customer inquiries.
          </div>
        </div>
      ) : (
        drafts.map((draft) => (
          <DraftCard
            key={draft.id}
            {...draft}
            onSend={handleSend}
            onDiscard={handleDiscard}
          />
        ))
      )}
    </div>
  )
}
