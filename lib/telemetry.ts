/**
 * OpenTelemetry instrumentation for WISMO.
 *
 * Exports traces + metrics to any OTLP-compatible backend (Grafana Cloud, Jaeger, etc).
 * Set OTEL_EXPORTER_OTLP_ENDPOINT and OTEL_EXPORTER_OTLP_HEADERS in env.
 */

import { trace, SpanStatusCode, metrics, type Span, type Tracer } from '@opentelemetry/api'

const TRACER_NAME = 'wismo-dashboard'
const METER_NAME = 'wismo-dashboard'

let _tracer: Tracer | null = null

function getTracer(): Tracer {
  if (!_tracer) {
    _tracer = trace.getTracer(TRACER_NAME, '1.0.0')
  }
  return _tracer
}

// ── Custom Metrics ──────────────────────────────────────────────

const meter = metrics.getMeter(METER_NAME, '1.0.0')

/** Histogram: API route latency in milliseconds */
export const apiLatency = meter.createHistogram('wismo.api.latency_ms', {
  description: 'API route handler latency in milliseconds',
  unit: 'ms',
})

/** Counter: total API requests by route and status */
export const apiRequests = meter.createCounter('wismo.api.requests_total', {
  description: 'Total API requests by route and HTTP status',
})

/** Counter: errors by route and error type */
export const apiErrors = meter.createCounter('wismo.api.errors_total', {
  description: 'Total API errors by route and type',
})

/** Counter: pipeline queries processed */
export const pipelineQueries = meter.createCounter('wismo.pipeline.queries_total', {
  description: 'Total pipeline queries by confidence level',
})

/** Counter: escalations created */
export const escalationsCreated = meter.createCounter('wismo.escalations.created_total', {
  description: 'Total escalations created',
})

/** Histogram: Claude API call latency */
export const claudeLatency = meter.createHistogram('wismo.claude.latency_ms', {
  description: 'Claude API call latency in milliseconds',
  unit: 'ms',
})

/** Counter: carrier tracking lookups by carrier */
export const carrierLookups = meter.createCounter('wismo.carrier.lookups_total', {
  description: 'Carrier tracking lookups by carrier name',
})

/** Counter: billing blocks */
export const billingBlocks = meter.createCounter('wismo.billing.blocks_total', {
  description: 'Requests blocked by billing checks',
})

/** Counter: webhook messages enqueued */
export const webhookEnqueued = meter.createCounter('wismo.webhook.enqueued_total', {
  description: 'Email jobs enqueued via webhook',
})

// ── Span helpers ────────────────────────────────────────────────

/**
 * Wrap an async function in a traced span.
 * Automatically records errors and sets status.
 */
export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  attributes?: Record<string, string | number | boolean>
): Promise<T> {
  const tracer = getTracer()
  return tracer.startActiveSpan(name, async (span) => {
    if (attributes) {
      for (const [k, v] of Object.entries(attributes)) {
        span.setAttribute(k, v)
      }
    }
    try {
      const result = await fn(span)
      span.setStatus({ code: SpanStatusCode.OK })
      return result
    } catch (err) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err instanceof Error ? err.message : 'Unknown error',
      })
      span.recordException(err instanceof Error ? err : new Error(String(err)))
      throw err
    } finally {
      span.end()
    }
  })
}

/**
 * Create a simple span for tracking a unit of work without wrapping.
 */
export function startSpan(name: string, attributes?: Record<string, string | number | boolean>): Span {
  const span = getTracer().startSpan(name)
  if (attributes) {
    for (const [k, v] of Object.entries(attributes)) {
      span.setAttribute(k, v)
    }
  }
  return span
}

/**
 * Record API route metrics (latency + request count).
 * Call at the end of every API route handler.
 */
export function recordApiMetrics(route: string, status: number, startTime: number) {
  const duration = Date.now() - startTime
  apiLatency.record(duration, { route, status })
  apiRequests.add(1, { route, status })
  if (status >= 400) {
    apiErrors.add(1, { route, status })
  }
}

export { trace, SpanStatusCode }
