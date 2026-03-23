import { NextRequest, NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebase-admin'

export async function POST(request: NextRequest) {
  try {
    const { idToken } = await request.json()
    if (!idToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const decoded = await adminAuth.verifyIdToken(idToken)
    const uid = decoded.uid

    const mfgSnap = await adminDb.collection('manufacturers').doc(uid).get()
    if (!mfgSnap.exists) {
      return NextResponse.json({ error: 'Manufacturer doc not found in Firestore' }, { status: 404 })
    }

    const mfg = mfgSnap.data()!

    // Check customers
    const customersSnap = await adminDb
      .collection('manufacturers')
      .doc(uid)
      .collection('customers')
      .where('status', '==', 'active')
      .get()

    // Check Gmail watch expiry
    const watchExpiry = mfg.gmailWatchExpiry?.toDate?.() ?? null
    const watchExpiresIn = watchExpiry
      ? Math.round((watchExpiry.getTime() - Date.now()) / (1000 * 60 * 60))
      : null

    const status = {
      // Core flags
      isLive: mfg.isLive ?? false,
      draftMode: mfg.draftMode ?? true,
      onboardingComplete: mfg.onboardingComplete ?? false,

      // Katana
      katanaConnected: mfg.katanaConnected ?? false,
      katanaApiKey: mfg.katanaApiKey ? `set (${String(mfg.katanaApiKey).slice(0, 8)}...)` : 'NOT SET',

      // Gmail
      gmailConnected: mfg.gmailConnected ?? false,
      gmailEmail: mfg.gmailEmail ?? 'NOT SET',
      gmailAccessToken: mfg.gmailAccessToken ? 'set' : 'NOT SET',
      gmailRefreshToken: mfg.gmailRefreshToken ? 'set' : 'NOT SET',
      gmailWatchExpiry: watchExpiry?.toISOString() ?? 'NOT SET',
      gmailWatchExpiresInHours: watchExpiresIn,
      gmailWatchStatus:
        watchExpiresIn === null
          ? 'NOT REGISTERED'
          : watchExpiresIn <= 0
          ? 'EXPIRED'
          : watchExpiresIn < 24
          ? `EXPIRING SOON (${watchExpiresIn}h)`
          : `OK (${watchExpiresIn}h remaining)`,

      // Customers
      activeCustomerCount: customersSnap.size,
      customerDomains: customersSnap.docs.map((d) => d.data().domain ?? d.data().companyName),

      // Agent settings
      agentSettings: mfg.agentSettings ?? 'NOT SET (defaults will be used)',

      // Env checks
      envChecks: {
        GMAIL_PUBSUB_TOPIC: process.env.GMAIL_PUBSUB_TOPIC ?? 'NOT SET',
        NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? 'NOT SET',
        PUBSUB_SERVICE_ACCOUNT_EMAIL: process.env.PUBSUB_SERVICE_ACCOUNT_EMAIL ?? 'NOT SET',
        CRON_SECRET: process.env.CRON_SECRET ? 'set' : 'NOT SET',
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? 'set' : 'NOT SET',
        GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ? 'set' : 'NOT SET',
      },
    }

    // Summary
    const issues: string[] = []
    if (!status.isLive) issues.push('isLive is false — webhook will ignore all emails')
    if (!status.gmailConnected) issues.push('Gmail not connected')
    if (status.gmailWatchStatus !== 'OK' && !status.gmailWatchStatus.startsWith('OK'))
      issues.push(`Gmail watch: ${status.gmailWatchStatus}`)
    if (!status.katanaConnected) issues.push('Katana not connected (PO lookup will be skipped)')
    if (status.activeCustomerCount === 0) issues.push('No active customers — all emails will be escalated as unknown sender')
    if (status.envChecks.GMAIL_PUBSUB_TOPIC === 'NOT SET') issues.push('GMAIL_PUBSUB_TOPIC env var missing')

    return NextResponse.json({ status, issues, ready: issues.length === 0 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
