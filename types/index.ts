import { Timestamp } from 'firebase-admin/firestore'

export interface Manufacturer {
  uid: string
  email: string
  displayName: string
  katanaApiKey?: string
  katanaConnected: boolean
  upsConnected: boolean
  gmailConnected: boolean
  gmailEmail?: string
  gmailAccessToken?: string
  gmailRefreshToken?: string
  qboConnected: boolean
  qboRealmId?: string
  qboAccessToken?: string
  qboRefreshToken?: string
  qboTokenExpiry?: number
  onboardingStep: number
  onboardingComplete: boolean
  isLive: boolean
  draftMode: boolean
  agentSettings?: AgentSettings
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface AgentSettings {
  responseStyle: 'professional' | 'friendly' | 'concise'
  escalationTriggers: string[]
  customSignature?: string
}

export interface Customer {
  id: string
  companyName: string
  domain: string
  emails: string[]
  source: 'katana' | 'email' | 'manual'
  status: 'active' | 'inactive'
  createdAt: Timestamp
}

export interface Conversation {
  id: string
  customerEmail: string
  customerCompany: string
  customerMessage: string
  agentResponse: string
  status: 'resolved' | 'escalated' | 'draft' | 'draft_discarded'
  confidence: 'high' | 'medium' | 'needs_attention'
  dataSources: string[]
  poNumber?: string
  trackingNumber?: string
  isDraft: boolean
  draftEditedByManufacturer: boolean
  slaDeadline: Timestamp
  sentAt: Timestamp | null
  createdAt: Timestamp
}

export interface Escalation {
  id: string
  conversationId: string
  reason: string
  slaDeadline: Timestamp
  status: 'open' | 'resolved'
  assignedTo: string | null
  internalNotes: string[]
  createdAt: Timestamp
}

export interface KatanaOrder {
  id: number
  order_no: string
  status: string
  delivery_deadline?: string
  tracking_number?: string
  customer_name?: string
  customer_email?: string
  total_price: number
  currency: string
}

export interface KatanaCustomer {
  id: number
  name: string
  email?: string
  contact_email?: string
}

export interface UPSTrackingEvent {
  date: string
  time: string
  location: string
  description: string
}

export interface UPSTrackingResult {
  trackingNumber: string
  status: string
  estimatedDelivery?: string
  events: UPSTrackingEvent[]
}

export interface QBOInvoice {
  id: string
  docNumber: string
  txnDate: string
  shipDate?: string
  trackingNum?: string
  totalAmt: number
  balance: number
  status: 'invoiced' | 'partial' | 'not_invoiced'
  customerRef: { value: string; name: string }
}

export interface QBOTokens {
  accessToken: string
  refreshToken: string
  expiresIn: number
}
