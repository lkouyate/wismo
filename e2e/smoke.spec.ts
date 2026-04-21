import { test, expect } from '@playwright/test'

test.describe('Public pages', () => {
  test('login page renders with Google sign-in button', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('img[alt="WISMO"]')).toBeVisible()
    await expect(page.getByText('Welcome back')).toBeVisible()
    await expect(page.getByText('Continue with Google')).toBeVisible()
  })

  test('login page shows Terms of Service notice', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByText('Terms of Service')).toBeVisible()
  })

  test('root page redirects unauthenticated users to /login', async ({ page }) => {
    await page.goto('/')
    // Should redirect to /login (proxy middleware or client-side redirect)
    await page.waitForURL('**/login', { timeout: 10_000 })
    expect(page.url()).toContain('/login')
  })
})

test.describe('Route protection', () => {
  test('dashboard redirects to login without session', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForURL('**/login', { timeout: 10_000 })
    expect(page.url()).toContain('/login')
  })

  test('onboarding redirects to login without session', async ({ page }) => {
    await page.goto('/onboarding/step-1')
    await page.waitForURL('**/login', { timeout: 10_000 })
    expect(page.url()).toContain('/login')
  })

  test('dashboard/drafts redirects to login without session', async ({ page }) => {
    await page.goto('/dashboard/drafts')
    await page.waitForURL('**/login', { timeout: 10_000 })
    expect(page.url()).toContain('/login')
  })

  test('dashboard/conversations redirects to login without session', async ({ page }) => {
    await page.goto('/dashboard/conversations')
    await page.waitForURL('**/login', { timeout: 10_000 })
    expect(page.url()).toContain('/login')
  })
})

test.describe('API routes', () => {
  test('agent/run returns 401 without auth token', async ({ request }) => {
    const res = await request.post('/api/agent/run', {
      data: {},
    })
    expect(res.status()).toBe(401)
    const json = await res.json()
    expect(json.error).toBe('Unauthorized')
  })

  test('gmail webhook returns 401 without auth', async ({ request }) => {
    const res = await request.post('/api/gmail/webhook', {
      data: { message: { data: btoa('{}') } },
    })
    expect(res.status()).toBe(401)
  })
})
