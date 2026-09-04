export type Decision = 'approve' | 'decline'

export type RouteMode = 'fast' | 'model'

export type AudienceId =
  | 'sandbox-low'
  | 'prod-high'
  | 'blocked-mcc'
  | 'qa-dogfood'

export interface AuthRequest {
  authId: string
  amountCents: number
  currency: string
  mcc: string
  merchant: string
  agentId: string
  /** Optional PAN-shaped field for redaction demo — never sent to the model. */
  cardLast4?: string
  panDemo?: string
}

export interface LdContextAttrs {
  key: string
  email: string
  env: 'sandbox' | 'prod'
  risk_tier: 'low' | 'high'
  tenant: string
  mcc: string
  amount_cents: number
}

export interface Audience {
  id: AudienceId
  label: string
  description: string
  context: LdContextAttrs
}

export interface Evidence {
  decisionerLive: boolean
  route: RouteMode
  treatment: string
  aiConfigKey: string | null
  aiConfigEnabled: boolean
  promptPreview: string | null
  model: string | null
  latencyMs: number | null
  promptTokens: number | null
  completionTokens: number | null
  costUsd: number | null
  requestId: string | null
  contextSent: Record<string, unknown>
  contextRaw: Record<string, unknown>
  reason: string
  error: string | null
  hop: string | null
  shadowDecision: Decision | null
  shadowModel: string | null
  shadowDiff: boolean | null
  captureAllowed: boolean
  spendCapHit: boolean
  circuitOpen: boolean
  targetingReason: string | null
  flagSource: 'launchdarkly' | 'local-fallback' | null
  inferenceMode: 'live' | 'simulator' | null
}

export interface AuditRow {
  id: string
  ts: string
  tenant: string
  audienceId: AudienceId
  auth: AuthRequest
  decision: Decision
  evidence: Evidence
  phase: 'authorize' | 'capture' | 'refund'
  prevHash: string
  rowHash: string
}

export interface AuthorizeResponse {
  decision: Decision
  evidence: Evidence
  audit: AuditRow
  sessionSpendUsd: number
}

export interface StatusResponse {
  decisionerLive: boolean
  route: RouteMode
  treatment: string
  captureLive: boolean
  localKill: boolean
  circuitOpen: boolean
  sessionSpendUsd: number
  auditCount: number
  breakPipe: boolean
  networkDelayMs: number
  integrityValid?: boolean
  integrityBrokenAt?: string | null
}
