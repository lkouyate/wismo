/**
 * FedEx Track API adapter.
 * Uses FedEx OAuth2 for authentication.
 *
 * Requires: FEDEX_CLIENT_ID, FEDEX_CLIENT_SECRET in env.
 * Sandbox: https://apis-sandbox.fedex.com
 * Production: https://apis.fedex.com
 */

import { withRetry } from '@/lib/retry'
import { cacheGet, cacheSet } from '@/lib/redis'
import type { TrackingResult, TrackingEvent } from './index'

const FEDEX_BASE = process.env.FEDEX_ENV === 'sandbox'
  ? 'https://apis-sandbox.fedex.com'
  : 'https://apis.fedex.com'

const TOKEN_CACHE_KEY = 'fedex:token'

async function getFedExToken(): Promise<string> {
  const cached = await cacheGet<string>(TOKEN_CACHE_KEY)
  if (cached) return cached

  const res = await fetch(`${FEDEX_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.FEDEX_CLIENT_ID!,
      client_secret: process.env.FEDEX_CLIENT_SECRET!,
    }),
    signal: AbortSignal.timeout(10_000),
  })

  if (!res.ok) throw new Error(`FedEx auth failed: ${res.status}`)
  const data = await res.json()
  const token = data.access_token as string
  // Cache for 50 min (tokens last 60 min)
  await cacheSet(TOKEN_CACHE_KEY, token, 3000)
  return token
}

export async function trackFedEx(trackingNumber: string): Promise<TrackingResult | null> {
  const clientId = process.env.FEDEX_CLIENT_ID
  if (!clientId) return null // Not configured

  return withRetry(async () => {
    const token = await getFedExToken()

    const res = await fetch(`${FEDEX_BASE}/track/v1/trackingnumbers`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-locale': 'en_US',
      },
      body: JSON.stringify({
        includeDetailedScans: true,
        trackingInfo: [{ trackingNumberInfo: { trackingNumber } }],
      }),
      signal: AbortSignal.timeout(10_000),
    })

    if (!res.ok) throw new Error(`FedEx track failed: ${res.status}`)
    const data = await res.json()

    const result = data.output?.completeTrackResults?.[0]?.trackResults?.[0]
    if (!result) return null

    const latestStatus = result.latestStatusDetail
    const scanEvents = result.scanEvents ?? []

    const events: TrackingEvent[] = scanEvents.map((e: Record<string, unknown>) => {
      const loc = e.scanLocation as Record<string, string> | undefined
      return {
        date: (e.date as string)?.slice(0, 10) ?? '',
        time: (e.date as string)?.slice(11, 19) ?? '',
        location: loc
          ? `${loc.city ?? ''}, ${loc.stateOrProvinceCode ?? ''} ${loc.countryCode ?? ''}`.trim()
          : 'Unknown',
        description: (e.eventDescription as string) ?? '',
      }
    })

    const deliveryDate = result.estimatedDeliveryTimeWindow?.window?.ends
      ?? result.standardTransitTimeWindow?.window?.ends

    return {
      trackingNumber,
      carrier: 'fedex' as const,
      status: latestStatus?.description ?? 'Unknown',
      estimatedDelivery: deliveryDate?.slice(0, 10),
      events,
    }
  })
}
