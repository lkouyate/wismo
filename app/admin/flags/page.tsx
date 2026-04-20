'use client'


import { useEffect, useState } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db, auth } from '@/lib/firebase-client'

interface Flags {
  webhookDebugMode: boolean
  autoRenewalEnabled: boolean
}

const FLAG_LABELS: Record<keyof Flags, { label: string; description: string }> = {
  webhookDebugMode: {
    label: 'Webhook Debug Mode',
    description: 'Log extra detail for each Gmail Pub/Sub event — useful when diagnosing pipeline issues.',
  },
  autoRenewalEnabled: {
    label: 'Auto Gmail Watch Renewal',
    description: 'Cron job at /api/cron/renew-gmail-watch automatically renews expiring Gmail push watches.',
  },
}

const DEFAULTS: Flags = { webhookDebugMode: false, autoRenewalEnabled: true }

export default function AdminFlagsPage() {
  const [flags, setFlags] = useState<Flags>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    getDoc(doc(db, 'platformConfig', 'featureFlags'))
      .then(snap => {
        if (snap.exists()) setFlags({ ...DEFAULTS, ...snap.data() as Flags })
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  async function toggle(key: keyof Flags) {
    const next = { ...flags, [key]: !flags[key] }
    setFlags(next)
    setSaving(true)
    setSaved(false)
    try {
      await setDoc(doc(db, 'platformConfig', 'featureFlags'), next)
      // Audit log
      if (auth?.currentUser) {
        const idToken = await auth.currentUser.getIdToken()
        fetch('/api/admin/log-audit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({ action: 'toggle_flag', details: { flag: key, value: !flags[key] } }),
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

  return (
    <div style={{ padding: '28px 32px', maxWidth: 700 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Feature Flags</h1>
        <p style={{ color: '#737373', fontSize: '0.85rem', marginTop: 4 }}>
          Platform-wide toggles. Changes take effect immediately.
          {saving && <span style={{ marginLeft: 8, color: '#737373' }}>Saving…</span>}
          {saved && <span style={{ marginLeft: 8, color: '#166534' }}>Saved ✓</span>}
        </p>
      </div>

      <div style={{ background: 'white', border: '1px solid #e5e5e5', borderRadius: 12, overflow: 'hidden' }}>
        {(Object.keys(FLAG_LABELS) as (keyof Flags)[]).map((key, i) => {
          const { label, description } = FLAG_LABELS[key]
          const on = flags[key]
          return (
            <div
              key={key}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderTop: i > 0 ? '1px solid #f0f0f0' : undefined }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{label}</div>
                <div style={{ fontSize: 12, color: '#737373', marginTop: 3 }}>{description}</div>
              </div>
              <button
                onClick={() => toggle(key)}
                style={{
                  width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                  background: on ? '#0a0a0a' : '#e5e5e5', position: 'relative', flexShrink: 0, marginLeft: 16,
                  transition: 'background 0.15s',
                }}
              >
                <span style={{
                  position: 'absolute', top: 3, left: on ? 22 : 3, width: 18, height: 18,
                  borderRadius: '50%', background: 'white', transition: 'left 0.15s',
                }} />
              </button>
            </div>
          )
        })}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
