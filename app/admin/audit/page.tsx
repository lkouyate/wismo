'use client'


import { useEffect, useState } from 'react'
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore'
import { db } from '@/lib/firebase-client'

interface AuditEntry {
  id: string
  adminEmail?: string
  action?: string
  targetUid?: string | null
  details?: Record<string, unknown> | null
  createdAt?: { seconds: number }
}

const ACTION_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  suspend:               { label: 'Suspend',         color: '#991b1b', bg: '#fee2e2' },
  reactivate:            { label: 'Reactivate',      color: '#166534', bg: '#dcfce7' },
  delete_account:        { label: 'Delete account',  color: '#fff',    bg: '#0a0a0a' },
  trigger_run:           { label: 'Trigger run',     color: '#6d28d9', bg: '#ede9fe' },
  run_cron:              { label: 'Run cron',        color: '#0369a1', bg: '#dbeafe' },
  publish_announcement:  { label: 'Announcement on', color: '#92400e', bg: '#fef9c3' },
  clear_announcement:    { label: 'Announcement off',color: '#737373', bg: '#f3f4f6' },
  toggle_flag:           { label: 'Flag toggled',    color: '#1e40af', bg: '#dbeafe' },
}

export default function AdminAuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getDocs(query(collection(db, 'auditLog'), orderBy('createdAt', 'desc'), limit(200)))
      .then(snap => {
        setEntries(snap.docs.map(d => ({ id: d.id, ...d.data() } as AuditEntry)))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 32, color: '#737373', fontSize: 13 }}>
      <div style={{ width: 16, height: 16, border: '2px solid #e5e5e5', borderTopColor: '#0a0a0a', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
      Loading…
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  return (
    <div style={{ padding: '28px 32px', maxWidth: 960 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Audit Log</h1>
        <p style={{ color: '#737373', fontSize: '0.85rem', marginTop: 4 }}>
          {entries.length === 0 ? 'No audit entries yet.' : `${entries.length} recent entries (last 200)`}
        </p>
      </div>

      {entries.length === 0 ? (
        <div style={{ background: 'white', border: '1px solid #e5e5e5', borderRadius: 12, padding: 32, textAlign: 'center', color: '#a3a3a3', fontSize: 13 }}>
          Admin actions (suspend, trigger run, flag changes, announcements) will appear here.
        </div>
      ) : (
        <div style={{ background: 'white', border: '1px solid #e5e5e5', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f7f7f7', borderBottom: '1px solid #e5e5e5' }}>
                {['Date', 'Admin', 'Action', 'Target UID', ''].map(h => (
                  <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#525252', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map(e => {
                const badge = ACTION_LABELS[e.action ?? '']
                const hasDetails = e.details && Object.keys(e.details).length > 0
                return (
                  <>
                    <tr
                      key={e.id}
                      style={{ borderTop: '1px solid #f0f0f0', cursor: hasDetails ? 'pointer' : 'default' }}
                      onClick={() => hasDetails && setExpanded(expanded === e.id ? null : e.id)}
                    >
                      <td style={{ padding: '9px 14px', fontSize: 11, color: '#737373', whiteSpace: 'nowrap' }}>
                        {e.createdAt ? new Date(e.createdAt.seconds * 1000).toLocaleString() : '—'}
                      </td>
                      <td style={{ padding: '9px 14px', fontSize: 12, fontFamily: 'monospace', color: '#525252' }}>
                        {e.adminEmail ?? '—'}
                      </td>
                      <td style={{ padding: '9px 14px' }}>
                        {badge ? (
                          <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 9999, fontSize: 11, fontWeight: 500, background: badge.bg, color: badge.color }}>{badge.label}</span>
                        ) : (
                          <code style={{ fontSize: 11, background: '#f3f4f6', padding: '2px 6px', borderRadius: 4 }}>{e.action ?? '—'}</code>
                        )}
                      </td>
                      <td style={{ padding: '9px 14px', fontSize: 11, fontFamily: 'monospace', color: '#a3a3a3' }}>{e.targetUid ?? '—'}</td>
                      <td style={{ padding: '9px 14px', fontSize: 11, color: '#737373' }}>{hasDetails ? (expanded === e.id ? '▲' : '▼') : ''}</td>
                    </tr>
                    {expanded === e.id && (
                      <tr key={`${e.id}-details`} style={{ background: '#fafafa' }}>
                        <td colSpan={5} style={{ padding: '0 14px 12px 14px' }}>
                          <pre style={{ fontSize: 11, color: '#525252', whiteSpace: 'pre-wrap', margin: 0, background: '#f3f4f6', padding: 10, borderRadius: 6 }}>
                            {JSON.stringify(e.details, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
