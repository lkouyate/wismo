'use client'


import { useEffect, useState } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db, auth } from '@/lib/firebase-client'

type Level = 'info' | 'warning' | 'error'

interface Announcement {
  active: boolean
  message: string
  level: Level
}

const LEVEL_COLORS: Record<Level, { bg: string; color: string; label: string }> = {
  info:    { bg: '#dbeafe', color: '#1e40af', label: 'Info' },
  warning: { bg: '#fef9c3', color: '#92400e', label: 'Warning' },
  error:   { bg: '#fee2e2', color: '#991b1b', label: 'Error' },
}

export default function AdminAnnouncementPage() {
  const [ann, setAnn] = useState<Announcement>({ active: false, message: '', level: 'info' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    getDoc(doc(db, 'platformConfig', 'announcement'))
      .then(snap => {
        if (snap.exists()) setAnn(snap.data() as Announcement)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  async function save(patch: Partial<Announcement>) {
    const next = { ...ann, ...patch }
    setAnn(next)
    setSaving(true)
    setSaved(false)
    try {
      await setDoc(doc(db, 'platformConfig', 'announcement'), next)
      // Audit log
      if (auth?.currentUser) {
        const idToken = await auth.currentUser.getIdToken()
        fetch('/api/admin/log-audit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({ action: next.active ? 'publish_announcement' : 'clear_announcement', details: { message: next.message, level: next.level } }),
        }).catch(() => {})
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 32, color: '#737373', fontSize: 13 }}>
      <div style={{ width: 16, height: 16, border: '2px solid #e5e5e5', borderTopColor: '#0a0a0a', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
      Loading…
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  const { bg, color } = LEVEL_COLORS[ann.level]

  return (
    <div style={{ padding: '28px 32px', maxWidth: 700 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Platform Announcement</h1>
        <p style={{ color: '#737373', fontSize: '0.85rem', marginTop: 4 }}>
          Displayed as a banner to all manufacturers when they open their dashboard.
          {saving && <span style={{ marginLeft: 8, color: '#737373' }}>Saving…</span>}
          {saved && <span style={{ marginLeft: 8, color: '#166534' }}>Saved ✓</span>}
        </p>
      </div>

      {/* Current status */}
      <div style={{ marginBottom: 20 }}>
        {ann.active && ann.message ? (
          <div style={{ background: bg, color, borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 12 }}>
            <strong>Live preview:</strong> {ann.message}
          </div>
        ) : (
          <div style={{ background: '#f9f9f9', border: '1px solid #e5e5e5', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#a3a3a3' }}>
            No active announcement — manufacturers see nothing.
          </div>
        )}
      </div>

      <div style={{ background: 'white', border: '1px solid #e5e5e5', borderRadius: 12, padding: '20px' }}>
        {/* Level selector */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Level</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['info', 'warning', 'error'] as Level[]).map(l => {
              const c = LEVEL_COLORS[l]
              const selected = ann.level === l
              return (
                <button
                  key={l}
                  onClick={() => save({ level: l })}
                  style={{
                    padding: '4px 12px', borderRadius: 9999, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                    background: selected ? c.bg : '#f3f4f6',
                    color: selected ? c.color : '#737373',
                    border: selected ? `1.5px solid ${c.color}` : '1.5px solid transparent',
                  }}
                >
                  {c.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Message */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Message</div>
          <textarea
            value={ann.message}
            onChange={e => setAnn(a => ({ ...a, message: e.target.value }))}
            placeholder="E.g. Scheduled maintenance tonight 11 PM – 1 AM UTC. The agent pipeline will be briefly unavailable."
            style={{ width: '100%', padding: '10px 12px', fontSize: 13, border: '1px solid #e5e5e5', borderRadius: 8, resize: 'vertical', minHeight: 80, boxSizing: 'border-box', fontFamily: 'inherit' }}
          />
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => save({ active: true })}
            disabled={!ann.message.trim() || saving}
            style={{
              padding: '8px 18px', background: '#0a0a0a', color: 'white', border: 'none', borderRadius: 8,
              fontSize: 13, fontWeight: 500, cursor: ann.message.trim() ? 'pointer' : 'not-allowed', opacity: ann.message.trim() ? 1 : 0.5,
            }}
          >
            Publish
          </button>
          <button
            onClick={() => save({ active: false, message: '' })}
            disabled={saving}
            style={{ padding: '8px 18px', background: 'transparent', color: '#737373', border: '1px solid #e5e5e5', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}
          >
            Clear
          </button>
          {ann.active && <span style={{ alignSelf: 'center', fontSize: 12, color: '#166534' }}>● Live</span>}
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
