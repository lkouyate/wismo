/**
 * USPS Web Tools (v3 API) tracking adapter.
 *
 * Requires: USPS_USER_ID in env.
 * Register at: https://www.usps.com/business/web-tools-apis/
 */

import { withRetry } from '@/lib/retry'
import type { TrackingResult, TrackingEvent } from './index'

const USPS_BASE = 'https://secure.shippingapis.com/ShippingAPI.dll'

export async function trackUSPS(trackingNumber: string): Promise<TrackingResult | null> {
  const userId = process.env.USPS_USER_ID
  if (!userId) return null // Not configured

  return withRetry(async () => {
    const xml = `<TrackFieldRequest USERID="${userId}"><TrackID ID="${trackingNumber}"></TrackID></TrackFieldRequest>`
    const url = `${USPS_BASE}?API=TrackV2&XML=${encodeURIComponent(xml)}`

    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) throw new Error(`USPS track failed: ${res.status}`)
    const text = await res.text()

    // Parse XML response (lightweight — no dependency needed)
    const events: TrackingEvent[] = []
    const detailRegex = /<TrackDetail>([\s\S]*?)<\/TrackDetail>/g
    let match
    while ((match = detailRegex.exec(text)) !== null) {
      const detail = match[1]
      events.push({
        date: extractTag(detail, 'EventDate'),
        time: extractTag(detail, 'EventTime'),
        location: [
          extractTag(detail, 'EventCity'),
          extractTag(detail, 'EventState'),
          extractTag(detail, 'EventZIPCode'),
        ].filter(Boolean).join(', '),
        description: extractTag(detail, 'Event'),
      })
    }

    const summary = extractTag(text, 'TrackSummary')
    const status = summary
      ? extractTag(summary, 'Event') || 'Unknown'
      : events[0]?.description ?? 'Unknown'

    const deliveryDate = extractTag(text, 'ExpectedDeliveryDate')

    return {
      trackingNumber,
      carrier: 'usps' as const,
      status,
      estimatedDelivery: deliveryDate || undefined,
      events,
    }
  })
}

function extractTag(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}>(.*?)</${tag}>`))
  return match?.[1]?.trim() ?? ''
}
