const REQUIRED_SERVER_VARS = [
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
  'ANTHROPIC_API_KEY',
  'UPS_CLIENT_ID',
  'UPS_CLIENT_SECRET',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
] as const

export function validateEnv() {
  const missing = REQUIRED_SERVER_VARS.filter(key => !process.env[key])
  if (missing.length > 0) {
    throw new Error(
      `[WISMO] Missing required environment variables:\n${missing.map(k => `  - ${k}`).join('\n')}\n\nCheck your .env.local file.`
    )
  }
}
