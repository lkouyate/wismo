import { NextRequest, NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebase-admin'
import { katanaRequest, getKatanaOrder } from '@/lib/katana'
import { trackUPSShipment } from '@/lib/ups'
import { extractPONumber, generateWISMOResponse } from '@/lib/anthropic'
import { FieldValue } from 'firebase-admin/firestore'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { idToken, mode, customerEmail, customerCompany, customerMessage } = body

    if (!idToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const decoded = await adminAuth.verifyIdToken(idToken)
    const uid = decoded.uid

    const snap = await adminDb.collection('manufacturers').doc(uid).get()
    const mfg = snap.data()
    if (!mfg) return NextResponse.json({ error: 'Manufacturer not found' }, { status: 404 })

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

    let orderData = null
    let trackingData = null

    if (poNumber && mfg.katanaApiKey) {
      try {
        orderData = await getKatanaOrder(mfg.katanaApiKey, poNumber)
      } catch { /* ignore */ }
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

    if (orderData) {
      const order = orderData as Record<string, unknown>
      const trackingNum = order.tracking_number as string | undefined
      if (trackingNum) {
        try {
          trackingData = await trackUPSShipment(trackingNum)
        } catch { /* ignore */ }
      }
    }

    // Check escalation trigger phrases before generating response
    const escalationTriggers: string[] = mfg.agentSettings?.escalationTriggers ?? []
    const lowerBody = emailBody.toLowerCase()
    const triggeredPhrase = escalationTriggers.find((phrase: string) =>
      lowerBody.includes(phrase.toLowerCase())
    )

    const { response, confidence, dataSources } = await generateWISMOResponse({
      customerEmail: fromEmail,
      customerCompany: fromCompany,
      customerMessage: emailBody,
      orderData: orderData as Record<string, unknown> | null,
      trackingData,
      responseStyle: mfg.agentSettings?.responseStyle ?? 'professional',
    })

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
      }
    }

    return NextResponse.json({
      response,
      confidence,
      dataSources,
      poNumber,
      orderData,
      trackingData,
      conversationId,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
