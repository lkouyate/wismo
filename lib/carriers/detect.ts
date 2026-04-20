/**
 * Detect carrier from tracking number format.
 * Returns the carrier name or 'unknown' if no pattern matches.
 */

export type CarrierName = 'ups' | 'fedex' | 'usps' | 'dhl' | 'unknown'

interface CarrierPattern {
  carrier: CarrierName
  patterns: RegExp[]
}

const CARRIER_PATTERNS: CarrierPattern[] = [
  {
    carrier: 'ups',
    patterns: [
      /^1Z[A-Z0-9]{16}$/i,           // UPS standard
      /^T\d{10}$/,                     // UPS freight
      /^\d{26}$/,                      // UPS waybill
    ],
  },
  {
    carrier: 'fedex',
    patterns: [
      /^\d{12}$/,                      // FedEx Express
      /^\d{15}$/,                      // FedEx Ground
      /^\d{20}$/,                      // FedEx SmartPost (20 digits)
      /^\d{22}$/,                      // FedEx Ground (22 digits)
      /^96\d{20}$/,                    // FedEx Ground 96
      /^(61|02)\d{18,20}$/,           // FedEx Home Delivery
    ],
  },
  {
    carrier: 'usps',
    patterns: [
      /^(94|93|92|94|95)\d{20,22}$/,  // USPS tracking
      /^82\d{8}$/,                     // USPS Certified Mail
      /^[A-Z]{2}\d{9}US$/i,           // USPS international
      /^420\d{5}(91|92|93|94)\d{20}$/, // USPS with ZIP
    ],
  },
  {
    carrier: 'dhl',
    patterns: [
      /^\d{10,11}$/,                   // DHL Express
      /^[A-Z]{3}\d{7}$/i,             // DHL eCommerce
      /^JVGL\d{16}$/i,                // DHL Global Mail
    ],
  },
]

export function detectCarrier(trackingNumber: string): CarrierName {
  const cleaned = trackingNumber.trim().replace(/\s+/g, '')
  for (const { carrier, patterns } of CARRIER_PATTERNS) {
    if (patterns.some(p => p.test(cleaned))) return carrier
  }
  return 'unknown'
}
