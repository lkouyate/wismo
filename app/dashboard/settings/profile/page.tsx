'use client'


import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/providers/FirebaseProvider'
import { doc, getDoc, updateDoc } from 'firebase/firestore'
import { signOut } from 'firebase/auth'
import { db, auth } from '@/lib/firebase-client'

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Australia/Sydney',
  'Pacific/Auckland',
  'UTC',
]

interface NotificationPrefs {
  escalationAlerts: boolean
  slaBreaches: boolean
  weeklyDigest: boolean
}

export default function ProfileSettingsPage() {
  const { user } = useAuth()
  const router = useRouter()

  // Profile state
  const [displayName, setDisplayName] = useState('')
  const [companyLogoUrl, setCompanyLogoUrl] = useState('')
  const [timezone, setTimezone] = useState('UTC')
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>({
    escalationAlerts: true,
    slaBreaches: true,
    weeklyDigest: false,
  })

  // UI state
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Danger zone state
  const [exporting, setExporting] = useState(false)
  const [deleteEmail, setDeleteEmail] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    getDoc(doc(db, 'manufacturers', user.uid)).then(snap => {
      if (snap.exists()) {
        const d = snap.data()
        setDisplayName(d.displayName ?? user.displayName ?? '')
        setCompanyLogoUrl(d.companyLogoUrl ?? '')
        setTimezone(d.timezone ?? 'UTC')
        if (d.notificationPreferences) {
          setNotifPrefs({
            escalationAlerts: d.notificationPreferences.escalationAlerts ?? true,
            slaBreaches: d.notificationPreferences.slaBreaches ?? true,
            weeklyDigest: d.notificationPreferences.weeklyDigest ?? false,
          })
        }
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [user])

  async function handleSave() {
    if (!user) return
    setSaving(true)
    await updateDoc(doc(db, 'manufacturers', user.uid), {
      displayName,
      companyLogoUrl,
      timezone,
      notificationPreferences: notifPrefs,
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleExport() {
    if (!user || !auth?.currentUser) return
    setExporting(true)
    try {
      const idToken = await auth.currentUser.getIdToken()
      const res = await fetch('/api/account/export', {
        headers: { Authorization: `Bearer ${idToken}` },
      })
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `wismo-export-${user.uid}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  async function handleDelete() {
    if (!user || !auth?.currentUser) return
    if (deleteEmail !== user.email) {
      setDeleteError('Email does not match your account email.')
      return
    }
    setDeleting(true)
    setDeleteError(null)
    try {
      const idToken = await auth.currentUser.getIdToken()
      const res = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error ?? 'Delete failed')
      await signOut(auth)
      router.replace('/login')
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Delete failed')
      setDeleting(false)
    }
  }

  if (loading) return <div style={{ padding: '2rem', color: 'var(--gray-400)' }}>Loading...</div>

  return (
    <div style={{ padding: '2rem', maxWidth: 600 }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 24 }}>Profile & Account</h1>

      {/* Company Profile */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 600, marginBottom: 16 }}>Company Profile</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--gray-500)', marginBottom: 4 }}>
              COMPANY NAME
            </label>
            <input
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="Your company name"
              style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid var(--gray-200)', borderRadius: 8, fontSize: '0.875rem', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--gray-500)', marginBottom: 4 }}>
              LOGO URL
            </label>
            <input
              value={companyLogoUrl}
              onChange={e => setCompanyLogoUrl(e.target.value)}
              placeholder="https://example.com/logo.png"
              style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid var(--gray-200)', borderRadius: 8, fontSize: '0.875rem', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--gray-500)', marginBottom: 4 }}>
              TIMEZONE
            </label>
            <select
              value={timezone}
              onChange={e => setTimezone(e.target.value)}
              style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid var(--gray-200)', borderRadius: 8, fontSize: '0.875rem', background: 'white', boxSizing: 'border-box' }}
            >
              {TIMEZONES.map(tz => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Notification Preferences */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Notification Preferences</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--gray-400)', marginBottom: 14 }}>Email delivery coming soon — preferences saved for when it launches.</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {([
            { key: 'escalationAlerts' as const, label: 'Escalation alerts', desc: 'When a new escalation is created' },
            { key: 'slaBreaches' as const, label: 'SLA breach alerts', desc: 'When a response is overdue' },
            { key: 'weeklyDigest' as const, label: 'Weekly digest', desc: 'Summary of activity every Monday' },
          ]).map(({ key, label, desc }) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>{label}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--gray-400)' }}>{desc}</div>
              </div>
              <button
                onClick={() => setNotifPrefs(p => ({ ...p, [key]: !p[key] }))}
                style={{
                  width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer', flexShrink: 0,
                  background: notifPrefs[key] ? 'var(--black)' : 'var(--gray-200)',
                  position: 'relative', transition: 'background 0.2s',
                }}
              >
                <span style={{
                  position: 'absolute', top: 3, width: 16, height: 16, borderRadius: '50%', background: 'white',
                  left: notifPrefs[key] ? 21 : 3, transition: 'left 0.2s',
                }} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Save button */}
      <button onClick={handleSave} disabled={saving} className="btn-primary" style={{ marginBottom: 28 }}>
        {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Settings'}
      </button>

      {/* Connected Google Account */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>Connected Google Account</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>{user?.email}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--gray-400)', marginTop: 2 }}>Used for sign-in and Gmail integration</div>
          </div>
          <button
            onClick={() => auth && signOut(auth).then(() => router.replace('/login'))}
            className="btn-secondary"
            style={{ padding: '0.4rem 0.875rem', fontSize: '0.8rem' }}
          >
            Sign out & switch
          </button>
        </div>
      </div>

      {/* Danger Zone */}
      <div style={{ border: '1px solid #fecaca', borderRadius: 12, padding: '16px 20px', background: '#fff5f5' }}>
        <div style={{ fontWeight: 600, color: '#991b1b', marginBottom: 4 }}>Danger Zone</div>
        <div style={{ fontSize: '0.8rem', color: '#b91c1c', marginBottom: 16 }}>
          These actions are irreversible. Please proceed with caution.
        </div>

        {/* Export */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 14, borderBottom: '1px solid #fecaca', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>Export my data</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>Download all your conversations, customers, and settings as JSON</div>
          </div>
          <button
            onClick={handleExport}
            disabled={exporting}
            style={{ padding: '0.4rem 0.875rem', fontSize: '0.8rem', background: 'white', border: '1px solid #fecaca', borderRadius: 8, cursor: 'pointer', color: '#991b1b', flexShrink: 0 }}
          >
            {exporting ? 'Exporting…' : 'Export'}
          </button>
        </div>

        {/* Delete */}
        <div>
          <div style={{ fontSize: '0.875rem', fontWeight: 500, marginBottom: 8 }}>Delete account</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)', marginBottom: 10 }}>
            Type your email address to confirm permanent deletion of your account and all data.
          </div>
          <input
            value={deleteEmail}
            onChange={e => { setDeleteEmail(e.target.value); setDeleteError(null) }}
            placeholder={user?.email ?? 'your@email.com'}
            style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #fecaca', borderRadius: 8, fontSize: '0.875rem', marginBottom: 8, boxSizing: 'border-box', background: 'white' }}
          />
          {deleteError && <div style={{ fontSize: '0.75rem', color: '#991b1b', marginBottom: 8 }}>{deleteError}</div>}
          <button
            onClick={handleDelete}
            disabled={deleting || deleteEmail !== user?.email}
            style={{
              padding: '0.5rem 1rem', fontSize: '0.8rem', fontWeight: 600,
              background: deleteEmail === user?.email ? '#991b1b' : '#f3f4f6',
              color: deleteEmail === user?.email ? 'white' : 'var(--gray-400)',
              border: 'none', borderRadius: 8, cursor: deleteEmail === user?.email ? 'pointer' : 'default',
            }}
          >
            {deleting ? 'Deleting…' : 'Delete my account'}
          </button>
        </div>
      </div>
    </div>
  )
}
