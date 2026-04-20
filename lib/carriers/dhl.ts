/**
 * DHL Express Tracking API adapter.
 *
 * Requires: DHL_API_KEY in env.
 * Get API key at: https://developer.dhl.com/
 */

import { withRetry } from '@/lib/retry'
import type { TrackingResult, TrackingEvent } from './index'

const DHL_BASE = 'https://api-eu.dhl.com/track/shipments'

export async function trackDHL(trackingNumber: string): Promise<TrackingResult | null> {
  const apiKey = process.env.DHL_API_KEY
  if (!apiKey) return null // Not configured

  return withRetry(async () => {
    const res = await fetch(`${DHL_BASE}?trackingNumber=${encodeURIComponent(trackingNumber)}`, {
      headers: {
        'DHL-API-Key': apiKey,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(10_000),
    })

    if (!res.ok) throw new Error(`DHL track failed: ${res.status}`)
    const data = await res.json()

    const shipment = data.shipments?.[0]
    if (!shipment) return null

    const events: TrackingEvent[] = (shipment.events ?? []).map((e: Record<string, unknown>) => {
      const loc = e.location as Record<string, unknown> | undefined
      const address = loc?.address as Record<string, string> | undefined
      return {
        date: (e.timestamp as string)?.slice(0, 10) ?? '',
        time: (e.timestamp as string)?.slice(11, 19) ?? '',
        location: address
          ? `${address.addressLocality ?? ''}, ${address.countryCode ?? ''}`.trim()
          : 'Unknown',
        description: (e.description as string) ?? '',
      }
    })

    const eta = shipment.estimatedTimeOfDelivery
    const deliveryDate = typeof eta === 'string' ? eta.slice(0, 10) : undefined

    return {
      trackingNumber,
      carrier: 'dhl' as const,
      status: shipment.status?.description ?? shipment.status?.statusCode ?? 'Unknown',
      estimatedDelivery: deliveryDate,
      events,
    }
  })
}
