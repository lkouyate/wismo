/**
 * Seed test manufacturer data for the admin panel.
 * Run: node scripts/seed-test-data.mjs
 */
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load .env.local manually
const envPath = resolve(__dirname, '../.env.local')
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      privateKey: env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n').replace(/^"|"$/g, ''),
    }),
  })
}

const db = getFirestore()

const now = Timestamp.now()
const daysAgo = (n) => Timestamp.fromDate(new Date(Date.now() - n * 86400000))
const daysFromNow = (n) => Timestamp.fromDate(new Date(Date.now() + n * 86400000))

const manufacturers = [
  {
    id: 'test-mfg-001',
    data: {
      uid: 'test-mfg-001',
      email: 'ops@acmefurniture.com',
      displayName: 'Acme Furniture Co.',
      isLive: true,
      draftMode: false,
      onboardingComplete: true,
      katanaConnected: true,
      upsConnected: true,
      gmailConnected: true,
      gmailEmail: 'ops@acmefurniture.com',
      gmailHistoryId: '28441920',
      gmailWatchExpiry: Timestamp.fromDate(new Date(Date.now() + 3 * 86400000)),
      plan: 'pro',
      planStartedAt: daysAgo(30),
      agentSettings: {
        responseStyle: 'professional',
        customSignature: 'The Acme Furniture Team',
        escalationTriggers: ['refund', 'damaged', 'missing'],
      },
      createdAt: daysAgo(45),
      updatedAt: daysAgo(1),
    },
  },
  {
    id: 'test-mfg-002',
    data: {
      uid: 'test-mfg-002',
      email: 'hello@brightlighting.io',
      displayName: 'Bright Lighting Solutions',
      isLive: true,
      draftMode: true,
      onboardingComplete: true,
      katanaConnected: true,
      upsConnected: true,
      gmailConnected: true,
      gmailEmail: 'hello@brightlighting.io',
      gmailHistoryId: '19002341',
      gmailWatchExpiry: Timestamp.fromDate(new Date(Date.now() - 1 * 86400000)), // expired
      plan: 'starter',
      planStartedAt: daysAgo(20),
      agentSettings: {
        responseStyle: 'friendly',
        customSignature: 'Bright Lighting Support',
        escalationTriggers: ['broken', 'wrong item'],
      },
      createdAt: daysAgo(30),
      updatedAt: daysAgo(3),
    },
  },
  {
    id: 'test-mfg-003',
    data: {
      uid: 'test-mfg-003',
      email: 'info@nordictextiles.com',
      displayName: 'Nordic Textiles AB',
      isLive: false,
      draftMode: true,
      onboardingComplete: false,
      katanaConnected: true,
      upsConnected: true,
      gmailConnected: false,
      plan: 'free_trial',
      trialEndsAt: daysFromNow(9),
      agentSettings: {
        responseStyle: 'concise',
        customSignature: '',
        escalationTriggers: [],
      },
      createdAt: daysAgo(7),
      updatedAt: daysAgo(7),
    },
  },
]

