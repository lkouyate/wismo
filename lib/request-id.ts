import { randomUUID } from 'crypto'

/**
 * Generates a unique request ID for tracing across external API calls.
 * Format: "wismo-{timestamp}-{uuid-short}"
 */
export function generateRequestId(): string {
  return `wismo-${Date.now()}-${randomUUID().slice(0, 8)}`
}
