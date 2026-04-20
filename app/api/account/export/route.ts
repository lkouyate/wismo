import { NextRequest, NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebase-admin'

const SENSITIVE = ['gmailAccessToken', 'gmailRefreshToken', 'katanaApiKey']

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7))
    const uid = decoded.uid

    // Manufacturer doc (exclude sensitive fields)
    const mfgSnap = await adminDb.collection('manufacturers').doc(uid).get()
    const mfgData = mfgSnap.exists ? mfgSnap.data() ?? {} : {}
    for (const key of SENSITIVE) delete mfgData[key]

    // Subcollections (up to 500 each)
    const [convSnap, custSnap, escSnap] = await Promise.all([
      adminDb.collection('manufacturers').doc(uid).collection('conversations').limit(500).get(),
      adminDb.collection('manufacturers').doc(uid).collection('customers').limit(500).get(),
      adminDb.collection('manufacturers').doc(uid).collection('escalations').limit(500).get(),
    ])

    const payload = {
      exportedAt: new Date().toISOString(),
      uid,
      profile: mfgData,
      conversations: convSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      customers: custSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      escalations: escSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    }

    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="wismo-export-${uid}.json"`,
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
