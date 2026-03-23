const KATANA_BASE = 'https://api.katanamrp.com/v1'

export async function katanaRequest<T>(
  path: string,
  apiKey: string,
  params?: Record<string, string>
): Promise<T> {
  const url = new URL(`${KATANA_BASE}${path}`)
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  }
  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Katana API error ${res.status}: ${text}`)
  }
  return res.json()
}

export async function testKatanaConnection(apiKey: string) {
  const [orders, customers] = await Promise.all([
    katanaRequest<{ data: unknown[] }>('/sales-orders', apiKey),
    katanaRequest<{ data: unknown[] }>('/customers', apiKey),
  ])
  return {
    orderCount: orders.data?.length ?? 0,
    customerCount: customers.data?.length ?? 0,
  }
}

export async function getKatanaOrder(apiKey: string, poNumber: string) {
  const result = await katanaRequest<{ data: unknown[] }>(
    '/sales-orders',
    apiKey,
    { search: poNumber }
  )
  return result.data?.[0] ?? null
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
