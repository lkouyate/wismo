import { NextRequest, NextResponse } from 'next/server'
import { OAuth2Client } from 'google-auth-library'
import { adminDb } from '@/lib/firebase-admin'
import { getGmailMessages } from '@/lib/gmail'
import { FieldValue } from 'firebase-admin/firestore'
import { logError } from '@/lib/log-error'
import { checkBillingAllowed } from '@/lib/billing'
import { generateRequestId } from '@/lib/request-id'
import { decryptToken, isEncrypted } from '@/lib/crypto'
import { enqueueEmailJobs, triggerWorker } from '@/lib/queue'
import { withSpan, recordApiMetrics, webhookEnqueued } from '@/lib/telemetry'

function safeDecrypt(value: string): string {
  return isEncrypted(value) ? decryptToken(value) : value
}

// Thin enqueue layer — returns 200 in ~200ms instead of 8-15s
export const maxDuration = 15

// Cap messages per webhook invocation
const MAX_MESSAGES_PER_WEBHOOK = 3

const authClient = new OAuth2Client()

async function verifyPubSubToken(authHeader: string | null): Promise<boolean> {
  if (!authHeader?.startsWith('Bearer ')) return false
  const token = authHeader.slice(7)
  const audience = `${process.env.NEXT_PUBLIC_APP_URL}/api/gmail/webhook`
  try {
    const ticket = await authClient.verifyIdToken({ idToken: token, audience })
    const payload = ticket.getPayload()
    const expectedEmail = process.env.PUBSUB_SERVICE_ACCOUNT_EMAIL
    if (expectedEmail && payload?.email !== expectedEmail) return false
    return !!payload
  } catch {
    return false
  }
}

interface PubSubMessage {
  message?: {
    data?: string
    attributes?: {
      emailAddress?: string
    }
  }
}

export async function POST(request: NextRequest) {
  const requestId = generateRequestId()
  const startTime = Date.now()
  try {
    // Verify auth
    const authHeader = request.headers.get('authorization')
    const isTestCall = process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`
    const valid = isTestCall || await verifyPubSubToken(authHeader)
    if (!valid) {
      console.warn('Webhook auth failed — header:', authHeader?.slice(0, 40))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json()) as PubSubMessage
    const rawData = body.message?.data
    if (!rawData) return NextResponse.json({ ok: true })

    // Track webhook delivery health (fire-and-forget)
    adminDb.doc('systemStatus/webhookLast').set({
      lastDelivery: FieldValue.serverTimestamp(),
      deliveryCount: FieldValue.increment(1),
    }, { merge: true }).catch(() => {})

    const decoded = JSON.parse(Buffer.from(rawData, 'base64').toString())
    const { emailAddress, historyId } = decoded

    // Find manufacturer
    const mfgQuery = await adminDb
      .collection('manufacturers')
      .where('gmailEmail', '==', emailAddress)
      .where('gmailConnected', '==', true)
      .where('isLive', '==', true)
      .select('gmailAccessToken', 'gmailRefreshToken', 'gmailEmail')
      .limit(1)
      .get()

    if (mfgQuery.empty) return NextResponse.json({ ok: true })

    const mfgDoc = mfgQuery.docs[0]
    const mfg = mfgDoc.data()

    // Billing gate — always return 200 to Pub/Sub
    const mfgFull = await adminDb.collection('manufacturers').doc(mfgDoc.id).get()
    const gate = checkBillingAllowed(mfgFull.data()!)
    if (!gate.allowed) {
      logError(mfgDoc.id, '/api/gmail/webhook', new Error(`Billing blocked: ${gate.reason}`)).catch(() => {})
      return NextResponse.json({ ok: true })
    }

    // Fetch messages from Gmail
    const gmailAccess = safeDecrypt(mfg.gmailAccessToken)
    const gmailRefresh = safeDecrypt(mfg.gmailRefreshToken)
    const messages = await getGmailMessages(gmailAccess, gmailRefresh, historyId)
    const batch = messages.slice(0, MAX_MESSAGES_PER_WEBHOOK)

    // Idempotency check + enqueue
    const jobsToEnqueue: Array<{
      manufacturerId: string
      messageId: string
      threadId: string
      from: string
      subject: string
      body: string
      historyId: string
    }> = []

    for (const msg of batch) {
      const msgDocRef = adminDb
        .collection('manufacturers')
        .doc(mfgDoc.id)
        .collection('processedMessages')
        .doc(msg.id)

      const alreadyProcessed = await msgDocRef.get()
      if (alreadyProcessed.exists) continue

      // Mark as processed immediately
      await msgDocRef.set({
        processedAt: FieldValue.serverTimestamp(),
        expireAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      })

      jobsToEnqueue.push({
        manufacturerId: mfgDoc.id,
        messageId: msg.id,
        threadId: msg.threadId,
        from: msg.from,
        subject: msg.subject,
        body: msg.body,
        historyId,
      })
    }

    // Enqueue jobs + trigger worker
    const enqueued = await enqueueEmailJobs(jobsToEnqueue)
    if (enqueued > 0) {
      webhookEnqueued.add(enqueued)
      triggerWorker()
    }

    recordApiMetrics('/api/gmail/webhook', 200, startTime)
    return NextResponse.json({ ok: true, enqueued, requestId })
  } catch (err) {
    console.error(`Webhook error [${requestId}]:`, err)
    await logError(null, '/api/gmail/webhook', err, { requestId })
    recordApiMetrics('/api/gmail/webhook', 500, startTime)
    return NextResponse.json({ error: 'Internal error', requestId }, { status: 500 })
  }
}
