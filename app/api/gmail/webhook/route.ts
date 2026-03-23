import { NextRequest, NextResponse } from 'next/server'
import { OAuth2Client } from 'google-auth-library'
import { adminDb } from '@/lib/firebase-admin'
import { getGmailMessages, sendEmail } from '@/lib/gmail'
import { extractPONumber, generateWISMOResponse } from '@/lib/anthropic'
import { getKatanaOrder } from '@/lib/katana'
import { trackUPSShipment } from '@/lib/ups'
import { FieldValue } from 'firebase-admin/firestore'

// Module-level client reused across requests (no state)
const authClient = new OAuth2Client()

async function verifyPubSubToken(authHeader: string | null): Promise<boolean> {
  if (!authHeader?.startsWith('Bearer ')) return false
  const token = authHeader.slice(7)
  const audience = `${process.env.NEXT_PUBLIC_APP_URL}/api/gmail/webhook`
  try {
    const ticket = await authClient.verifyIdToken({ idToken: token, audience })
    const payload = ticket.getPayload()
    // Optionally restrict to your specific Pub/Sub service account
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
  try {
    // Verify the request genuinely came from Google Cloud Pub/Sub
    const valid = await verifyPubSubToken(request.headers.get('authorization'))
    if (!valid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json()) as PubSubMessage
    const rawData = body.message?.data
    if (!rawData) return NextResponse.json({ ok: true })

    const decoded = JSON.parse(Buffer.from(rawData, 'base64').toString())
    const { emailAddress, historyId } = decoded

    // Find manufacturer by Gmail email
    const mfgQuery = await adminDb
      .collection('manufacturers')
      .where('gmailEmail', '==', emailAddress)
      .where('gmailConnected', '==', true)
      .where('isLive', '==', true)
      .limit(1)
      .get()

    if (mfgQuery.empty) return NextResponse.json({ ok: true })

    const mfgDoc = mfgQuery.docs[0]
    const mfg = mfgDoc.data()

    const messages = await getGmailMessages(
      mfg.gmailAccessToken,
      mfg.gmailRefreshToken,
      historyId
    )

    for (const msg of messages) {
      // ── Gap 3: Idempotency check — skip if already processed ────────────
      const msgDocRef = adminDb
        .collection('manufacturers')
        .doc(mfgDoc.id)
        .collection('processedMessages')
        .doc(msg.id)

      const alreadyProcessed = await msgDocRef.get()
      if (alreadyProcessed.exists) continue

      // Mark as processed immediately to prevent concurrent duplicates
      await msgDocRef.set({
        processedAt: FieldValue.serverTimestamp(),
        expireAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // for future TTL policy
      })
      // ────────────────────────────────────────────────────────────────────

      const senderEmail = msg.from.match(/<(.+)>/)?.[1] ?? msg.from.trim()
      const senderDomain = senderEmail.split('@')[1]

      const customerQuery = await adminDb
        .collection('manufacturers')
        .doc(mfgDoc.id)
        .collection('customers')
        .where('domain', '==', senderDomain)
        .where('status', '==', 'active')
        .limit(1)
        .get()

      if (customerQuery.empty) {
        // Unknown sender — escalate immediately
        const convRef = await adminDb
          .collection('manufacturers')
          .doc(mfgDoc.id)
          .collection('conversations')
          .add({
            customerEmail: senderEmail,
            customerCompany: senderDomain,
            customerMessage: msg.body,
            agentResponse: '',
            status: 'escalated',
            confidence: 'needs_attention',
            dataSources: [],
            originalMessageId: msg.id,
            originalSubject: msg.subject,
            isDraft: false,
            draftEditedByManufacturer: false,
            slaDeadline: new Date(Date.now() + 60 * 60 * 1000),
            sentAt: null,
            createdAt: FieldValue.serverTimestamp(),
          })

        await adminDb
          .collection('manufacturers')
          .doc(mfgDoc.id)
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
        continue
      }

      const customer = customerQuery.docs[0].data()

      // Check escalation trigger phrases before running Claude calls
      const escalationTriggers: string[] = mfg.agentSettings?.escalationTriggers ?? []
      const lowerBody = msg.body.toLowerCase()
      const triggeredPhrase = escalationTriggers.find((phrase: string) =>
        lowerBody.includes(phrase.toLowerCase())
      )

      if (triggeredPhrase) {
        const convRef = await adminDb
          .collection('manufacturers')
          .doc(mfgDoc.id)
          .collection('conversations')
          .add({
            customerEmail: senderEmail,
            customerCompany: customer.companyName,
            customerMessage: msg.body,
            agentResponse: '',
            status: 'escalated',
            confidence: 'needs_attention',
            dataSources: [],
            originalMessageId: msg.id,
            originalSubject: msg.subject,
            isDraft: false,
            draftEditedByManufacturer: false,
            slaDeadline: new Date(Date.now() + 60 * 60 * 1000),
            sentAt: null,
            createdAt: FieldValue.serverTimestamp(),
          })

        await adminDb
          .collection('manufacturers')
          .doc(mfgDoc.id)
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
        continue
      }

      // Extract PO and fetch order + tracking data
      const poNumber = await extractPONumber(msg.body)

      let orderData = null
      let trackingData = null

      if (poNumber && mfg.katanaApiKey) {
        try {
          orderData = await getKatanaOrder(mfg.katanaApiKey, poNumber)
        } catch { /* ignore */ }
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

      const { response, confidence, dataSources } = await generateWISMOResponse({
        customerEmail: senderEmail,
        customerCompany: customer.companyName,
        customerMessage: msg.body,
        orderData: orderData as Record<string, unknown> | null,
        trackingData,
        responseStyle: mfg.agentSettings?.responseStyle ?? 'professional',
      })

      const isDraft = mfg.draftMode ?? true
      const slaDeadline = new Date(Date.now() + 60 * 60 * 1000)
      const subject = msg.subject ? `Re: ${msg.subject}` : 'Re: Order Status Update'

      // ── Gap 1: Auto-send when draftMode = false ──────────────────────────
      if (!isDraft) {
        try {
          await sendEmail({
            accessToken: mfg.gmailAccessToken,
            refreshToken: mfg.gmailRefreshToken,
            to: senderEmail,
            subject,
            body: response,
            fromEmail: mfg.gmailEmail,
            inReplyTo: msg.id,
            references: msg.id,
          })
        } catch (sendErr) {
          console.error('Auto-send failed, falling back to draft:', sendErr)
          // Send failed — save as draft so manufacturer can send manually
          await adminDb
            .collection('manufacturers')
            .doc(mfgDoc.id)
            .collection('conversations')
            .add({
              customerEmail: senderEmail,
              customerCompany: customer.companyName,
              customerMessage: msg.body,
              agentResponse: response,
              status: 'draft',
              confidence,
              dataSources,
              poNumber: poNumber ?? '',
              originalMessageId: msg.id,
              originalSubject: msg.subject,
              isDraft: true,
              draftEditedByManufacturer: false,
              slaDeadline,
              sentAt: null,
              createdAt: FieldValue.serverTimestamp(),
            })
          continue
        }
      }
      // ────────────────────────────────────────────────────────────────────

      await adminDb
        .collection('manufacturers')
        .doc(mfgDoc.id)
        .collection('conversations')
        .add({
          customerEmail: senderEmail,
          customerCompany: customer.companyName,
          customerMessage: msg.body,
          agentResponse: response,
          status: isDraft ? 'draft' : 'resolved',
          confidence,
          dataSources,
          poNumber: poNumber ?? '',
          originalMessageId: msg.id,
          originalSubject: msg.subject,
          isDraft,
          draftEditedByManufacturer: false,
          slaDeadline,
          sentAt: isDraft ? null : new Date(),
          createdAt: FieldValue.serverTimestamp(),
        })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Webhook error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
