import { NextRequest, NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebase-admin'
import { katanaRequest, getKatanaOrder } from '@/lib/katana'
import { trackShipment } from '@/lib/carriers'
import { extractPONumber, generateWISMOResponse } from '@/lib/anthropic'
import { ensureFreshQBOToken, getQBOInvoiceByPO } from '@/lib/quickbooks'
import type { QBOInvoice } from '@/types'
import { FieldValue } from 'firebase-admin/firestore'
import { logError } from '@/lib/log-error'
import { trackUsage } from '@/lib/track-usage'
import { checkBillingAllowed, checkAndIncrementUsage } from '@/lib/billing'
import { generateRequestId } from '@/lib/request-id'
import { withSpan, recordApiMetrics, pipelineQueries, escalationsCreated, billingBlocks } from '@/lib/telemetry'
import { getFeedbackContext } from '@/lib/feedback'

// Allow up to 60s for Claude + Katana + UPS pipeline
export const maxDuration = 60

export async function POST(request: NextRequest) {
  const requestId = generateRequestId()
  const startTime = Date.now()
  try {
    let body: Record<string, unknown> = {}
    try { body = await request.json() } catch { /* empty or non-JSON body */ }
    const { idToken, mode, customerEmail, customerCompany, customerMessage } = body as {
      idToken?: string; mode?: string; customerEmail?: string; customerCompany?: string; customerMessage?: string
    }

    if (!idToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const decoded = await adminAuth.verifyIdToken(idToken)
    const uid = decoded.uid

    const snap = await adminDb.collection('manufacturers').doc(uid).get()
    const mfg = snap.data()
    if (!mfg) return NextResponse.json({ error: 'Manufacturer not found' }, { status: 404 })

    // Billing gate (skip for test/onboarding mode)
    if (mode !== 'test') {
      const gate = checkBillingAllowed(mfg)
      if (!gate.allowed) {
        billingBlocks.add(1, { route: '/api/agent/run' })
        recordApiMetrics('/api/agent/run', 402, startTime)
        return NextResponse.json({ error: gate.reason, code: 'billing_limit' }, { status: 402 })
      }
    }

    let emailBody = customerMessage
    let fromEmail = customerEmail ?? 'test@customer.com'
    let fromCompany = customerCompany ?? 'Test Customer'

    // Test mode: use most recent Katana order
    if (mode === 'test' && mfg.katanaApiKey) {
      const ordersRes = await katanaRequest<{ data: Record<string, unknown>[] }>(
        '/sales-orders',
        mfg.katanaApiKey,
        { limit: '1' }
      ).catch(() => ({ data: [] }))

      const latestOrder = ordersRes.data?.[0]
      if (latestOrder) {
        const orderNo = latestOrder.order_no as string ?? 'TEST-001'
        fromEmail = (latestOrder.customer_email as string) ?? 'customer@example.com'
        fromCompany = (latestOrder.customer_name as string) ?? 'Test Customer'
        emailBody = emailBody ?? `Hi, I'd like to check on the status of my order ${orderNo}. Can you let me know where it is and when I can expect delivery? Thanks.`
      }
    }

    if (!emailBody) {
      emailBody = 'Hi, I need an update on my recent order. Where is my order?'
    }

    // Extract PO number
    const poNumber = await extractPONumber(emailBody)

    // ── Parallel data lookups (Katana + QBO simultaneously) ──────────────
    let orderData: unknown = null
    let trackingData = null
    let qboData: QBOInvoice | null = null

    if (poNumber) {
      const [katanaResult, qboResult] = await Promise.allSettled([
        mfg.katanaApiKey
          ? getKatanaOrder(mfg.katanaApiKey, poNumber)
          : Promise.resolve(null),
        mfg.qboConnected && mfg.qboRealmId
          ? ensureFreshQBOToken(mfg as Record<string, unknown>, uid)
              .then(({ accessToken: qboToken }) =>
                getQBOInvoiceByPO(mfg.qboRealmId as string, qboToken, poNumber)
              )
          : Promise.resolve(null),
      ])

      orderData = katanaResult.status === 'fulfilled' ? katanaResult.value : null
      qboData = qboResult.status === 'fulfilled' ? qboResult.value : null
    }

    // If test mode and no order found, grab first order
    if (!orderData && mode === 'test' && mfg.katanaApiKey) {
      const ordersRes = await katanaRequest<{ data: Record<string, unknown>[] }>(
        '/sales-orders',
        mfg.katanaApiKey,
        { limit: '1' }
      ).catch(() => ({ data: [] }))
      orderData = ordersRes.data?.[0] ?? null
    }

    // Cross-reference QBO data with Katana order
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

    // Carrier tracking — depends on order data for tracking number
    if (orderData) {
      const order = orderData as Record<string, unknown>
      const trackingNum = order.tracking_number as string | undefined
      if (trackingNum) {
        try {
          trackingData = await trackShipment(trackingNum)
        } catch { /* non-blocking */ }
      }
    }
    // ────────────────────────────────────────────────────────────────────

    // Check escalation trigger phrases before generating response
    const escalationTriggers: string[] = mfg.agentSettings?.escalationTriggers ?? []
    const lowerBody = emailBody.toLowerCase()
    const triggeredPhrase = escalationTriggers.find((phrase: string) =>
      lowerBody.includes(phrase.toLowerCase())
    )

    // Track API usage
    const usedServices: ('anthropic' | 'ups' | 'katana')[] = ['anthropic']
    if (mfg.katanaApiKey) usedServices.push('katana')
    if (trackingData) usedServices.push('ups')
    // qboData tracked via dataSources in generateWISMOResponse
    trackUsage(usedServices).catch(() => {})

    // Load manufacturer feedback to steer AI (non-blocking — empty string on failure)
    const feedbackContext = mode !== 'test'
      ? await getFeedbackContext(uid).catch(() => '')
      : ''

    const { response, confidence, dataSources } = await withSpan('generate-wismo-response', () => generateWISMOResponse({
      customerEmail: fromEmail,
      customerCompany: fromCompany,
      customerMessage: emailBody,
      orderData: orderData as Record<string, unknown> | null,
      trackingData,
      qboData,
      responseStyle: mfg.agentSettings?.responseStyle ?? 'professional',
      feedbackContext,
    }), { 'pipeline.mode': mode ?? 'live' })

    // Save as draft conversation if not test mode
    let conversationId: string | undefined
    if (mode !== 'test') {
      const isEscalated = !!triggeredPhrase
      const isDraft = !isEscalated && (mfg.draftMode ?? true)

      const convRef = await adminDb
        .collection('manufacturers')
        .doc(uid)
        .collection('conversations')
        .add({
          customerEmail: fromEmail,
          customerCompany: fromCompany,
          customerMessage: emailBody,
          agentResponse: response,
          status: isEscalated ? 'escalated' : isDraft ? 'draft' : 'resolved',
          confidence,
          dataSources,
          poNumber: poNumber ?? '',
          isDraft,
          draftEditedByManufacturer: false,
          slaDeadline: new Date(Date.now() + 60 * 60 * 1000),
          sentAt: isDraft || isEscalated ? null : new Date(),
          createdAt: FieldValue.serverTimestamp(),
        })
      conversationId = convRef.id

      pipelineQueries.add(1, { confidence, mode: mode ?? 'live' })

      if (isEscalated) {
        await adminDb
          .collection('manufacturers')
          .doc(uid)
          .collection('escalations')
          .add({
            conversationId,
            reason: `Trigger phrase detected: "${triggeredPhrase}"`,
            slaDeadline: new Date(Date.now() + 60 * 60 * 1000),
            status: 'open',
            assignedTo: null,
            internalNotes: [],
            createdAt: FieldValue.serverTimestamp(),
          })
        escalationsCreated.add(1)
      }

      // Increment usage counters (atomic transaction)
      checkAndIncrementUsage(uid).catch(() => {})
    }

    recordApiMetrics('/api/agent/run', 200, startTime)
    return NextResponse.json({
      response,
      confidence,
      dataSources,
      poNumber,
      orderData,
      trackingData,
      conversationId,
      requestId,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    await logError(null, '/api/agent/run', err, { requestId })
    recordApiMetrics('/api/agent/run', 500, startTime)
    return NextResponse.json({ error: msg, requestId }, { status: 500 })
  }
}
