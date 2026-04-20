'use client'

import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/components/providers/FirebaseProvider'
import { collection, query, orderBy, onSnapshot, addDoc, doc, updateDoc, getDocs, where, limit, startAfter, serverTimestamp, Timestamp } from 'firebase/firestore'
import type { QueryDocumentSnapshot, DocumentData } from 'firebase/firestore'
import { db } from '@/lib/firebase-client'
import { formatDistanceToNow } from 'date-fns'

interface Customer {
  id: string
  companyName: string
  domain: string
  emails: string[]
  source: string
  status: 'active' | 'inactive'
}

interface ConvSummary {
  id: string
  status: string
  customerMessage: string
  createdAt: Timestamp
}

const STATUS_BADGE: Record<string, string> = {
  resolved: 'badge-green',
  escalated: 'badge-red',
  draft: 'badge-yellow',
  draft_discarded: 'badge-gray',
}

const PAGE_SIZE = 50

export default function CustomersPage() {
  const { user } = useAuth()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const lastDocRef = useRef<QueryDocumentSnapshot<DocumentData> | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDomain, setNewDomain] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [csvImporting, setCsvImporting] = useState(false)
  const [csvResult, setCsvResult] = useState<{ added: number; skipped: number } | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDomain, setEditDomain] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [search, setSearch] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [history, setHistory] = useState<ConvSummary[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // Real-time listener for first page
  useEffect(() => {
    if (!user) return
    lastDocRef.current = null
    setCustomers([])
    setLoading(true)

    const q = query(
      collection(db, 'manufacturers', user.uid, 'customers'),
      orderBy('companyName', 'asc'),
      limit(PAGE_SIZE + 1)
    )
    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs.slice(0, PAGE_SIZE).map((d) => ({ id: d.id, ...d.data() } as Customer))
      setHasMore(snap.docs.length > PAGE_SIZE)
      lastDocRef.current = snap.docs[PAGE_SIZE - 1] ?? null
      setCustomers(docs)
      setLoading(false)
    }, () => { setLoading(false) })
    return unsub
  }, [user])

  // Cursor-based "Load more"
  async function loadMore() {
    if (!user || !lastDocRef.current) return
    setLoadingMore(true)
    try {
      const q = query(
        collection(db, 'manufacturers', user.uid, 'customers'),
        orderBy('companyName', 'asc'),
        startAfter(lastDocRef.current),
        limit(PAGE_SIZE + 1)
      )
      const snap = await getDocs(q)
      const docs = snap.docs.slice(0, PAGE_SIZE).map((d) => ({ id: d.id, ...d.data() } as Customer))
      setHasMore(snap.docs.length > PAGE_SIZE)
      lastDocRef.current = snap.docs[PAGE_SIZE - 1] ?? null
      setCustomers(prev => [...prev, ...docs])
    } catch { /* ignore */ }
    setLoadingMore(false)
  }

  async function loadHistory(c: Customer) {
    if (!user) return
    setHistoryLoading(true)
    setHistory([])
    try {
      const snap = await getDocs(query(
        collection(db, 'manufacturers', user.uid, 'conversations'),
        where('customerCompany', '==', c.companyName),
        orderBy('createdAt', 'desc'),
        limit(20)
      ))
      setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() } as ConvSummary)))
    } catch {}
    setHistoryLoading(false)
  }

  function selectCustomer(c: Customer) {
    if (selectedCustomer?.id === c.id) {
      setSelectedCustomer(null)
    } else {
      setSelectedCustomer(c)
      loadHistory(c)
    }
  }

  async function handleAdd() {
    if (!user || !newName.trim() || !newDomain.trim()) return
    setSaving(true)
    await addDoc(collection(db, 'manufacturers', user.uid, 'customers'), {
      companyName: newName.trim(),
      domain: newDomain.trim().toLowerCase(),
      emails: newEmail.trim() ? [newEmail.trim()] : [],
      source: 'manual',
      status: 'active',
      createdAt: serverTimestamp(),
    })
    setNewName('')
    setNewDomain('')
    setNewEmail('')
    setShowAdd(false)
    setSaving(false)
  }

  async function handleCsvImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !user) return
    setCsvImporting(true)
    setCsvResult(null)
    try {
      const text = await file.text()
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
      const dataLines = lines[0]?.toLowerCase().includes('company') ? lines.slice(1) : lines
      let added = 0
      let skipped = 0
      for (const line of dataLines) {
        const parts = line.split(',').map(p => p.trim().replace(/^"|"$/g, ''))
        const companyName = parts[0]
        const email = parts[1]
        if (!companyName || !email || !email.includes('@')) { skipped++; continue }
        const domain = email.split('@')[1].toLowerCase()
        const existing = await getDocs(query(
          collection(db, 'manufacturers', user.uid, 'customers'),
          where('domain', '==', domain),
          limit(1)
        ))
        if (!existing.empty) { skipped++; continue }
        await addDoc(collection(db, 'manufacturers', user.uid, 'customers'), {
          companyName,
          domain,
          emails: [email],
          source: 'csv',
          status: 'active',
          createdAt: serverTimestamp(),
        })
        added++
      }
      setCsvResult({ added, skipped })
    } catch {
      setCsvResult({ added: 0, skipped: -1 })
    }
    setCsvImporting(false)
  }

  async function handleToggleStatus(id: string, current: 'active' | 'inactive') {
    if (!user) return
    await updateDoc(doc(db, 'manufacturers', user.uid, 'customers', id), {
      status: current === 'active' ? 'inactive' : 'active',
    })
  }

  function startEdit(c: Customer) {
    setEditingId(c.id)
    setEditName(c.companyName)
    setEditDomain(c.domain)
    setEditEmail(c.emails?.[0] ?? '')
  }

  async function handleSaveEdit(id: string) {
    if (!user || !editName.trim() || !editDomain.trim()) return
    await updateDoc(doc(db, 'manufacturers', user.uid, 'customers', id), {
      companyName: editName.trim(),
      domain: editDomain.trim().toLowerCase(),
      emails: editEmail.trim() ? [editEmail.trim()] : [],
    })
    setEditingId(null)
  }

  const filtered = customers.filter(c => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      c.companyName?.toLowerCase().includes(q) ||
      c.domain?.toLowerCase().includes(q) ||
      c.emails?.some(e => e.toLowerCase().includes(q))
    )
  })

  const active = customers.filter((c) => c.status === 'active')
  const inactive = customers.filter((c) => c.status === 'inactive')

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 4 }}>Customers</h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--gray-500)' }}>
            {active.length} active · {inactive.length} inactive
            {hasMore ? ' · more available' : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '0.5rem 1rem', fontSize: '0.875rem', fontWeight: 500,
            border: '1px solid var(--gray-200)', borderRadius: 8,
            cursor: csvImporting ? 'not-allowed' : 'pointer',
            background: 'var(--white)', color: 'var(--gray-600)',
          }}>
            {csvImporting ? 'Importing...' : 'Import CSV'}
            <input type="file" accept=".csv" onChange={handleCsvImport} style={{ display: 'none' }} disabled={csvImporting} />
          </label>
          <button onClick={() => setShowAdd(!showAdd)} className="btn-primary">
            + Add Customer
          </button>
        </div>
      </div>

      {csvResult && (
        <div style={{
          marginBottom: 16, padding: '10px 14px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 500,
          background: csvResult.skipped === -1 ? '#fee2e2' : '#dcfce7',
          color: csvResult.skipped === -1 ? '#991b1b' : '#166534',
          border: `1px solid ${csvResult.skipped === -1 ? '#fecaca' : '#bbf7d0'}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          {csvResult.skipped === -1
            ? 'Error reading CSV file. Please check the format and try again.'
            : `Imported ${csvResult.added} customer${csvResult.added !== 1 ? 's' : ''}${csvResult.skipped > 0 ? ` · ${csvResult.skipped} skipped (duplicates or missing data)` : ''}.`}
          <button onClick={() => setCsvResult(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', color: 'inherit', opacity: 0.6 }}>x</button>
        </div>
      )}

      {/* Add form */}
      {showAdd && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 600, marginBottom: 16 }}>Add Customer Manually</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--gray-600)', display: 'block', marginBottom: 4 }}>Company Name *</label>
              <input className="input-field" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Acme Corp" />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--gray-600)', display: 'block', marginBottom: 4 }}>Domain *</label>
              <input className="input-field" value={newDomain} onChange={(e) => setNewDomain(e.target.value)} placeholder="acme.com" />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--gray-600)', display: 'block', marginBottom: 4 }}>Email (optional)</label>
              <input className="input-field" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="orders@acme.com" />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleAdd} disabled={saving || !newName || !newDomain} className="btn-primary">
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button onClick={() => setShowAdd(false)} className="btn-secondary">Cancel</button>
          </div>
        </div>
      )}

      {/* Search */}
      <div style={{ marginBottom: 16 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by company, domain, or email..."
          style={{
            width: '100%', maxWidth: 360, padding: '0.4rem 0.75rem',
            border: '1px solid var(--gray-200)', borderRadius: 8, fontSize: '0.8rem', boxSizing: 'border-box',
          }}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selectedCustomer ? '1fr 380px' : '1fr', gap: 20, alignItems: 'start' }}>
        {/* Table */}
        <div>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--gray-200)' }}>
                  {['Company', 'Domain', 'Emails', 'Source', 'Status', ''].map((h) => (
                    <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: 'var(--gray-400)', fontSize: '0.875rem' }}>Loading...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: 'var(--gray-400)', fontSize: '0.875rem' }}>
                    {search ? 'No customers match your search.' : 'No customers yet. Add manually or scan Katana.'}
                  </td></tr>
                ) : filtered.map((c) =>
                  editingId === c.id ? (
                    <tr key={c.id} style={{ borderBottom: '1px solid var(--gray-100)', background: 'var(--gray-50)' }}>
                      <td style={{ padding: '0.5rem 1rem' }}>
                        <input className="input-field" value={editName} onChange={(e) => setEditName(e.target.value)} style={{ fontSize: '0.8rem' }} />
                      </td>
                      <td style={{ padding: '0.5rem 1rem' }}>
                        <input className="input-field" value={editDomain} onChange={(e) => setEditDomain(e.target.value)} style={{ fontSize: '0.8rem' }} />
                      </td>
                      <td style={{ padding: '0.5rem 1rem' }}>
                        <input className="input-field" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="email@company.com" style={{ fontSize: '0.8rem' }} />
                      </td>
                      <td style={{ padding: '0.5rem 1rem' }}>
                        <span className="badge-gray">{c.source}</span>
                      </td>
                      <td style={{ padding: '0.5rem 1rem' }}>
                        <span className={c.status === 'active' ? 'badge-green' : 'badge-gray'}>{c.status}</span>
                      </td>
                      <td style={{ padding: '0.5rem 1rem' }}>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => handleSaveEdit(c.id)} className="btn-primary" style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem' }}>Save</button>
                          <button onClick={() => setEditingId(null)} className="btn-secondary" style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem' }}>Cancel</button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr
                      key={c.id}
                      style={{
                        borderBottom: '1px solid var(--gray-100)',
                        background: selectedCustomer?.id === c.id ? 'var(--gray-50)' : undefined,
                        cursor: 'pointer',
                      }}
                      onClick={() => selectCustomer(c)}
                    >
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', fontWeight: 500 }}>{c.companyName}</td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', color: 'var(--gray-500)' }}>{c.domain}</td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', color: 'var(--gray-500)' }}>
                        {c.emails?.join(', ') || '—'}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span className="badge-gray">{c.source}</span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span className={c.status === 'active' ? 'badge-green' : 'badge-gray'}>
                          {c.status}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 12 }}>
                          <button
                            onClick={() => startEdit(c)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--gray-500)', textDecoration: 'underline' }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleToggleStatus(c.id, c.status)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--gray-400)', textDecoration: 'underline' }}
                          >
                            {c.status === 'active' ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>

          {hasMore && !loading && (
            <div style={{ marginTop: 12, textAlign: 'center' }}>
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="btn-secondary"
                style={{ fontSize: '0.8rem' }}
              >
                {loadingMore ? 'Loading...' : 'Load more'}
              </button>
            </div>
          )}

          {!loading && (
            <div style={{ marginTop: 8, fontSize: '0.75rem', color: 'var(--gray-400)', textAlign: 'right' }}>
              {filtered.length}{filtered.length < customers.length ? ` of ${customers.length}` : ''} customers
              {hasMore ? ' · more available' : ''}
            </div>
          )}
        </div>

        {/* Conversation history panel */}
        {selectedCustomer && (
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{selectedCustomer.companyName}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>Conversation history</div>
              </div>
              <button onClick={() => setSelectedCustomer(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: 'var(--gray-400)' }}>x</button>
            </div>

            {historyLoading ? (
              <div style={{ fontSize: '0.8rem', color: 'var(--gray-400)', padding: '1rem 0' }}>Loading...</div>
            ) : history.length === 0 ? (
              <div style={{ fontSize: '0.8rem', color: 'var(--gray-400)', padding: '1rem 0', textAlign: 'center' }}>
                No conversations found for this customer.
              </div>
            ) : (
              history.map(conv => (
                <div key={conv.id} style={{ borderBottom: '1px solid var(--gray-100)', paddingBottom: 10, marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span className={STATUS_BADGE[conv.status] ?? 'badge-gray'} style={{ fontSize: '0.7rem' }}>{conv.status}</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--gray-400)' }}>
                      {conv.createdAt?.toDate ? formatDistanceToNow(conv.createdAt.toDate(), { addSuffix: true }) : '—'}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--gray-600)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {conv.customerMessage?.slice(0, 70)}...
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
