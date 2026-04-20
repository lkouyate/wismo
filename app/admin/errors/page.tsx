'use client'


import { useEffect, useState } from 'react'
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore'
import { db } from '@/lib/firebase-client'

interface ErrorLog {
  id: string
  uid?: string | null
  route?: string
  message?: string
  stack?: string | null
  details?: Record<string, unknown> | null
  createdAt?: { seconds: number }
}

export default function AdminErrorsPage() {
  const [logs, setLogs] = useState<ErrorLog[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getDocs(query(collection(db, 'errorLogs'), orderBy('createdAt', 'desc'), limit(100)))
      .then(snap => {
        setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() } as ErrorLog)))
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
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Error Log</h1>
        <p style={{ color: '#737373', fontSize: '0.85rem', marginTop: 4 }}>
          {logs.length === 0 ? 'No errors logged' : `${logs.length} recent errors (last 100)`}
        </p>
      </div>

      {logs.length === 0 ? (
        <div style={{ background: 'white', border: '1px solid #e5e5e5', borderRadius: 12, padding: '32px', textAlign: 'center', color: '#a3a3a3', fontSize: 13 }}>
          No errors recorded yet. Errors from the agent pipeline and Gmail webhook will appear here.
        </div>
      ) : (
        <div style={{ background: 'white', border: '1px solid #e5e5e5', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f7f7f7', borderBottom: '1px solid #e5e5e5' }}>
                {['Date', 'Route', 'UID', 'Error', ''].map(h => (
                  <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#525252', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <>
                  <tr
                    key={log.id}
                    style={{ borderTop: '1px solid #f0f0f0', cursor: log.stack ? 'pointer' : 'default' }}
                    onClick={() => log.stack && setExpanded(expanded === log.id ? null : log.id)}
                  >
                    <td style={{ padding: '9px 14px', fontSize: 11, color: '#737373', whiteSpace: 'nowrap' }}>
                      {log.createdAt ? new Date(log.createdAt.seconds * 1000).toLocaleString() : '—'}
                    </td>
                    <td style={{ padding: '9px 14px' }}>
                      <code style={{ fontSize: 11, background: '#f3f4f6', padding: '2px 6px', borderRadius: 4 }}>{log.route ?? '—'}</code>
                    </td>
                    <td style={{ padding: '9px 14px', fontSize: 11, fontFamily: 'monospace', color: '#a3a3a3' }}>{log.uid ?? '—'}</td>
                    <td style={{ padding: '9px 14px', fontSize: 12, color: '#991b1b', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.message ?? '—'}</td>
                    <td style={{ padding: '9px 14px', fontSize: 11, color: '#737373' }}>{log.stack ? (expanded === log.id ? '▲' : '▼') : ''}</td>
                  </tr>
                  {expanded === log.id && (
                    <tr key={`${log.id}-stack`} style={{ background: '#fafafa' }}>
                      <td colSpan={5} style={{ padding: '0 14px 12px 14px' }}>
                        <pre style={{ fontSize: 11, color: '#525252', whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0, background: '#f3f4f6', padding: 12, borderRadius: 6 }}>
                          {log.stack}
                          {log.details && `\n\nDetails:\n${JSON.stringify(log.details, null, 2)}`}
                        </pre>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
