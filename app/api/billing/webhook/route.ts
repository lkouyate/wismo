import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { getStripe } from '@/lib/stripe'
import { FieldValue } from 'firebase-admin/firestore'
import Stripe from 'stripe'

// Field names that changed in the Stripe SDK clover API version
interface SubPeriod { current_period_end: number; current_period_start: number }
interface InvoiceWithSub { subscription: string | { id: string } | null }

function getPeriodEnd(sub: Stripe.Subscription): number {
  return (sub as unknown as SubPeriod).current_period_end
}
function getPeriodStart(sub: Stripe.Subscription): number {
  return (sub as unknown as SubPeriod).current_period_start
}
function getInvoiceSubId(invoice: Stripe.Invoice): string | undefined {
  const sub = (invoice as unknown as InvoiceWithSub).subscription
  if (!sub) return undefined
  return typeof sub === 'string' ? sub : sub.id
}

// Stripe requires the raw body for signature verification
export const dynamic = 'force-dynamic'

const PRICE_TO_PLAN: Record<string, string> = {
  [process.env.STRIPE_PRICE_CORE ?? '']: 'core',
  [process.env.STRIPE_PRICE_ENHANCED ?? '']: 'enhanced',
  [process.env.STRIPE_PRICE_FULL ?? '']: 'full',
}

function planFromSubscription(subscription: Stripe.Subscription): string {
  const priceId = subscription.items.data[0]?.price?.id ?? ''
  return PRICE_TO_PLAN[priceId] ?? 'core'
}

async function updateManufacturer(uid: string, data: Record<string, unknown>) {
  await adminDb.collection('manufacturers').doc(uid).update({
    ...data,
    updatedAt: FieldValue.serverTimestamp(),
  })
}

export async function POST(request: NextRequest) {
  const body = await request.text()
  const sig = request.headers.get('stripe-signature')

  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature' }, { status: 400 })
  }

  const stripe = getStripe()
  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Invalid signature'
    console.error('Stripe webhook signature error:', msg)
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const uid = session.metadata?.uid
        if (!uid) break

        // Fetch the subscription to get period end and price
        const subId = session.subscription as string
        const subscription = await stripe.subscriptions.retrieve(subId)
        const plan = planFromSubscription(subscription)
        const periodEnd = new Date(getPeriodEnd(subscription) * 1000)

        await updateManufacturer(uid, {
          plan,
          stripeCustomerId: session.customer as string,
          stripeSubscriptionId: subId,
          subscriptionStatus: subscription.status,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          billingEmail: session.customer_details?.email ?? '',
          queriesThisMonth: 0,
          billingPeriodStart: new Date(getPeriodStart(subscription) * 1000),
        })
        break
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const uid = subscription.metadata?.uid
        if (!uid) break

        await updateManufacturer(uid, {
          plan: planFromSubscription(subscription),
          subscriptionStatus: subscription.status,
          currentPeriodEnd: new Date(getPeriodEnd(subscription) * 1000),
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
        })
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const uid = subscription.metadata?.uid
        if (!uid) break

        await updateManufacturer(uid, {
          subscriptionStatus: 'canceled',
          cancelAtPeriodEnd: false,
        })
        break
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice
        const subId = getInvoiceSubId(invoice)
        if (!subId) break

        const subscription = await stripe.subscriptions.retrieve(subId)
        const uid = subscription.metadata?.uid
        if (!uid) break

        await updateManufacturer(uid, {
          subscriptionStatus: 'active',
          queriesThisMonth: 0,
          billingPeriodStart: new Date(getPeriodStart(subscription) * 1000),
          currentPeriodEnd: new Date(getPeriodEnd(subscription) * 1000),
        })
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const subId = getInvoiceSubId(invoice)
        if (!subId) break

        const subscription = await stripe.subscriptions.retrieve(subId)
        const uid = subscription.metadata?.uid
        if (!uid) break

        await updateManufacturer(uid, { subscriptionStatus: 'past_due' })
        break
      }
    }
  } catch (err) {
    console.error(`Stripe webhook handler error (${event.type}):`, err)
    // Still return 200 so Stripe doesn't retry
  }

  return NextResponse.json({ received: true })
}
