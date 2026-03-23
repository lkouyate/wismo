import { NextRequest, NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebase-admin'
import { getKatanaCustomers } from '@/lib/katana'
import { FieldValue } from 'firebase-admin/firestore'

export async function POST(request: NextRequest) {
  try {
    const { idToken } = await request.json()
    if (!idToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const decoded = await adminAuth.verifyIdToken(idToken)
    const uid = decoded.uid

    const snap = await adminDb.collection('manufacturers').doc(uid).get()
    const mfg = snap.data()
    if (!mfg?.katanaApiKey) {
      return NextResponse.json({ error: 'Katana not connected' }, { status: 400 })
    }

    const { customers, contacts } = await getKatanaCustomers(mfg.katanaApiKey)

    const customersCollection = adminDb
      .collection('manufacturers')
      .doc(uid)
      .collection('customers')

    let added = 0
    const seen = new Set<string>()

    for (const c of customers as Record<string, unknown>[]) {
      const email = (c.email as string) ?? ''
      const name = (c.name as string) ?? 'Unknown'
      const domain = email.includes('@') ? email.split('@')[1] : ''

      if (!domain || seen.has(domain)) continue
      seen.add(domain)

      // Check if customer already exists
      const existing = await customersCollection
        .where('domain', '==', domain)
        .limit(1)
        .get()

      if (existing.empty) {
        await customersCollection.add({
          companyName: name,
          domain,
          emails: email ? [email] : [],
          source: 'katana',
          status: 'active',
          createdAt: FieldValue.serverTimestamp(),
        })
        added++
      }
    }

    // Process contacts
    for (const c of contacts as Record<string, unknown>[]) {
      const email = (c.email as string) ?? (c.contact_email as string) ?? ''
      const name = (c.name as string) ?? ''
      const domain = email.includes('@') ? email.split('@')[1] : ''

      if (!domain || seen.has(domain)) continue
      seen.add(domain)

      const existing = await customersCollection
        .where('domain', '==', domain)
        .limit(1)
        .get()

      if (existing.empty) {
        await customersCollection.add({
          companyName: name || domain,
          domain,
          emails: email ? [email] : [],
          source: 'katana',
          status: 'active',
          createdAt: FieldValue.serverTimestamp(),
        })
        added++
      }
    }

    return NextResponse.json({
      added,
      total: seen.size,
      katanaCustomers: customers.length,
      katanaContacts: contacts.length,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
