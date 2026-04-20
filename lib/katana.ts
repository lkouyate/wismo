import { withRetry } from '@/lib/retry'
import { katanaCircuit } from '@/lib/circuit-breaker'
import { cacheGet, cacheSet } from '@/lib/redis'

const KATANA_BASE = 'https://api.katanamrp.com/v1'
const ORDER_CACHE_TTL = 300 // 5 minutes in seconds

export async function katanaRequest<T>(
  path: string,
  apiKey: string,
  params?: Record<string, string>
): Promise<T> {
  return withRetry(async () => {
    const url = new URL(`${KATANA_BASE}${path}`)
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
    }
    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Katana API error ${res.status}: ${text}`)
    }
    return res.json()
  })
}

export async function testKatanaConnection(apiKey: string) {
  const [orders, customers] = await Promise.all([
    katanaRequest<{ data: unknown[] }>('/sales_orders', apiKey),
    katanaRequest<{ data: unknown[] }>('/customers', apiKey),
  ])
  return {
    orderCount: orders.data?.length ?? 0,
    customerCount: customers.data?.length ?? 0,
  }
}

export async function getKatanaOrder(apiKey: string, poNumber: string) {
  const cacheKey = `katana:order:${apiKey.slice(-8)}_${poNumber}`
  const cached = await cacheGet<unknown>(cacheKey)
  if (cached) return cached

  const result = await katanaCircuit.call(() =>
    katanaRequest<{ data: unknown[] }>('/sales_orders', apiKey, { search: poNumber })
  )

  if (!result) return null // Circuit is open — service is down
  const data = result.data?.[0] ?? null
  if (data) await cacheSet(cacheKey, data, ORDER_CACHE_TTL)
  return data
}

export async function getKatanaCustomers(apiKey: string) {
  const [customersRes, contactsRes] = await Promise.all([
    katanaRequest<{ data: unknown[] }>('/customers', apiKey),
    katanaRequest<{ data: unknown[] }>('/contacts', apiKey).catch(() => ({ data: [] })),
  ])
  return {
    customers: customersRes.data ?? [],
    contacts: contactsRes.data ?? [],
  }
}
