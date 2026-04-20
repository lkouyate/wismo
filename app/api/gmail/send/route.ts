import { NextRequest, NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebase-admin'
import { sendEmail } from '@/lib/gmail'
import { FieldValue } from 'firebase-admin/firestore'
import { decryptToken, isEncrypted } from '@/lib/crypto'

function safeDecrypt(value: string): string {
  return isEncrypted(value) ? decryptToken(value) : value
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { idToken, conversationId, editedResponse } = body

    if (!idToken || !conversationId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const decoded = await adminAuth.verifyIdToken(idToken)
    const uid = decoded.uid

    const mfgSnap = await adminDb.collection('manufacturers').doc(uid).get()
    const mfg = mfgSnap.data()
    if (!mfg) return NextResponse.json({ error: 'Manufacturer not found' }, { status: 404 })

    if (!mfg.gmailConnected || !mfg.gmailAccessToken) {
      return NextResponse.json({ error: 'Gmail not connected' }, { status: 400 })
    }

    const convSnap = await adminDb
      .collection('manufacturers')
      .doc(uid)
      .collection('conversations')
      .doc(conversationId)
      .get()

    if (!convSnap.exists) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    const conv = convSnap.data()!
    const responseText = editedResponse ?? conv.agentResponse
    const subject = conv.originalSubject
      ? `Re: ${conv.originalSubject}`
      : 'Re: Order Status Update'

    await sendEmail({
      accessToken: safeDecrypt(mfg.gmailAccessToken),
      refreshToken: safeDecrypt(mfg.gmailRefreshToken),
      to: conv.customerEmail,
      subject,
      body: responseText,
      fromEmail: mfg.gmailEmail,
      inReplyTo: conv.originalMessageId,
      references: conv.originalMessageId,
    })

    await adminDb
      .collection('manufacturers')
      .doc(uid)
      .collection('conversations')
      .doc(conversationId)
      .update({
        agentResponse: responseText,
        status: 'resolved',
        isDraft: false,
        draftEditedByManufacturer: editedResponse != null && editedResponse !== conv.agentResponse,
        sentAt: FieldValue.serverTimestamp(),
      })

    return NextResponse.json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
