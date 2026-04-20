import { UPSTrackingResult, UPSTrackingEvent } from '@/types'
import { withRetry } from '@/lib/retry'
import { upsCircuit } from '@/lib/circuit-breaker'

const UPS_BASE = 'https://onlinetools.ups.com'
let upsToken: string | null = null
let upsTokenExpiry: number = 0

async function getUPSToken(): Promise<string> {
  if (upsToken && Date.now() < upsTokenExpiry) return upsToken

  return withRetry(async () => {
    const res = await fetch(`${UPS_BASE}/security/v1/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(
          `${process.env.UPS_CLIENT_ID}:${process.env.UPS_CLIENT_SECRET}`
        ).toString('base64')}`,
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(10_000),
    })

    if (!res.ok) {
      throw new Error(`UPS auth failed: ${res.status}`)
    }

    const data = await res.json()
    upsToken = data.access_token
    upsTokenExpiry = Date.now() + (data.expires_in - 60) * 1000
    return upsToken!
  })
}

export async function trackUPSShipment(trackingNumber: string): Promise<UPSTrackingResult | null> {
  const result = await upsCircuit.call(async () => {
    const token = await getUPSToken()

    return withRetry(async () => {
      const res = await fetch(
        `${UPS_BASE}/api/track/v1/details/${trackingNumber}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            transId: `wismo-${Date.now()}`,
            transactionSrc: 'wismo-dashboard',
          },
          signal: AbortSignal.timeout(10_000),
        }
      )

      if (!res.ok) {
        throw new Error(`UPS track failed: ${res.status}`)
      }

      const data = await res.json()
      const shipment = data.trackResponse?.shipment?.[0]
      const pkg = shipment?.package?.[0]
      const activity = pkg?.activity ?? []

      const events: UPSTrackingEvent[] = activity.map((a: Record<string, unknown>) => {
        const loc = a.location as Record<string, unknown> | undefined
        const address = loc?.address as Record<string, string> | undefined
        const status = a.status as Record<string, string> | undefined
        return {
          date: a.date as string ?? '',
          time: a.time as string ?? '',
          location: address
            ? `${address.city ?? ''}, ${address.stateProvince ?? ''} ${address.countryCode ?? ''}`.trim()
            : 'Unknown',
          description: status?.description ?? '',
        }
      })

      const currentStatus = pkg?.currentStatus?.description ?? 'Unknown'
      const deliveryDate = pkg?.deliveryDate?.[0]?.date

      return {
        trackingNumber,
        status: currentStatus,
        estimatedDelivery: deliveryDate,
        events,
      } satisfies UPSTrackingResult
    })
  })

  return result // null if circuit is open
}
