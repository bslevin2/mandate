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

export interface GenerationLookup {
  id: string | null
  model: string | null
  providerName: string | null
  totalCost: number | null
  finishReason: string | null
  nativeFinishReason: string | null
  isByok: boolean | null
  tokensPrompt: number | null
  tokensCompletion: number | null
  latency: number | null
  providerResponsesCount: number | null
  error: string | null
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
  requestedModels: string[] | null
  servedProvider: string | null
  inferencePolicy: string | null
  allowProviderFailover: boolean | null
  inferenceUser: string | null
  generationLookup: GenerationLookup | null
  forceModelPath: boolean | null
}

export interface AuditRow {
  id: string
  ts: string
  /** Tenant that owns this decision — isolation boundary. */
  tenant: string
  audienceId: AudienceId
  auth: AuthRequest
  decision: Decision
  evidence: Evidence
  phase: 'authorize' | 'capture' | 'refund'
  /** SHA-256 of previous tip (or genesis). */
  prevHash: string
  /** SHA-256 over canonical payload + prevHash. */
  rowHash: string
}

export interface DecideInput {
  audienceId: AudienceId
  context: LdContextAttrs
  auth: AuthRequest
  /** Force a broken primary inference hop. */
  breakPipe?: boolean
  /** Skip model and attempt approve while decisioner may be killed (tamper). */
  tamper?: boolean
  phase?: 'authorize' | 'capture' | 'refund'
  /** Run shadow decision config in parallel. */
  shadow?: boolean
}
