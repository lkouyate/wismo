import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { watchGmail } from '@/lib/gmail'
import { FieldValue } from 'firebase-admin/firestore'
import { withRetry } from '@/lib/retry'
import { sendAlert } from '@/lib/alert'
import { decryptToken, isEncrypted } from '@/lib/crypto'

function safeDecrypt(value: string): string {
  return isEncrypted(value) ? decryptToken(value) : value
}

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
    .select('gmailAccessToken', 'gmailRefreshToken', 'gmailEmail')
    .get()

  // Process in batches of 5 to avoid overwhelming Google API
  const BATCH_SIZE = 5
  const results: { uid: string; success: boolean; error?: string }[] = []

  for (let i = 0; i < snapshot.docs.length; i += BATCH_SIZE) {
    const batch = snapshot.docs.slice(i, i + BATCH_SIZE)
    const batchResults = await Promise.all(
      batch.map(async (mfgDoc) => {
        const mfg = mfgDoc.data()
        try {
          const accessToken = safeDecrypt(mfg.gmailAccessToken)
          const refreshToken = safeDecrypt(mfg.gmailRefreshToken)
          const watchResult = await withRetry(
            () => watchGmail(accessToken, refreshToken, topicName),
            { maxRetries: 3 }
          )
          await mfgDoc.ref.update({
            gmailWatchExpiry: new Date(Number(watchResult.expiration)),
            gmailHistoryId: watchResult.historyId,
            gmailWatchFailed: false,
            updatedAt: FieldValue.serverTimestamp(),
          })
          return { uid: mfgDoc.id, success: true }
        } catch (err) {
          const error = err instanceof Error ? err.message : 'Unknown error'
          console.error(`Watch renewal failed for ${mfgDoc.id}:`, error)

          // Flag the manufacturer's integration as broken
          await mfgDoc.ref.update({
            gmailWatchFailed: true,
            gmailWatchFailedAt: FieldValue.serverTimestamp(),
            gmailWatchFailReason: error,
          }).catch(() => {})

          // Alert on persistent failure
          sendAlert({
            severity: 'critical',
            title: 'Gmail watch renewal failed',
            message: `Manufacturer ${mfgDoc.id} will stop receiving emails. Error: ${error}`,
            route: '/api/cron/renew-gmail-watch',
            uid: mfgDoc.id,
          }).catch(() => {})

          return { uid: mfgDoc.id, success: false, error }
        }
      })
    )
    results.push(...batchResults)
  }

  const succeeded = results.filter((r) => r.success).length
  const failed = results.filter((r) => !r.success).length
  console.log(`Gmail watch renewal: ${succeeded} succeeded, ${failed} failed`)

  await adminDb.doc('systemStatus/cronLast').set({
    job: 'renew-gmail-watch',
    ranAt: FieldValue.serverTimestamp(),
    succeeded,
    failed,
    results,
    triggeredBy: 'cron',
  })

  return NextResponse.json({ succeeded, failed, results })
}
