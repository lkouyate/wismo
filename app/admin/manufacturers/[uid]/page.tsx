'use client'


import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { doc, getDoc, collection, getDocs, query, orderBy, limit } from 'firebase/firestore'
import { db } from '@/lib/firebase-client'
import { auth } from '@/lib/firebase-client'

interface MfgData {
  email?: string
  displayName?: string
  isLive?: boolean
  draftMode?: boolean
  onboardingComplete?: boolean
  adminSuspended?: boolean
  gmailConnected?: boolean
  gmailEmail?: string
  gmailWatchExpiry?: { seconds: number }
  gmailHistoryId?: string
  katanaConnected?: boolean
  createdAt?: { seconds: number }
  plan?: string
  trialEndsAt?: { seconds: number }
  planStartedAt?: { seconds: number }
  agentSettings?: {
    responseStyle?: string
    customSignature?: string
    escalationTriggers?: string[]
  }
}

interface TestRunResult {
  response?: string
  confidence?: string
  dataSources?: string[]
  poNumber?: string | null
  error?: string
}

interface Conversation {
  id: string
  customerEmail?: string
  customerCompany?: string
  status?: string
  confidence?: string
  createdAt?: { seconds: number }
}

function Badge({ label, color, bg }: { label: string; color: string; bg: string }) {
  return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 9999, fontSize: 11, fontWeight: 500, background: bg, color }}>{label}</span>
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'white', border: '1px solid #e5e5e5', borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', fontWeight: 600, fontSize: 13 }}>{title}</div>
      <div style={{ padding: '12px 16px' }}>{children}</div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 16, padding: '6px 0', borderBottom: '1px solid #f9f9f9', fontSize: 13 }}>
      <div style={{ width: 180, color: '#737373', flexShrink: 0 }}>{label}</div>
      <div style={{ flex: 1, wordBreak: 'break-all' }}>{value ?? <span style={{ color: '#d1d5db' }}>—</span>}</div>
    </div>
  )
}

