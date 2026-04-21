# WISMO Monitoring Setup

## Grafana Cloud (recommended)

1. **Create a free Grafana Cloud account** at https://grafana.com/products/cloud/
2. Go to **Connections > OpenTelemetry (OTLP)** and copy the endpoint + token
3. Set these env vars in `.env.local` and Vercel:

```env
OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp-gateway-prod-us-central-0.grafana.net/otlp
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Basic <base64(instanceId:token)>
OTEL_SERVICE_NAME=wismo-dashboard
```

4. Restart the app — you should see `[OTEL] OpenTelemetry tracing + metrics initialized` in logs
5. Import the 4 dashboards from `monitoring/dashboards/*.json` via Grafana UI > Dashboards > Import

## Available Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `wismo.api.latency_ms` | Histogram | route, status | API handler latency |
| `wismo.api.requests_total` | Counter | route, status | Total requests |
| `wismo.api.errors_total` | Counter | route, status | Total errors (4xx/5xx) |
| `wismo.pipeline.queries_total` | Counter | confidence, mode | Pipeline queries processed |
| `wismo.escalations.created_total` | Counter | — | Escalations created |
| `wismo.claude.latency_ms` | Histogram | operation, model | Claude API call latency |
| `wismo.carrier.lookups_total` | Counter | carrier | Carrier tracking lookups |
| `wismo.billing.blocks_total` | Counter | route | Billing-blocked requests |
| `wismo.webhook.enqueued_total` | Counter | — | Webhook email jobs enqueued |

## Dashboards

| Dashboard | UID | Panels |
|-----------|-----|--------|
| SLA Performance | `wismo-sla` | P50/P95/P99 latency, Claude latency, SLA compliance |
| Pipeline Health | `wismo-pipeline` | Request/error rates, availability, billing blocks |
| Business Metrics | `wismo-business` | Queries/day, escalation rate, carrier lookups, Claude cost |
| Error Explorer | `wismo-errors` | Error breakdown, error rate gauge, Tempo trace search |

## Alerting

Set up Grafana alerts on:
- **P1**: Error rate > 5% for 5 min → PagerDuty/Slack
- **P2**: P95 latency > 30s for 10 min → Slack
- **P3**: Escalation rate > 25% for 1h → Email digest
