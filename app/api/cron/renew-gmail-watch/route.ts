import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { watchGmail } from '@/lib/gmail'
import { FieldValue } from 'firebase-admin/firestore'

// Called by Vercel Cron every 6 days (Gmail watches expire after 7 days)
// Requires CRON_SECRET env var — Vercel sets Authorization: Bearer <secret> automatically
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const topicName = process.env.GMAIL_PUBSUB_TOPIC
  if (!topicName) {
    return NextResponse.json({ error: 'GMAIL_PUBSUB_TOPIC not configured' }, { status: 500 })
  }

  const snapshot = await adminDb
    .collection('manufacturers')
    .where('gmailConnected', '==', true)
    .where('isLive', '==', true)
    .get()

  const results: Array<{ uid: string; success: boolean; error?: string }> = []

  for (const doc of snapshot.docs) {
    const mfg = doc.data()
    try {
      const watchResult = await watchGmail(mfg.gmailAccessToken, mfg.gmailRefreshToken, topicName)
      await doc.ref.update({
        gmailWatchExpiry: new Date(Number(watchResult.expiration)),
        gmailHistoryId: watchResult.historyId,
        updatedAt: FieldValue.serverTimestamp(),
      })
      results.push({ uid: doc.id, success: true })
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error'
      console.error(`Watch renewal failed for ${doc.id}:`, error)
      results.push({ uid: doc.id, success: false, error })
    }
  }

  const succeeded = results.filter((r) => r.success).length
  const failed = results.filter((r) => !r.success).length
  console.log(`Gmail watch renewal: ${succeeded} succeeded, ${failed} failed`)

  return NextResponse.json({ succeeded, failed, results })
}
