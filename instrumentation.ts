export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { validateEnv } = await import('@/lib/validate-env')
    try {
      validateEnv()
    } catch (err) {
      // Log warning but don't crash the server — env may be partially configured in dev
      console.warn(err instanceof Error ? err.message : err)
    }

    // Initialize OpenTelemetry if configured
    if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
      try {
        const { NodeSDK } = await import('@opentelemetry/sdk-node')
        const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http')
        const { OTLPMetricExporter } = await import('@opentelemetry/exporter-metrics-otlp-http')
        const { PeriodicExportingMetricReader } = await import('@opentelemetry/sdk-metrics')
        const { resourceFromAttributes } = await import('@opentelemetry/resources')
        const { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } = await import('@opentelemetry/semantic-conventions')

        const headers: Record<string, string> = {}
        const rawHeaders = process.env.OTEL_EXPORTER_OTLP_HEADERS
        if (rawHeaders) {
          for (const pair of rawHeaders.split(',')) {
            const [key, ...rest] = pair.split('=')
            if (key && rest.length) headers[key.trim()] = rest.join('=').trim()
          }
        }

        const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT

        const sdk = new NodeSDK({
          resource: resourceFromAttributes({
            [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? 'wismo-dashboard',
            [ATTR_SERVICE_VERSION]: '1.0.0',
            'deployment.environment': process.env.NODE_ENV ?? 'development',
          }),
          traceExporter: new OTLPTraceExporter({
            url: `${endpoint}/v1/traces`,
            headers,
          }),
          metricReader: new PeriodicExportingMetricReader({
            exporter: new OTLPMetricExporter({
              url: `${endpoint}/v1/metrics`,
              headers,
            }),
            exportIntervalMillis: 60_000, // flush metrics every 60s
          }),
        })
        sdk.start()
        console.log('[OTEL] OpenTelemetry tracing + metrics initialized')
      } catch (err) {
        console.warn('[OTEL] Failed to initialize:', err instanceof Error ? err.message : err)
      }
    }
  }
}
