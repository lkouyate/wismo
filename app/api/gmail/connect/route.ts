import { NextRequest, NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebase-admin'
import { watchGmail } from '@/lib/gmail'
import { FieldValue } from 'firebase-admin/firestore'

export async function POST(request: NextRequest) {
  try {
    const { idToken, accessToken, refreshToken, email } = await request.json()
    if (!idToken || !accessToken) {
      return NextResponse.json({ error: 'idToken and accessToken required' }, { status: 400 })
    }

    const decoded = await adminAuth.verifyIdToken(idToken)
    const uid = decoded.uid

    // Store Gmail tokens first
    await adminDb.collection('manufacturers').doc(uid).update({
      gmailConnected: true,
      gmailEmail: email ?? '',
      gmailAccessToken: accessToken,
      gmailRefreshToken: refreshToken ?? '',
      updatedAt: FieldValue.serverTimestamp(),
    })

    // Register Gmail watch — non-fatal if it fails
    const topicName = process.env.GMAIL_PUBSUB_TOPIC
    let watchError: string | null = null
    if (topicName) {
      try {
        const watchResult = await watchGmail(accessToken, refreshToken ?? '', topicName)
        await adminDb.collection('manufacturers').doc(uid).update({
          gmailWatchExpiry: new Date(Number(watchResult.expiration)),
          gmailHistoryId: watchResult.historyId,
          updatedAt: FieldValue.serverTimestamp(),
        })
      } catch (err) {
        watchError = err instanceof Error ? err.message : 'Watch registration failed'
        console.error('watchGmail failed:', watchError)
      }
    }

    return NextResponse.json({ success: true, watchError })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
