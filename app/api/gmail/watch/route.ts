import { NextRequest, NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebase-admin'
import { watchGmail } from '@/lib/gmail'
import { FieldValue } from 'firebase-admin/firestore'

export async function POST(request: NextRequest) {
  try {
    const { idToken } = await request.json()
    if (!idToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const decoded = await adminAuth.verifyIdToken(idToken)
    const uid = decoded.uid

    const mfgSnap = await adminDb.collection('manufacturers').doc(uid).get()
    const mfg = mfgSnap.data()
    if (!mfg) return NextResponse.json({ error: 'Manufacturer not found' }, { status: 404 })
    if (!mfg.gmailConnected || !mfg.gmailAccessToken) {
      return NextResponse.json({ error: 'Gmail not connected' }, { status: 400 })
    }

    const topicName = process.env.GMAIL_PUBSUB_TOPIC
    if (!topicName) {
      return NextResponse.json({ error: 'GMAIL_PUBSUB_TOPIC not configured' }, { status: 500 })
    }

    const watchResult = await watchGmail(mfg.gmailAccessToken, mfg.gmailRefreshToken, topicName)

    await adminDb.collection('manufacturers').doc(uid).set({
      gmailWatchExpiry: new Date(Number(watchResult.expiration)),
      gmailHistoryId: watchResult.historyId,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })

    return NextResponse.json({ success: true, expiration: watchResult.expiration })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
