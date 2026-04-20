'use client'


import { useState, useEffect } from 'react'
import { useAuth } from '@/components/providers/FirebaseProvider'
import { doc, getDoc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase-client'

type ResponseStyle = 'professional' | 'friendly' | 'concise'

export default function AgentSettingsPage() {
  const { user } = useAuth()
  const [style, setStyle] = useState<ResponseStyle>('professional')
  const [signature, setSignature] = useState('')
  const [triggers, setTriggers] = useState<string[]>(['refund', 'damaged', 'wrong item', 'cancel order'])
  const [newTrigger, setNewTrigger] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!user) return
    getDoc(doc(db, 'manufacturers', user.uid)).then((snap) => {
      if (snap.exists()) {
        const s = snap.data().agentSettings
        if (s) {
          setStyle(s.responseStyle ?? 'professional')
          setSignature(s.customSignature ?? '')
          setTriggers(s.escalationTriggers ?? triggers)
        }
      }
    })
  }, [user])

  async function handleSave() {
    if (!user) return
    setSaving(true)
    await updateDoc(doc(db, 'manufacturers', user.uid), {
      agentSettings: {
        responseStyle: style,
        customSignature: signature,
        escalationTriggers: triggers,
      },
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function addTrigger() {
    if (!newTrigger.trim() || triggers.includes(newTrigger.trim())) return
    setTriggers([...triggers, newTrigger.trim()])
    setNewTrigger('')
  }

  return (
    <div style={{ padding: '2rem', maxWidth: 600 }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 24 }}>Agent Settings</h1>

      {/* Response style */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 600, marginBottom: 16 }}>Response Style</div>
        <div style={{ display: 'flex', gap: 12 }}>
          {(['professional', 'friendly', 'concise'] as ResponseStyle[]).map((s) => (
            <button
              key={s}
              onClick={() => setStyle(s)}
              style={{
                flex: 1, padding: '0.75rem',
                border: `2px solid ${style === s ? 'var(--black)' : 'var(--gray-200)'}`,
                borderRadius: 9, background: style === s ? 'var(--gray-50)' : 'var(--white)',
                cursor: 'pointer', fontWeight: style === s ? 600 : 400, fontSize: '0.875rem',
                textTransform: 'capitalize',
              }}
            >
              {s}
            </button>
          ))}
        </div>
        <div style={{ marginTop: 12, fontSize: '0.8rem', color: 'var(--gray-500)' }}>
          {style === 'professional' && 'Formal, structured responses suitable for B2B correspondence.'}
          {style === 'friendly' && 'Warm, conversational tone that builds customer rapport.'}
          {style === 'concise' && 'Brief, direct answers with bullet points for key information.'}
        </div>
      </div>

      {/* Signature */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>Custom Sign-off</div>
        <input
          className="input-field"
          value={signature}
          onChange={(e) => setSignature(e.target.value)}
          placeholder="e.g. The Acme Customer Team"
        />
        <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)', marginTop: 6 }}>
          Leave blank to use &quot;Customer Support Team&quot;
        </div>
      </div>

      {/* Escalation triggers */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Escalation Trigger Phrases</div>
        <div style={{ fontSize: '0.8rem', color: 'var(--gray-500)', marginBottom: 12 }}>
          If any of these phrases appear in a customer message, WISMO escalates to you instead of auto-responding.
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          {triggers.map((t) => (
            <span key={t} style={{
              background: 'var(--gray-100)', color: 'var(--gray-600)',
              padding: '0.25rem 0.75rem', borderRadius: 9999, fontSize: '0.8rem',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              {t}
              <button
                onClick={() => setTriggers(triggers.filter((x) => x !== t))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-400)', fontSize: '1rem', lineHeight: 1, padding: 0 }}
              >×</button>
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="input-field"
            value={newTrigger}
            onChange={(e) => setNewTrigger(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTrigger()}
            placeholder="Add trigger phrase..."
            style={{ flex: 1 }}
          />
          <button onClick={addTrigger} className="btn-secondary" style={{ padding: '0.625rem 1rem' }}>Add</button>
        </div>
      </div>

      <button onClick={handleSave} disabled={saving} className="btn-primary">
        {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save Settings'}
      </button>
    </div>
  )
}
