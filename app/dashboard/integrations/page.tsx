'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { useAuth } from '@/components/providers/FirebaseProvider'
import { doc, getDoc, updateDoc } from 'firebase/firestore'
import { db, auth } from '@/lib/firebase-client'

interface MfgData {
  katanaConnected: boolean
  upsConnected: boolean
  gmailConnected: boolean
  gmailEmail?: string
}

export default function IntegrationsPage() {
  const { user } = useAuth()
  const [mfg, setMfg] = useState<MfgData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    getDoc(doc(db, 'manufacturers', user.uid)).then((snap) => {
      if (snap.exists()) setMfg(snap.data() as MfgData)
      setLoading(false)
    })
  }, [user])

  async function handleDisconnectKatana() {
    if (!user || !confirm('Disconnect Katana? WISMO will not be able to look up orders.')) return
    await updateDoc(doc(db, 'manufacturers', user.uid), {
      katanaConnected: false,
      katanaApiKey: '',
    })
    setMfg((prev) => prev ? { ...prev, katanaConnected: false } : null)
  }

  async function handleDisconnectGmail() {
    if (!user || !confirm('Disconnect Gmail? WISMO will stop monitoring your inbox.')) return
    const idToken = await user.getIdToken()
    await fetch('/api/gmail/disconnect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    })
    setMfg((prev) => prev ? { ...prev, gmailConnected: false, gmailEmail: '' } : null)
  }

  const integrations = [
    {
      name: 'Katana OMS',
      description: 'Order management and inventory',
      icon: '📦',
      connected: mfg?.katanaConnected ?? false,
      detail: mfg?.katanaConnected ? 'Connected — reading orders and customers' : 'Not connected',
      onDisconnect: handleDisconnectKatana,
      reconnectHref: '/onboarding/step-1',
    },
    {
      name: 'UPS Tracking',
      description: 'Shipment tracking via UPS API',
      icon: '🚚',
      connected: true,
      detail: 'Connected — platform-level, no setup required',
      badge: 'Platform',
      onDisconnect: undefined,
    },
    {
      name: 'Gmail',
      description: 'Inbox monitoring and auto-replies',
      icon: '📧',
      connected: mfg?.gmailConnected ?? false,
      detail: mfg?.gmailEmail ?? 'Not connected',
      onDisconnect: handleDisconnectGmail,
      reconnectHref: '/onboarding/step-4',
    },
    {
      name: 'FedEx Tracking',
      description: 'Shipment tracking via FedEx API',
      icon: '📬',
      connected: false,
      detail: 'Coming soon',
      comingSoon: true,
    },
  ]

  if (loading) return <div style={{ padding: '2rem', color: 'var(--gray-400)' }}>Loading...</div>

  return (
    <div style={{ padding: '2rem' }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 24 }}>Integrations</h1>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 640 }}>
        {integrations.map((intg) => (
          <div key={intg.name} style={{
            background: 'var(--white)',
            border: '1px solid var(--gray-200)',
            borderRadius: 'var(--border-radius-lg)',
            padding: '1.25rem',
            opacity: intg.comingSoon ? 0.6 : 1,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 10,
                  background: 'var(--gray-50)', border: '1px solid var(--gray-200)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem',
                }}>
                  {intg.icon}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{intg.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>{intg.description}</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {intg.comingSoon ? (
                  <span className="badge-gray">Coming soon</span>
                ) : intg.badge ? (
                  <span className="badge-gray">{intg.badge}</span>
                ) : intg.connected ? (
                  <span className="badge-green">✓ Connected</span>
                ) : (
                  <span className="badge-red">Disconnected</span>
                )}
              </div>
            </div>

            <div style={{ marginTop: 12, fontSize: '0.8rem', color: 'var(--gray-500)' }}>
              {intg.detail}
            </div>

            {!intg.comingSoon && !intg.badge && (
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                {intg.connected && intg.onDisconnect && (
                  <button onClick={intg.onDisconnect} className="btn-secondary" style={{ fontSize: '0.8rem', padding: '0.4rem 0.875rem' }}>
                    Disconnect
                  </button>
                )}
                {!intg.connected && intg.reconnectHref && (
                  <a href={intg.reconnectHref} className="btn-primary" style={{ fontSize: '0.8rem', padding: '0.4rem 0.875rem', textDecoration: 'none' }}>
                    Connect
                  </a>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
