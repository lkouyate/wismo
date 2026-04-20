'use client'


import { useState, useEffect } from 'react'
import { useAuth } from '@/components/providers/FirebaseProvider'
import { doc, getDoc, updateDoc } from 'firebase/firestore'
import { db, auth } from '@/lib/firebase-client'

interface MfgData {
  katanaConnected: boolean
  upsConnected: boolean
  gmailConnected: boolean
  gmailEmail?: string
  gmailWatchExpiry?: number  // stored as ms timestamp
  qboConnected: boolean
}

export default function IntegrationsPage() {
  const { user } = useAuth()
  const [mfg, setMfg] = useState<MfgData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showKatanaRotate, setShowKatanaRotate] = useState(false)
  const [newKatanaKey, setNewKatanaKey] = useState('')
  const [savingKey, setSavingKey] = useState(false)
  const [keySaved, setKeySaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const [qboConnecting, setQboConnecting] = useState(false)
  const [qboDisconnecting, setQboDisconnecting] = useState(false)

  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.trywismo.co'}/api/gmail/webhook`

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

  async function handleSaveKatanaKey() {
    if (!user || !newKatanaKey.trim()) return
    setSavingKey(true)
    await updateDoc(doc(db, 'manufacturers', user.uid), {
      katanaApiKey: newKatanaKey.trim(),
      katanaConnected: true,
    })
    setMfg(prev => prev ? { ...prev, katanaConnected: true } : null)
    setSavingKey(false)
    setKeySaved(true)
    setNewKatanaKey('')
    setShowKatanaRotate(false)
    setTimeout(() => setKeySaved(false), 3000)
  }

  async function handleConnectQBO() {
    if (!user) return
    setQboConnecting(true)
    const idToken = await user.getIdToken()
    const res = await fetch('/api/quickbooks/connect', {
      headers: { Authorization: `Bearer ${idToken}` },
    })
    const data = await res.json()
    if (data.url) window.location.href = data.url
    else setQboConnecting(false)
  }

  async function handleDisconnectQBO() {
    if (!user || !confirm('Disconnect QuickBooks? WISMO will stop cross-checking invoices.')) return
    setQboDisconnecting(true)
    const idToken = await user.getIdToken()
    await fetch('/api/quickbooks/disconnect', {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}` },
    })
    setMfg((prev) => prev ? { ...prev, qboConnected: false } : null)
    setQboDisconnecting(false)
  }

  function copyWebhook() {
    navigator.clipboard.writeText(webhookUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  // Gmail watch status
  const watchExpiry = mfg?.gmailWatchExpiry ? new Date(mfg.gmailWatchExpiry) : null
  const watchDaysLeft = watchExpiry ? Math.ceil((watchExpiry.getTime() - Date.now()) / 86400000) : null
  const watchExpired = watchDaysLeft !== null && watchDaysLeft <= 0
  const watchExpiringSoon = watchDaysLeft !== null && watchDaysLeft > 0 && watchDaysLeft <= 2

  if (loading) return <div style={{ padding: '2rem', color: 'var(--gray-400)' }}>Loading...</div>

  return (
    <div style={{ padding: '2rem' }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 24 }}>Integrations</h1>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 640 }}>
        {/* Katana */}
        <div style={{ background: 'var(--white)', border: '1px solid var(--gray-200)', borderRadius: 'var(--border-radius-lg)', padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: 'var(--gray-50)', border: '1px solid var(--gray-200)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem' }}>📦</div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Katana OMS</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>Order management and inventory</div>
              </div>
            </div>
            {mfg?.katanaConnected ? <span className="badge-green">✓ Connected</span> : <span className="badge-red">Disconnected</span>}
          </div>

          <div style={{ marginTop: 12, fontSize: '0.8rem', color: 'var(--gray-500)' }}>
            {mfg?.katanaConnected ? 'Connected — reading orders and customers' : 'Not connected'}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            {mfg?.katanaConnected && (
              <button onClick={handleDisconnectKatana} className="btn-secondary" style={{ fontSize: '0.8rem', padding: '0.4rem 0.875rem' }}>
                Disconnect
              </button>
            )}
            {!mfg?.katanaConnected && (
              <a href="/onboarding/step-1" className="btn-primary" style={{ fontSize: '0.8rem', padding: '0.4rem 0.875rem', textDecoration: 'none' }}>Connect</a>
            )}
            {mfg?.katanaConnected && (
              <button
                onClick={() => setShowKatanaRotate(!showKatanaRotate)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--gray-500)', textDecoration: 'underline' }}
              >
                Update API key
              </button>
            )}
            {keySaved && <span style={{ fontSize: '0.75rem', color: '#166534' }}>✓ Key updated</span>}
          </div>

          {showKatanaRotate && (
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <input
                value={newKatanaKey}
                onChange={e => setNewKatanaKey(e.target.value)}
                placeholder="Paste new API key…"
                type="password"
                style={{ flex: 1, padding: '0.4rem 0.75rem', border: '1px solid var(--gray-200)', borderRadius: 8, fontSize: '0.8rem' }}
              />
              <button onClick={handleSaveKatanaKey} disabled={savingKey || !newKatanaKey.trim()} className="btn-primary" style={{ fontSize: '0.8rem', padding: '0.4rem 0.875rem' }}>
                {savingKey ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => { setShowKatanaRotate(false); setNewKatanaKey('') }} className="btn-secondary" style={{ fontSize: '0.8rem', padding: '0.4rem 0.875rem' }}>
                Cancel
              </button>
            </div>
          )}
        </div>

        {/* UPS */}
        <div style={{ background: 'var(--white)', border: '1px solid var(--gray-200)', borderRadius: 'var(--border-radius-lg)', padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: 'var(--gray-50)', border: '1px solid var(--gray-200)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem' }}>🚚</div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>UPS Tracking</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>Shipment tracking via UPS API</div>
              </div>
            </div>
            <span className="badge-gray">Platform</span>
          </div>
          <div style={{ marginTop: 12, fontSize: '0.8rem', color: 'var(--gray-500)' }}>Connected — platform-level, no setup required</div>
        </div>

        {/* Gmail */}
        <div style={{ background: 'var(--white)', border: '1px solid var(--gray-200)', borderRadius: 'var(--border-radius-lg)', padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: 'var(--gray-50)', border: '1px solid var(--gray-200)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem' }}>📧</div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Gmail</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>Inbox monitoring and auto-replies</div>
              </div>
            </div>
            {mfg?.gmailConnected ? <span className="badge-green">✓ Connected</span> : <span className="badge-red">Disconnected</span>}
          </div>

          <div style={{ marginTop: 12, fontSize: '0.8rem', color: 'var(--gray-500)' }}>
            {mfg?.gmailEmail ?? 'Not connected'}
          </div>

          {/* Gmail watch status */}
          {mfg?.gmailConnected && watchExpiry && (
            <div style={{
              marginTop: 10,
              fontSize: '0.75rem',
              padding: '6px 10px',
              borderRadius: 6,
              background: watchExpired ? '#fee2e2' : watchExpiringSoon ? '#fef9c3' : '#dcfce7',
              color: watchExpired ? '#991b1b' : watchExpiringSoon ? '#92400e' : '#166534',
            }}>
              {watchExpired
                ? '⚠ Gmail watch expired — run cron renewal in admin panel'
                : watchExpiringSoon
                  ? `⚠ Gmail watch expiring in ${watchDaysLeft} day${watchDaysLeft === 1 ? '' : 's'}`
                  : `✓ Gmail watch active — expires ${watchExpiry.toLocaleDateString()}`}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            {mfg?.gmailConnected && (
              <button onClick={handleDisconnectGmail} className="btn-secondary" style={{ fontSize: '0.8rem', padding: '0.4rem 0.875rem' }}>
                Disconnect
              </button>
            )}
            {!mfg?.gmailConnected && (
              <a href="/onboarding/step-4" className="btn-primary" style={{ fontSize: '0.8rem', padding: '0.4rem 0.875rem', textDecoration: 'none' }}>Connect</a>
            )}
          </div>
        </div>

        {/* QuickBooks */}
        <div style={{ background: 'var(--white)', border: '1px solid var(--gray-200)', borderRadius: 'var(--border-radius-lg)', padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: 'var(--gray-50)', border: '1px solid var(--gray-200)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem' }}>📊</div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>QuickBooks Online</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>Invoice cross-check for order status accuracy</div>
              </div>
            </div>
            {mfg?.qboConnected ? <span className="badge-green">✓ Connected</span> : <span className="badge-red">Disconnected</span>}
          </div>

          <div style={{ marginTop: 12, fontSize: '0.8rem', color: 'var(--gray-500)' }}>
            {mfg?.qboConnected
              ? 'Connected — WISMO cross-checks invoices before responding'
              : 'Connect to validate order status against QuickBooks invoices'}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
            {mfg?.qboConnected ? (
              <button
                onClick={handleDisconnectQBO}
                disabled={qboDisconnecting}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--gray-500)', textDecoration: 'underline', padding: 0 }}
              >
                {qboDisconnecting ? 'Disconnecting…' : 'Disconnect from QuickBooks'}
              </button>
            ) : (
              <button
                onClick={handleConnectQBO}
                disabled={qboConnecting}
                style={{ background: 'none', border: 'none', cursor: qboConnecting ? 'wait' : 'pointer', padding: 0, opacity: qboConnecting ? 0.6 : 1 }}
                aria-label="Connect to QuickBooks"
              >
                {/* Official Intuit "Connect to QuickBooks" button — do not modify */}
                {/* Download assets from Intuit Developer Portal and place in /public/ */}
                <img
                  src="/C2QB_green.svg"
                  alt="Connect to QuickBooks"
                  style={{ height: 36, display: 'block' }}
                  onMouseOver={e => { (e.currentTarget as HTMLImageElement).src = '/C2QB_green_hover.svg' }}
                  onMouseOut={e => { (e.currentTarget as HTMLImageElement).src = '/C2QB_green.svg' }}
                />
              </button>
            )}
          </div>
        </div>

        {/* FedEx */}
        <div style={{ background: 'var(--white)', border: '1px solid var(--gray-200)', borderRadius: 'var(--border-radius-lg)', padding: '1.25rem', opacity: 0.6 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: 'var(--gray-50)', border: '1px solid var(--gray-200)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem' }}>📬</div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>FedEx Tracking</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>Shipment tracking via FedEx API</div>
              </div>
            </div>
            <span className="badge-gray">Coming soon</span>
          </div>
        </div>

        {/* Webhook URL info */}
        <div style={{ background: 'var(--gray-50)', border: '1px solid var(--gray-200)', borderRadius: 'var(--border-radius-lg)', padding: '1rem 1.25rem' }}>
          <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: 8 }}>Gmail Webhook URL</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)', marginBottom: 8 }}>
            Register this endpoint in your GCP Pub/Sub topic as the push subscriber.
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <code style={{ flex: 1, fontSize: '0.75rem', background: 'white', border: '1px solid var(--gray-200)', padding: '5px 10px', borderRadius: 6, overflow: 'auto', whiteSpace: 'nowrap' }}>
              {webhookUrl}
            </code>
            <button
              onClick={copyWebhook}
              className="btn-secondary"
              style={{ fontSize: '0.75rem', padding: '0.3rem 0.75rem', flexShrink: 0 }}
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
