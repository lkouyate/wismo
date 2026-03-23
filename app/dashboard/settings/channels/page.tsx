'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { useAuth } from '@/components/providers/FirebaseProvider'
import { doc, getDoc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase-client'

export default function ChannelsSettingsPage() {
  const { user } = useAuth()
  const [draftMode, setDraftMode] = useState(true)
  const [isLive, setIsLive] = useState(false)
  const [gmailEmail, setGmailEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    getDoc(doc(db, 'manufacturers', user.uid)).then((snap) => {
      if (snap.exists()) {
        const d = snap.data()
        setDraftMode(d.draftMode ?? true)
        setIsLive(d.isLive ?? false)
        setGmailEmail(d.gmailEmail ?? '')
      }
      setLoading(false)
    })
  }, [user])

  async function handleSave() {
    if (!user) return
    setSaving(true)
    await updateDoc(doc(db, 'manufacturers', user.uid), { draftMode })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handlePauseResume() {
    if (!user) return
    const newLive = !isLive
    await updateDoc(doc(db, 'manufacturers', user.uid), { isLive: newLive })
    setIsLive(newLive)
  }

  if (loading) return <div style={{ padding: '2rem', color: 'var(--gray-400)' }}>Loading...</div>

  return (
    <div style={{ padding: '2rem', maxWidth: 600 }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 24 }}>Channels</h1>

      {/* Live/Pause toggle */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>WISMO Agent Status</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--gray-500)' }}>
              {isLive ? 'Currently processing customer emails.' : 'Agent is paused — not processing new emails.'}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className={isLive ? 'badge-green' : 'badge-gray'}>
              {isLive ? '● Live' : '○ Paused'}
            </span>
            <button
              onClick={handlePauseResume}
              className={isLive ? 'btn-secondary' : 'btn-primary'}
              style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }}
            >
              {isLive ? 'Pause' : 'Resume'}
            </button>
          </div>
        </div>
      </div>

      {/* Response mode */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Response Mode</div>
        <div style={{ fontSize: '0.8rem', color: 'var(--gray-500)', marginBottom: 16 }}>
          Control whether WISMO sends replies automatically or holds them for your approval.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            {
              value: true,
              title: 'Draft Mode',
              desc: 'Responses are held for your review in the Drafts queue before sending.',
            },
            {
              value: false,
              title: 'Auto-send',
              desc: 'High-confidence responses are sent automatically. Medium/low are escalated.',
            },
          ].map((opt) => (
            <button
              key={String(opt.value)}
              onClick={() => setDraftMode(opt.value)}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 12,
                padding: '0.875rem', borderRadius: 9, cursor: 'pointer',
                border: `2px solid ${draftMode === opt.value ? 'var(--black)' : 'var(--gray-200)'}`,
                background: draftMode === opt.value ? 'var(--gray-50)' : 'var(--white)',
                textAlign: 'left',
              }}
            >
              <div style={{
                width: 16, height: 16, borderRadius: '50%', marginTop: 2, flexShrink: 0,
                border: `2px solid ${draftMode === opt.value ? 'var(--black)' : 'var(--gray-300)'}`,
                background: draftMode === opt.value ? 'var(--black)' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {draftMode === opt.value && <div style={{ width: 5, height: 5, background: 'white', borderRadius: '50%' }} />}
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{opt.title}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)', marginTop: 2 }}>{opt.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Gmail channel */}
      {gmailEmail && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Connected Gmail Inbox</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: '1.25rem' }}>📧</span>
            <div>
              <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>{gmailEmail}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>Monitoring for inbound orders inquiries</div>
            </div>
            <span className="badge-green" style={{ marginLeft: 'auto' }}>Active</span>
          </div>
        </div>
      )}

      <button onClick={handleSave} disabled={saving} className="btn-primary">
        {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save Settings'}
      </button>
    </div>
  )
}
