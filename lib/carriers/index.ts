/**
 * Unified carrier tracking router.
 * Detects carrier from tracking number and routes to the appropriate adapter.
 */

import { detectCarrier, type CarrierName } from './detect'
import { trackUPSShipment } from '@/lib/ups'
import { trackFedEx } from './fedex'
import { trackUSPS } from './usps'
import { trackDHL } from './dhl'

export interface TrackingResult {
  trackingNumber: string
  carrier: CarrierName
  status: string
  estimatedDelivery?: string
  events: TrackingEvent[]
}

export interface TrackingEvent {
  date: string
  time: string
  location: string
  description: string
}

/**
 * Track a shipment across any supported carrier.
 * Returns null if carrier is unsupported or tracking fails.
 */
export async function trackShipment(trackingNumber: string): Promise<TrackingResult | null> {
  const carrier = detectCarrier(trackingNumber)

  switch (carrier) {
    case 'ups': {
      const result = await trackUPSShipment(trackingNumber)
      if (!result) return null
      return {
        trackingNumber: result.trackingNumber,
        carrier: 'ups',
        status: result.status,
        estimatedDelivery: result.estimatedDelivery,
        events: result.events,
      }
    }

    case 'fedex': {
      const result = await trackFedEx(trackingNumber)
      return result ?? { trackingNumber, carrier, status: 'FedEx tracking not configured', events: [] }
    }

    case 'usps': {
      const result = await trackUSPS(trackingNumber)
      return result ?? { trackingNumber, carrier, status: 'USPS tracking not configured', events: [] }
    }

    case 'dhl': {
      const result = await trackDHL(trackingNumber)
      return result ?? { trackingNumber, carrier, status: 'DHL tracking not configured', events: [] }
    }

    default:
      return null
  }
}

export { detectCarrier, type CarrierName }
