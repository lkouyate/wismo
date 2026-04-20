/**
 * OpenTelemetry instrumentation for WISMO.
 *
 * Exports traces to any OTLP-compatible backend (Grafana Cloud Tempo, Jaeger, etc).
 * Set OTEL_EXPORTER_OTLP_ENDPOINT and OTEL_EXPORTER_OTLP_HEADERS in env.
 *
 * Usage: import at the top of instrumentation.ts (Next.js instrumentation hook).
 */

import { trace, SpanStatusCode, type Span, type Tracer } from '@opentelemetry/api'

const TRACER_NAME = 'wismo-dashboard'

let _tracer: Tracer | null = null

function getTracer(): Tracer {
  if (!_tracer) {
    _tracer = trace.getTracer(TRACER_NAME, '1.0.0')
  }
  return _tracer
}

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

export { trace, SpanStatusCode }
