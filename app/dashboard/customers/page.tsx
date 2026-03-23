'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { useAuth } from '@/components/providers/FirebaseProvider'
import { collection, query, orderBy, onSnapshot, addDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase-client'

interface Customer {
  id: string
  companyName: string
  domain: string
  emails: string[]
  source: string
  status: 'active' | 'inactive'
}

export default function CustomersPage() {
  const { user } = useAuth()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDomain, setNewDomain] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDomain, setEditDomain] = useState('')
  const [editEmail, setEditEmail] = useState('')

  useEffect(() => {
    if (!user) return
    const q = query(
      collection(db, 'manufacturers', user.uid, 'customers'),
      orderBy('companyName', 'asc')
    )
    const unsub = onSnapshot(q, (snap) => {
      setCustomers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Customer)))
      setLoading(false)
    })
    return unsub
  }, [user])

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

  const active = customers.filter((c) => c.status === 'active')
  const inactive = customers.filter((c) => c.status === 'inactive')

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 4 }}>Customers</h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--gray-500)' }}>
            {active.length} active · {inactive.length} inactive
          </p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="btn-primary">
          + Add Customer
        </button>
      </div>

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

      {/* Table */}
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
            ) : customers.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: 'var(--gray-400)', fontSize: '0.875rem' }}>No customers yet. Add manually or scan Katana.</td></tr>
            ) : customers.map((c) =>
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
                <tr key={c.id} style={{ borderBottom: '1px solid var(--gray-100)' }}>
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
                  <td style={{ padding: '0.75rem 1rem' }}>
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
    </div>
  )
}