const conversations = {
  'test-mfg-001': [
    { customerEmail: 'buyer@retailchain.com', customerCompany: 'Retail Chain Inc.', status: 'resolved', confidence: 'high', subject: 'RE: Order PO-2291 shipping update', createdAt: daysAgo(1) },
    { customerEmail: 'procurement@homegoods.co', customerCompany: 'Home Goods Co.', status: 'resolved', confidence: 'high', subject: 'RE: Where is my order PO-2287?', createdAt: daysAgo(2) },
    { customerEmail: 'logistics@designhouse.com', customerCompany: 'Design House LLC', status: 'escalated', confidence: 'needs_attention', subject: 'RE: Order PO-2280 damaged on arrival', createdAt: daysAgo(3) },
    { customerEmail: 'buyer@retailchain.com', customerCompany: 'Retail Chain Inc.', status: 'resolved', confidence: 'medium', subject: 'RE: PO-2271 delivery ETA', createdAt: daysAgo(5) },
    { customerEmail: 'orders@furnishco.com', customerCompany: 'Furnish Co.', status: 'draft', confidence: 'high', subject: 'RE: Status on PO-2298', createdAt: daysAgo(0) },
  ],
  'test-mfg-002': [
    { customerEmail: 'purchasing@luminos.com', customerCompany: 'Luminos Group', status: 'resolved', confidence: 'high', subject: 'RE: Order #LB-441 tracking', createdAt: daysAgo(2) },
    { customerEmail: 'ops@interiorplus.net', customerCompany: 'Interior Plus', status: 'escalated', confidence: 'needs_attention', subject: 'RE: Wrong item shipped LB-438', createdAt: daysAgo(4) },
    { customerEmail: 'purchasing@luminos.com', customerCompany: 'Luminos Group', status: 'resolved', confidence: 'medium', subject: 'RE: LB-429 delayed shipment', createdAt: daysAgo(8) },
  ],
}

const customers = {
  'test-mfg-001': [
    { company: 'Retail Chain Inc.', domain: 'retailchain.com', emails: ['buyer@retailchain.com'], active: true, source: 'katana' },
    { company: 'Home Goods Co.', domain: 'homegoods.co', emails: ['procurement@homegoods.co'], active: true, source: 'katana' },
    { company: 'Design House LLC', domain: 'designhouse.com', emails: ['logistics@designhouse.com'], active: true, source: 'katana' },
    { company: 'Furnish Co.', domain: 'furnishco.com', emails: ['orders@furnishco.com'], active: true, source: 'katana' },
  ],
  'test-mfg-002': [
    { company: 'Luminos Group', domain: 'luminos.com', emails: ['purchasing@luminos.com'], active: true, source: 'katana' },
    { company: 'Interior Plus', domain: 'interiorplus.net', emails: ['ops@interiorplus.net'], active: true, source: 'katana' },
  ],
}

const escalations = {
  'test-mfg-001': [
    { customerEmail: 'logistics@designhouse.com', customerCompany: 'Design House LLC', reason: 'Customer reported damaged goods on arrival. Requires manual follow-up.', status: 'open', slaDeadline: Timestamp.fromDate(new Date(Date.now() + 2 * 3600000)), notes: [], createdAt: daysAgo(0) },
  ],
  'test-mfg-002': [
    { customerEmail: 'ops@interiorplus.net', customerCompany: 'Interior Plus', reason: 'Wrong item shipped — customer requesting return label.', status: 'open', slaDeadline: Timestamp.fromDate(new Date(Date.now() + 1 * 3600000)), notes: ['Checked order — wrong SKU was picked'], createdAt: daysAgo(0) },
  ],
}

async function seed() {
  console.log('Seeding test manufacturers...')

  for (const { id, data } of manufacturers) {
    await db.collection('manufacturers').doc(id).set(data)
    console.log(`  ✓ ${data.displayName}`)

    // Conversations
    for (const conv of conversations[id] ?? []) {
      await db.collection('manufacturers').doc(id).collection('conversations').add({
        ...conv,
        updatedAt: conv.createdAt,
      })
    }
    console.log(`    + ${(conversations[id] ?? []).length} conversations`)

    // Customers
    for (const cust of customers[id] ?? []) {
      await db.collection('manufacturers').doc(id).collection('customers').add({
        ...cust,
        createdAt: now,
      })
    }
    console.log(`    + ${(customers[id] ?? []).length} customers`)

    // Escalations
    for (const esc of escalations[id] ?? []) {
      await db.collection('manufacturers').doc(id).collection('escalations').add(esc)
    }
    console.log(`    + ${(escalations[id] ?? []).length} escalations`)
  }

  console.log('\nDone! Refresh /admin/manufacturers to see test data.')
  process.exit(0)
}

seed().catch(err => { console.error(err); process.exit(1) })
