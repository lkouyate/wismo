import { NextRequest, NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebase-admin'
import { watchGmail } from '@/lib/gmail'
import { logAudit } from '@/lib/log-audit'
import { FieldValue } from 'firebase-admin/firestore'

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7))
    if (!decoded.wismo_admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { job } = await request.json()
    if (job !== 'renew-gmail-watch') {
      return NextResponse.json({ error: 'Unknown job' }, { status: 400 })
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
        results.push({ uid: doc.id, success: false, error: err instanceof Error ? err.message : 'Unknown' })
      }
    }

    const succeeded = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length

    await adminDb.doc('systemStatus/cronLast').set({
      job: 'renew-gmail-watch',
      ranAt: FieldValue.serverTimestamp(),
      succeeded,
      failed,
      results,
      triggeredBy: 'admin',
      adminEmail: decoded.email ?? 'unknown',
    })

    await logAudit(decoded.email ?? 'unknown', 'run_cron', null, { job, succeeded, failed })
    return NextResponse.json({ succeeded, failed, results })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
