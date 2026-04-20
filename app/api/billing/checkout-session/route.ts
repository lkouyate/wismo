import { NextRequest, NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebase-admin'
import { getStripe } from '@/lib/stripe'
import { FieldValue } from 'firebase-admin/firestore'

const PRICE_IDS: Record<string, string> = {
  core: process.env.STRIPE_PRICE_CORE!,
  enhanced: process.env.STRIPE_PRICE_ENHANCED!,
  full: process.env.STRIPE_PRICE_FULL!,
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7))
    const uid = decoded.uid

    const body = await request.json()
    const { plan } = body as { plan: 'core' | 'enhanced' | 'full' }

    const priceId = PRICE_IDS[plan]
    if (!priceId) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
    }

    const snap = await adminDb.collection('manufacturers').doc(uid).get()
    const mfg = snap.data() ?? {}

    const stripe = getStripe()
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.trywismo.co'

    // Get or create Stripe customer
    let stripeCustomerId = mfg.stripeCustomerId as string | undefined
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: mfg.email as string,
        name: (mfg.displayName as string) || undefined,
        metadata: { uid },
      })
      stripeCustomerId = customer.id
      await adminDb.collection('manufacturers').doc(uid).update({
        stripeCustomerId,
        updatedAt: FieldValue.serverTimestamp(),
      })
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: stripeCustomerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/dashboard/settings/billing?success=1`,
      cancel_url: `${appUrl}/dashboard/settings/billing`,
      metadata: { uid, plan },
      subscription_data: { metadata: { uid, plan } },
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