export default function ManufacturerDetailPage() {
  const { uid } = useParams<{ uid: string }>()
  const router = useRouter()
  const [mfg, setMfg] = useState<MfgData | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [customerCount, setCustomerCount] = useState<number | null>(null)
  const [escalationCount, setEscalationCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  // Account actions
  const [suspendLoading, setSuspendLoading] = useState(false)

  // Delete account
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false)

  // Test agent run
  const [runEmail, setRunEmail] = useState('')
  const [runCompany, setRunCompany] = useState('')
  const [runMessage, setRunMessage] = useState('')
  const [runLoading, setRunLoading] = useState(false)
  const [runResult, setRunResult] = useState<TestRunResult | null>(null)

  async function toggleSuspend() {
    if (!mfg || !auth?.currentUser) return
    setSuspendLoading(true)
    try {
      const idToken = await auth.currentUser.getIdToken()
      const res = await fetch('/api/admin/toggle-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ uid, suspended: !mfg.adminSuspended }),
      })
      if (res.ok) setMfg(m => m ? { ...m, adminSuspended: !m.adminSuspended } : m)
    } finally {
      setSuspendLoading(false)
    }
  }

  async function deleteAccount() {
    if (!auth?.currentUser) return
    setDeleteLoading(true)
    try {
      const idToken = await auth.currentUser.getIdToken()
      const res = await fetch('/api/admin/delete-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ uid }),
      })
      if (res.ok) router.replace('/admin/manufacturers')
    } finally {
      setDeleteLoading(false)
    }
  }

  async function runTest() {
    if (!auth?.currentUser || !runMessage.trim()) return
    setRunLoading(true)
    setRunResult(null)
    try {
      const idToken = await auth.currentUser.getIdToken()
      const res = await fetch('/api/admin/trigger-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ uid, customerEmail: runEmail, customerCompany: runCompany, customerMessage: runMessage }),
      })
      const data = await res.json()
      setRunResult(data)
    } catch (err) {
      setRunResult({ error: err instanceof Error ? err.message : 'Unknown error' })
    } finally {
      setRunLoading(false)
    }
  }

  useEffect(() => {
    if (!uid) return
    Promise.all([
      getDoc(doc(db, 'manufacturers', uid)),
      getDocs(query(collection(db, 'manufacturers', uid, 'conversations'), orderBy('createdAt', 'desc'), limit(10))),
      getDocs(collection(db, 'manufacturers', uid, 'customers')),
      getDocs(query(collection(db, 'manufacturers', uid, 'escalations'))),
    ]).then(([mfgSnap, convSnap, custSnap, escSnap]) => {
      if (mfgSnap.exists()) setMfg(mfgSnap.data() as MfgData)
      setConversations(convSnap.docs.map(d => ({ id: d.id, ...d.data() } as Conversation)))
      setCustomerCount(custSnap.size)
      setEscalationCount(escSnap.docs.filter(d => d.data().status === 'open').length)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [uid])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 32, color: '#737373', fontSize: 13 }}>
      <div style={{ width: 16, height: 16, border: '2px solid #e5e5e5', borderTopColor: '#0a0a0a', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
      Loading…
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  if (!mfg) return (
    <div style={{ padding: 32 }}>
      <p style={{ color: '#991b1b' }}>Manufacturer not found.</p>
      <button onClick={() => router.back()} style={{ marginTop: 12, fontSize: 13, color: '#1e40af', background: 'none', border: 'none', cursor: 'pointer' }}>← Back</button>
    </div>
  )

  const watchExpiry = mfg.gmailWatchExpiry ? new Date(mfg.gmailWatchExpiry.seconds * 1000) : null
  const watchExpired = watchExpiry ? watchExpiry < new Date() : null

  return (
    <div style={{ padding: '28px 32px', maxWidth: 900 }}>
      <div style={{ marginBottom: 20 }}>
        <button onClick={() => router.back()} style={{ fontSize: 12, color: '#737373', background: 'none', border: 'none', cursor: 'pointer', marginBottom: 10, padding: 0 }}>
          ← Manufacturers
        </button>
        <h1 style={{ fontSize: '1.2rem', fontWeight: 700 }}>{mfg.displayName ?? mfg.email}</h1>
        <p style={{ color: '#737373', fontSize: '0.85rem', marginTop: 4, fontFamily: 'monospace' }}>{uid}</p>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Status', value: mfg.isLive ? <Badge label="Live" color="#166534" bg="#dcfce7" /> : <Badge label="Not live" color="#737373" bg="#f3f4f6" /> },
          { label: 'Plan', value: (() => {
            if (mfg.plan === 'pro')        return <Badge label="Pro" color="#fff" bg="#0a0a0a" />
            if (mfg.plan === 'starter')    return <Badge label="Starter" color="#1e40af" bg="#dbeafe" />
            if (mfg.plan === 'free_trial') {
              const days = mfg.trialEndsAt ? Math.ceil((mfg.trialEndsAt.seconds * 1000 - Date.now()) / 86400000) : null
              const expired = days !== null && days <= 0
              return <Badge label={expired ? 'Trial expired' : `Free Trial · ${days}d left`} color={expired ? '#991b1b' : '#6d28d9'} bg={expired ? '#fee2e2' : '#ede9fe'} />
            }
            return <span style={{ color: '#9ca3af', fontSize: 12 }}>No plan set</span>
          })() },
          { label: 'Draft mode', value: mfg.draftMode ? <Badge label="Draft mode on" color="#92400e" bg="#fef9c3" /> : <Badge label="Auto-send" color="#166534" bg="#dcfce7" /> },
          { label: 'Customers', value: <strong>{customerCount ?? '…'}</strong> },
          { label: 'Open escalations', value: <strong style={{ color: (escalationCount ?? 0) > 0 ? '#991b1b' : 'inherit' }}>{escalationCount ?? '…'}</strong> },
        ].map(({ label, value }) => (
          <div key={label} style={{ background: 'white', border: '1px solid #e5e5e5', borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontSize: 10, color: '#737373', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 13 }}>{value}</div>
          </div>
        ))}
      </div>

      <Section title="Account Info">
        <Row label="Email" value={mfg.email} />
        <Row label="Display name" value={mfg.displayName} />
        <Row label="Onboarding" value={mfg.onboardingComplete ? '✓ Complete' : 'In progress'} />
        <Row label="Plan started" value={mfg.planStartedAt ? new Date(mfg.planStartedAt.seconds * 1000).toLocaleDateString() : null} />
        <Row label="Trial ends" value={mfg.trialEndsAt ? new Date(mfg.trialEndsAt.seconds * 1000).toLocaleDateString() : null} />
        <Row label="Created" value={mfg.createdAt ? new Date(mfg.createdAt.seconds * 1000).toLocaleString() : null} />
      </Section>

      <Section title="Gmail Integration">
        <Row label="Connected" value={mfg.gmailConnected ? '✓ Yes' : '✗ No'} />
        <Row label="Gmail email" value={mfg.gmailEmail} />
        <Row label="History ID" value={mfg.gmailHistoryId ? <code style={{ fontSize: 11, background: '#f3f4f6', padding: '1px 6px', borderRadius: 4 }}>{mfg.gmailHistoryId}</code> : null} />
        <Row label="Watch expiry" value={
          watchExpiry
            ? <span style={{ color: watchExpired ? '#991b1b' : '#166534' }}>
                {watchExpiry.toLocaleString()} {watchExpired ? '⚠ Expired' : '✓ Active'}
              </span>
            : null
        } />
      </Section>

      <Section title="Agent Settings">
        <Row label="Response style" value={mfg.agentSettings?.responseStyle ?? 'professional'} />
        <Row label="Custom signature" value={mfg.agentSettings?.customSignature} />
        <Row label="Escalation triggers" value={
          (mfg.agentSettings?.escalationTriggers ?? []).length > 0
            ? (mfg.agentSettings!.escalationTriggers!.map((t, i) => (
                <span key={i} style={{ display: 'inline-block', margin: '1px 3px', padding: '1px 7px', background: '#fee2e2', color: '#991b1b', borderRadius: 9999, fontSize: 11 }}>{t}</span>
              )))
            : <span style={{ color: '#d1d5db' }}>None</span>
        } />
      </Section>

      <Section title={`Recent Conversations (last ${conversations.length})`}>
        {conversations.length === 0 ? (
          <p style={{ color: '#a3a3a3', fontSize: 13 }}>No conversations yet.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Date', 'Customer', 'Company', 'Status', 'Confidence'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '4px 8px', fontSize: 10, fontWeight: 700, color: '#737373', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {conversations.map(c => (
                <tr key={c.id} style={{ borderTop: '1px solid #f5f5f5' }}>
                  <td style={{ padding: '7px 8px', fontSize: 12, color: '#737373', whiteSpace: 'nowrap' }}>
                    {c.createdAt ? new Date(c.createdAt.seconds * 1000).toLocaleDateString() : '—'}
                  </td>
                  <td style={{ padding: '7px 8px', fontSize: 12, fontFamily: 'monospace' }}>{c.customerEmail ?? '—'}</td>
                  <td style={{ padding: '7px 8px', fontSize: 12 }}>{c.customerCompany ?? '—'}</td>
                  <td style={{ padding: '7px 8px' }}>
                    <span style={{
                      fontSize: 11, padding: '1px 7px', borderRadius: 9999, fontWeight: 500,
                      background: c.status === 'resolved' ? '#dcfce7' : c.status === 'escalated' ? '#fee2e2' : '#fef9c3',
                      color: c.status === 'resolved' ? '#166534' : c.status === 'escalated' ? '#991b1b' : '#92400e',
                    }}>{c.status ?? '—'}</span>
                  </td>
                  <td style={{ padding: '7px 8px', fontSize: 12 }}>{c.confidence ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
      <Section title="Account Actions">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '6px 0' }}>
          <div style={{ fontSize: 13, color: '#737373', width: 180, flexShrink: 0 }}>Suspension status</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {mfg.adminSuspended
              ? <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 9999, background: '#fee2e2', color: '#991b1b', fontWeight: 500 }}>Suspended</span>
              : <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 9999, background: '#f3f4f6', color: '#737373', fontWeight: 500 }}>Active</span>
            }
            <button
              onClick={toggleSuspend}
              disabled={suspendLoading}
              style={{
                padding: '5px 14px', fontSize: 12, fontWeight: 500, borderRadius: 7, cursor: 'pointer',
                background: mfg.adminSuspended ? '#0a0a0a' : 'transparent',
                color: mfg.adminSuspended ? 'white' : '#991b1b',
                border: mfg.adminSuspended ? 'none' : '1px solid #fca5a5',
              }}
            >
              {suspendLoading ? '…' : mfg.adminSuspended ? 'Reactivate' : 'Suspend account'}
            </button>
          </div>
        </div>
      </Section>

      <Section title="Test Agent Run">
        <p style={{ fontSize: 12, color: '#737373', marginBottom: 12 }}>
          Run the AI pipeline for this manufacturer without saving a conversation.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 520 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              value={runEmail}
              onChange={e => setRunEmail(e.target.value)}
              placeholder="customer@example.com"
              style={{ flex: 1, padding: '7px 10px', fontSize: 12, border: '1px solid #e5e5e5', borderRadius: 7 }}
            />
            <input
              value={runCompany}
              onChange={e => setRunCompany(e.target.value)}
              placeholder="Company name"
              style={{ flex: 1, padding: '7px 10px', fontSize: 12, border: '1px solid #e5e5e5', borderRadius: 7 }}
            />
          </div>
          <textarea
            value={runMessage}
            onChange={e => setRunMessage(e.target.value)}
            placeholder="Hi, I'd like to check on the status of my order PO-1234…"
            style={{ width: '100%', padding: '8px 10px', fontSize: 12, border: '1px solid #e5e5e5', borderRadius: 7, minHeight: 72, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
          />
          <button
            onClick={runTest}
            disabled={runLoading || !runMessage.trim()}
            style={{
              alignSelf: 'flex-start', padding: '7px 16px', background: '#0a0a0a', color: 'white',
              border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 500,
              cursor: runMessage.trim() ? 'pointer' : 'not-allowed', opacity: runMessage.trim() ? 1 : 0.5,
            }}
          >
            {runLoading ? 'Running…' : 'Run Test'}
          </button>
        </div>

        {runResult && (
          <div style={{ marginTop: 16, padding: 14, background: runResult.error ? '#fee2e2' : '#f9f9f9', borderRadius: 8, border: '1px solid #e5e5e5' }}>
            {runResult.error ? (
              <p style={{ color: '#991b1b', fontSize: 12, margin: 0 }}>Error: {runResult.error}</p>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#525252' }}>Result</span>
                  {runResult.confidence && (
                    <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 9999, background: '#dbeafe', color: '#1e40af', fontWeight: 500 }}>{runResult.confidence}</span>
                  )}
                  {runResult.poNumber && (
                    <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 9999, background: '#f3f4f6', color: '#525252', fontWeight: 500 }}>PO: {runResult.poNumber}</span>
                  )}
                  {(runResult.dataSources ?? []).map(s => (
                    <span key={s} style={{ fontSize: 10, padding: '1px 7px', borderRadius: 9999, background: '#dcfce7', color: '#166534', fontWeight: 500 }}>{s}</span>
                  ))}
                </div>
                <pre style={{ fontSize: 12, whiteSpace: 'pre-wrap', margin: 0, color: '#0a0a0a' }}>{runResult.response}</pre>
              </>
            )}
          </div>
        )}
      </Section>

      <Section title="Delete Account (GDPR)">
        <p style={{ fontSize: 12, color: '#991b1b', marginBottom: 12 }}>
          This permanently deletes all manufacturer data: conversations, customers, escalations, and the account itself. This cannot be undone.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 400 }}>
          <div style={{ fontSize: 12, color: '#737373' }}>
            Type <strong>{mfg.displayName ?? mfg.email}</strong> to confirm:
          </div>
          <input
            value={deleteConfirm}
            onChange={e => setDeleteConfirm(e.target.value)}
            placeholder={mfg.displayName ?? mfg.email ?? ''}
            style={{ padding: '7px 10px', fontSize: 12, border: '1px solid #fca5a5', borderRadius: 7 }}
          />
          <button
            onClick={deleteAccount}
            disabled={deleteLoading || deleteConfirm !== (mfg.displayName ?? mfg.email)}
            style={{
              alignSelf: 'flex-start', padding: '7px 16px', fontSize: 12, fontWeight: 500, borderRadius: 7,
              background: '#991b1b', color: 'white', border: 'none',
              cursor: deleteConfirm === (mfg.displayName ?? mfg.email) ? 'pointer' : 'not-allowed',
              opacity: deleteConfirm === (mfg.displayName ?? mfg.email) ? 1 : 0.4,
            }}
          >
            {deleteLoading ? 'Deleting…' : 'Delete account permanently'}
          </button>
        </div>
      </Section>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
