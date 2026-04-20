import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { sendEmail } from '@/lib/gmail'
import { extractPONumber, generateWISMOResponse } from '@/lib/anthropic'
import { getKatanaOrder } from '@/lib/katana'
import { trackShipment } from '@/lib/carriers'
import { ensureFreshQBOToken, getQBOInvoiceByPO } from '@/lib/quickbooks'
import type { QBOInvoice } from '@/types'
import { FieldValue } from 'firebase-admin/firestore'
import { logError } from '@/lib/log-error'
import { checkAndIncrementUsage } from '@/lib/billing'
import { dequeueEmailJob, ackJob, nackJob, type EmailJob } from '@/lib/queue'
import { decryptToken, isEncrypted } from '@/lib/crypto'
import { withSpan } from '@/lib/telemetry'

export const maxDuration = 60

function safeDecrypt(value: string): string {
  return isEncrypted(value) ? decryptToken(value) : value
}

// Process up to 5 jobs per worker invocation
const MAX_JOBS_PER_RUN = 5

async function processJob(job: EmailJob): Promise<void> {
  const mfgDoc = await adminDb.collection('manufacturers').doc(job.manufacturerId).get()
  const mfg = mfgDoc.data()
  if (!mfg) throw new Error(`Manufacturer ${job.manufacturerId} not found`)

  const senderEmail = job.from.match(/<(.+)>/)?.[1] ?? job.from.trim()

  // Skip self-sent emails
  if (senderEmail.toLowerCase() === mfg.gmailEmail?.toLowerCase()) return

  const senderDomain = senderEmail.split('@')[1]

  // PO extraction + customer lookup in parallel
  const poPromise = extractPONumber(job.body).catch(() => null)

  const customerQuery = await adminDb
    .collection('manufacturers')
    .doc(job.manufacturerId)
    .collection('customers')
    .where('domain', '==', senderDomain)
    .where('status', '==', 'active')
    .limit(1)
    .get()

  if (customerQuery.empty) {
    const ORDER_KEYWORDS = ['order', 'po#', 'po number', 'purchase order', 'sales order', ' so ', 'so#', 'tracking', 'shipment', 'delivery', 'dispatch', 'invoice', 'ship']
    const combined = `${job.subject} ${job.body}`.toLowerCase()
    const isOrderRelated = ORDER_KEYWORDS.some(kw => combined.includes(kw))
    if (!isOrderRelated) return

    const convRef = await adminDb
      .collection('manufacturers')
      .doc(job.manufacturerId)
      .collection('conversations')
      .add({
        customerEmail: senderEmail,
        customerCompany: senderDomain,
        customerMessage: job.body,
        agentResponse: '',
        status: 'escalated',
        confidence: 'needs_attention',
        dataSources: [],
        originalMessageId: job.messageId,
        originalSubject: job.subject,
        isDraft: false,
        draftEditedByManufacturer: false,
        slaDeadline: new Date(Date.now() + 60 * 60 * 1000),
        sentAt: null,
        createdAt: FieldValue.serverTimestamp(),
      })

    await adminDb
      .collection('manufacturers')
      .doc(job.manufacturerId)
      .collection('escalations')
      .add({
        conversationId: convRef.id,
        reason: 'Unknown sender domain',
        slaDeadline: new Date(Date.now() + 60 * 60 * 1000),
        status: 'open',
        assignedTo: null,
        internalNotes: [],
        createdAt: FieldValue.serverTimestamp(),
      })
    return
  }

  const customer = customerQuery.docs[0].data()

  // Check escalation triggers
  const escalationTriggers: string[] = mfg.agentSettings?.escalationTriggers ?? []
  const lowerBody = job.body.toLowerCase()
  const triggeredPhrase = escalationTriggers.find((phrase: string) =>
    lowerBody.includes(phrase.toLowerCase())
  )

  if (triggeredPhrase) {
    const convRef = await adminDb
      .collection('manufacturers')
      .doc(job.manufacturerId)
      .collection('conversations')
      .add({
        customerEmail: senderEmail,
        customerCompany: customer.companyName,
        customerMessage: job.body,
        agentResponse: '',
        status: 'escalated',
        confidence: 'needs_attention',
        dataSources: [],
        originalMessageId: job.messageId,
        originalSubject: job.subject,
        isDraft: false,
        draftEditedByManufacturer: false,
        slaDeadline: new Date(Date.now() + 60 * 60 * 1000),
        sentAt: null,
        createdAt: FieldValue.serverTimestamp(),
      })

    await adminDb
      .collection('manufacturers')
      .doc(job.manufacturerId)
      .collection('escalations')
      .add({
        conversationId: convRef.id,
        reason: `Trigger phrase detected: "${triggeredPhrase}"`,
        slaDeadline: new Date(Date.now() + 60 * 60 * 1000),
        status: 'open',
        assignedTo: null,
        internalNotes: [],
        createdAt: FieldValue.serverTimestamp(),
      })
    return
  }

  const poNumber = await poPromise

  // Parallel data lookups
  let orderData: unknown = null
  let trackingData = null
  let qboData: QBOInvoice | null = null

  if (poNumber) {
    const [katanaResult, qboResult] = await Promise.allSettled([
      mfg.katanaApiKey
        ? getKatanaOrder(mfg.katanaApiKey, poNumber)
        : Promise.resolve(null),
      mfg.qboConnected && mfg.qboRealmId
        ? ensureFreshQBOToken(mfg as Record<string, unknown>, job.manufacturerId)
            .then(({ accessToken: qboToken }) =>
              getQBOInvoiceByPO(mfg.qboRealmId as string, qboToken, poNumber)
            )
        : Promise.resolve(null),
    ])

    orderData = katanaResult.status === 'fulfilled' ? katanaResult.value : null
    qboData = qboResult.status === 'fulfilled' ? qboResult.value : null

    if (qboData && orderData) {
      const order = orderData as Record<string, unknown>
      const katanaStatus = String(order.status ?? '').toLowerCase()
      if (katanaStatus.includes('ship') && qboData.status === 'not_invoiced') {
        order.status = 'expected_ship'
      }
      if (!order.tracking_number && qboData.trackingNum) {
        order.tracking_number = qboData.trackingNum
      }
    }

    if (orderData) {
      const order = orderData as Record<string, unknown>
      const trackingNum = order.tracking_number as string | undefined
      if (trackingNum) {
        try { trackingData = await trackShipment(trackingNum) } catch { /* non-blocking */ }
      }
    }
  }

  const { response, confidence, dataSources } = await generateWISMOResponse({
    customerEmail: senderEmail,
    customerCompany: customer.companyName,
    customerMessage: job.body,
    orderData: orderData as Record<string, unknown> | null,
    trackingData,
    qboData,
    responseStyle: mfg.agentSettings?.responseStyle ?? 'professional',
  })

  const isDraft = mfg.draftMode ?? true
  const slaDeadline = new Date(Date.now() + 60 * 60 * 1000)
  const subject = job.subject ? `Re: ${job.subject}` : 'Re: Order Status Update'

  // Auto-send when draftMode = false
  if (!isDraft) {
    const gmailAccess = safeDecrypt(mfg.gmailAccessToken)
    const gmailRefresh = safeDecrypt(mfg.gmailRefreshToken)
    try {
      await sendEmail({
        accessToken: gmailAccess,
        refreshToken: gmailRefresh,
        to: senderEmail,
        subject,
        body: response,
        fromEmail: mfg.gmailEmail,
        inReplyTo: job.messageId,
        references: job.messageId,
      })
    } catch (sendErr) {
      console.error('Auto-send failed, falling back to draft:', sendErr)
      await adminDb
        .collection('manufacturers')
        .doc(job.manufacturerId)
        .collection('conversations')
        .add({
          customerEmail: senderEmail,
          customerCompany: customer.companyName,
          customerMessage: job.body,
          agentResponse: response,
          status: 'draft',
          confidence,
          dataSources,
          poNumber: poNumber ?? '',
          originalMessageId: job.messageId,
          originalSubject: job.subject,
          isDraft: true,
          draftEditedByManufacturer: false,
          slaDeadline,
          sentAt: null,
          createdAt: FieldValue.serverTimestamp(),
        })
      return
    }
  }

  // Write conversation + increment billing atomically
  const convRef = adminDb
    .collection('manufacturers')
    .doc(job.manufacturerId)
    .collection('conversations')
    .doc()
  const mfgRef = adminDb.collection('manufacturers').doc(job.manufacturerId)

  const batch = adminDb.batch()
  batch.set(convRef, {
    customerEmail: senderEmail,
    customerCompany: customer.companyName,
    customerMessage: job.body,
    agentResponse: response,
    status: isDraft ? 'draft' : 'resolved',
    confidence,
    dataSources,
    poNumber: poNumber ?? '',
    originalMessageId: job.messageId,
    originalSubject: job.subject,
    isDraft,
    draftEditedByManufacturer: false,
    slaDeadline,
    sentAt: isDraft ? null : new Date(),
    requestId: job.id,
    createdAt: FieldValue.serverTimestamp(),
  })
  batch.update(mfgRef, {
    queriesThisMonth: FieldValue.increment(1),
    queriesTotal: FieldValue.increment(1),
  })
  await batch.commit()

  checkAndIncrementUsage(job.manufacturerId).catch(() => {})
}

export async function POST(request: NextRequest) {
  // Auth: only callable by internal trigger or cron
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results: { jobId: string; success: boolean; error?: string }[] = []

  for (let i = 0; i < MAX_JOBS_PER_RUN; i++) {
    const job = await dequeueEmailJob()
    if (!job) break // Queue is empty

    try {
      await withSpan('process-email-job', () => processJob(job), {
        'job.id': job.id,
        'job.manufacturer': job.manufacturerId,
        'job.attempt': job.attempts,
      })
      await ackJob(job.id)
      results.push({ jobId: job.id, success: true })
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error'
      console.error(`Worker failed on job ${job.id}:`, error)
      await nackJob(job, error)
      await logError(job.manufacturerId, '/api/workers/process-email', err, { jobId: job.id })
      results.push({ jobId: job.id, success: false, error })
    }
  }

  return NextResponse.json({
    processed: results.length,
    succeeded: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    results,
  })
}
