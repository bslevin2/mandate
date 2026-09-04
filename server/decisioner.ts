import { z } from 'zod'
import {
  appendAudit,
  findByAuthId,
  findByAuthIdAny,
  sessionSpendUsd,
} from './audit.js'
import {
  evaluateAiConfig,
  evaluateFlags,
  trackMetric,
  DEFAULT_SYSTEM,
} from './ld.js'
import {
  chatWithFallback,
  hasOpenRouterKey,
  resolveInferenceMode,
  type InferenceMode,
} from './openrouter.js'
import { fireOpsWebhook } from './webhook.js'
import type {
  AudienceId,
  AuditRow,
  DecideInput,
  Decision,
  Evidence,
  LdContextAttrs,
  RouteMode,
} from './types.js'

const DecisionSchema = z.object({
  decision: z.enum(['approve', 'decline']),
  reason: z.string().min(1).max(400),
})

/** Simple circuit breaker on recent errors. */
const recent: Array<{ ok: boolean; latencyMs: number; ts: number }> = []
const WINDOW_MS = 60_000
const ERROR_THRESHOLD = 0.5
const MIN_SAMPLES = 5

function recordOutcome(ok: boolean, latencyMs: number) {
  const now = Date.now()
  recent.push({ ok, latencyMs, ts: now })
  while (recent.length && now - recent[0]!.ts > WINDOW_MS) recent.shift()
}

export function circuitOpen(): boolean {
  if (recent.length < MIN_SAMPLES) return false
  const errors = recent.filter((r) => !r.ok).length
  return errors / recent.length >= ERROR_THRESHOLD
}

function redactContext(raw: Record<string, unknown>): Record<string, unknown> {
  const sent = { ...raw }
  delete sent.panDemo
  if (typeof sent.cardLast4 === 'string') {
    sent.cardLast4 = `****${sent.cardLast4}`
  }
  return sent
}

function authSummary(input: DecideInput): string {
  const a = input.auth
  return JSON.stringify({
    phase: input.phase ?? 'authorize',
    amount_cents: a.amountCents,
    currency: a.currency,
    mcc: a.mcc,
    merchant: a.merchant,
    agent_id: a.agentId,
    env: input.context.env,
    risk_tier: input.context.risk_tier,
    tenant: input.context.tenant,
  })
}

function parseDecision(content: string): { decision: Decision; reason: string } | null {
  try {
    const jsonStart = content.indexOf('{')
    const jsonEnd = content.lastIndexOf('}')
    if (jsonStart < 0 || jsonEnd < 0) return null
    const parsed = JSON.parse(content.slice(jsonStart, jsonEnd + 1))
    const result = DecisionSchema.safeParse(parsed)
    if (!result.success) return null
    return result.data
  } catch {
    return null
  }
}

export function buildTargetingReason(
  audienceId: AudienceId,
  context: LdContextAttrs,
  route: RouteMode,
  treatment: string,
  flagSource: 'launchdarkly' | 'local-fallback',
): string {
  const parts = [
    `audience=${audienceId}`,
    `env=${context.env}`,
    `risk=${context.risk_tier}`,
    `mcc=${context.mcc}`,
    `amount_cents=${context.amount_cents}`,
    `email=${context.email}`,
    `→ route=${route}`,
    `treatment=${treatment}`,
    `source=${flagSource}`,
  ]
  if (context.email === 'qa@mandate.local') {
    parts.push('(individual: QA dogfood)')
  }
  return parts.join(' · ')
}

function emptyEvidence(partial: Partial<Evidence>): Evidence {
  return {
    decisionerLive: false,
    route: 'fast',
    treatment: 'control',
    aiConfigKey: null,
    aiConfigEnabled: false,
    promptPreview: null,
    model: null,
    latencyMs: null,
    promptTokens: null,
    completionTokens: null,
    costUsd: null,
    requestId: null,
    contextSent: {},
    contextRaw: {},
    reason: '',
    error: null,
    hop: null,
    shadowDecision: null,
    shadowModel: null,
    shadowDiff: null,
    captureAllowed: true,
    spendCapHit: false,
    circuitOpen: false,
    targetingReason: null,
    flagSource: null,
    inferenceMode: null,
    ...partial,
  }
}

export interface RuntimeControls {
  breakPipe: boolean
  failoverDemo: boolean
  inferenceMode: InferenceMode
  networkDelayMs: number
  budgetUsd: number | null
}

function defaultInferenceMode(): InferenceMode {
  return hasOpenRouterKey() ? 'live' : 'simulator'
}

let controls: RuntimeControls = {
  breakPipe: false,
  failoverDemo: false,
  inferenceMode: defaultInferenceMode(),
  networkDelayMs: 0,
  budgetUsd: null,
}

export function getControls() {
  return { ...controls }
}

export function setControls(patch: Partial<RuntimeControls>) {
  const next = { ...controls, ...patch }
  // Mutual exclusion: break vs failover
  if (patch.breakPipe === true) next.failoverDemo = false
  if (patch.failoverDemo === true) next.breakPipe = false
  if (patch.inferenceMode) {
    next.inferenceMode = resolveInferenceMode(patch.inferenceMode)
  }
  controls = next
  return getControls()
}

export async function decide(input: DecideInput): Promise<AuditRow> {
  const phase = input.phase ?? 'authorize'
  const tenant = input.context.tenant

  // Cross-tenant: same authId owned by another tenant → fail closed.
  const foreign = findByAuthIdAny(input.auth.authId)
  if (foreign && foreign.tenant !== tenant) {
    const evidence = emptyEvidence({
      decisionerLive: true,
      route: 'fast',
      treatment: 'control',
      contextRaw: { ...input.context },
      contextSent: redactContext({ ...input.context }),
      reason: `Tenant isolation — auth belongs to tenant "${foreign.tenant}", not "${tenant}"`,
      error: 'cross_tenant_denied',
      hop: 'tenant-isolation',
      captureAllowed: false,
    })
    return persist(input, 'decline', evidence, phase)
  }

  const existing = findByAuthId(input.auth.authId, tenant)
  if (existing && phase === 'authorize' && !input.tamper) {
    return existing
  }

  const flags = await evaluateFlags(input.context)
  const inferenceMode = resolveInferenceMode(controls.inferenceMode)
  const targetingReason = buildTargetingReason(
    input.audienceId,
    input.context,
    flags.route,
    flags.treatment,
    flags.source,
  )
  const rawContext = {
    ...input.context,
    merchant: input.auth.merchant,
    agentId: input.auth.agentId,
    cardLast4: input.auth.cardLast4,
    panDemo: input.auth.panDemo,
    amountCents: input.auth.amountCents,
  }
  const contextSent = redactContext(rawContext)
  const open = circuitOpen()

  const baseMeta = {
    targetingReason,
    flagSource: flags.source as 'launchdarkly' | 'local-fallback',
    inferenceMode,
  }

  if (!flags.decisionerLive || open) {
    const evidence = emptyEvidence({
      ...baseMeta,
      decisionerLive: flags.decisionerLive,
      route: flags.route,
      treatment: flags.treatment,
      contextRaw: rawContext,
      contextSent,
      reason: open
        ? 'Circuit breaker open — fail-closed decline'
        : 'Decisioner killed — fail-closed decline',
      circuitOpen: open,
      captureAllowed: flags.captureLive,
    })
    const row = persist(input, 'decline', evidence, phase)
    await trackMetric(input.context, 'auth_declined', 1)
    if (!flags.decisionerLive) {
      await fireOpsWebhook({
        event: 'decisioner_killed',
        audienceId: input.audienceId,
        authId: input.auth.authId,
        request_id: null,
      })
    }
    return row
  }

  if (phase === 'capture' && !flags.captureLive) {
    const evidence = emptyEvidence({
      ...baseMeta,
      decisionerLive: true,
      route: flags.route,
      treatment: flags.treatment,
      contextRaw: rawContext,
      contextSent,
      reason: 'Capture flag off — irreversible path blocked',
      captureAllowed: false,
    })
    return persist(input, 'decline', evidence, phase)
  }

  if (input.auth.mcc === '7995') {
    const evidence = emptyEvidence({
      ...baseMeta,
      decisionerLive: true,
      route: flags.route,
      treatment: flags.treatment,
      contextRaw: rawContext,
      contextSent,
      reason: 'Blocked MCC 7995 — fast-path decline (no model call)',
      hop: 'fast-path',
      captureAllowed: flags.captureLive,
    })
    await trackMetric(input.context, 'auth_declined', 1)
    return persist(input, 'decline', evidence, phase)
  }

  if (input.auth.amountCents > flags.spendCapCents) {
    const evidence = emptyEvidence({
      ...baseMeta,
      decisionerLive: true,
      route: flags.route,
      treatment: flags.treatment,
      contextRaw: rawContext,
      contextSent,
      reason: `Spend cap ${flags.spendCapCents}¢ exceeded — fast-path decline`,
      spendCapHit: true,
      hop: 'spend-cap',
      captureAllowed: flags.captureLive,
    })
    await trackMetric(input.context, 'auth_declined', 1)
    return persist(input, 'decline', evidence, phase)
  }

  const spend = sessionSpendUsd(tenant)
  if (controls.budgetUsd != null && spend >= controls.budgetUsd) {
    const evidence = emptyEvidence({
      ...baseMeta,
      decisionerLive: true,
      route: flags.route,
      treatment: flags.treatment,
      contextRaw: rawContext,
      contextSent,
      reason: `Session inference budget $${controls.budgetUsd} hit — refuse model call`,
      hop: 'budget',
      captureAllowed: flags.captureLive,
    })
    await fireOpsWebhook({
      event: 'cost_spike',
      sessionSpendUsd: spend,
      audienceId: input.audienceId,
    })
    return persist(input, 'decline', evidence, phase)
  }

  const forceModel =
    input.breakPipe ||
    controls.breakPipe ||
    controls.failoverDemo

  if (flags.route === 'fast' && !forceModel) {
    const decision: Decision =
      input.context.risk_tier === 'low' &&
      input.auth.amountCents <= flags.spendCapCents
        ? 'approve'
        : 'decline'
    const evidence = emptyEvidence({
      ...baseMeta,
      decisionerLive: true,
      route: 'fast',
      treatment: flags.treatment,
      contextRaw: rawContext,
      contextSent,
      reason:
        decision === 'approve'
          ? 'Fast-path policy approve (audience route=fast)'
          : 'Fast-path policy decline',
      hop: 'fast-path',
      latencyMs: 1,
      captureAllowed: flags.captureLive,
    })
    await trackMetric(
      input.context,
      decision === 'approve' ? 'auth_approved' : 'auth_declined',
      1,
    )
    await trackMetric(input.context, 'auth_latency_ms', 1)
    return persist(input, decision, evidence, phase)
  }

  const summary = authSummary(input)
  const ai = await evaluateAiConfig(input.context, summary)
  const model =
    ai.model || process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini'
  const messages = ai.messages.length
    ? ai.messages
    : [
        { role: 'system', content: DEFAULT_SYSTEM },
        { role: 'user', content: summary },
      ]
  const promptPreview =
    messages.find((m) => m.role === 'system')?.content?.slice(0, 280) ??
    ai.systemPrompt.slice(0, 280)

  const chat = await chatWithFallback({
    model,
    messages,
    breakPipe: input.breakPipe || controls.breakPipe,
    failoverDemo: controls.failoverDemo,
    delayMs: controls.networkDelayMs,
    inferenceMode,
    authId: input.auth.authId,
    simHints: {
      mcc: input.auth.mcc,
      amountCents: input.auth.amountCents,
      risk_tier: input.context.risk_tier,
      env: input.context.env,
    },
  })

  const parsed = chat.content ? parseDecision(chat.content) : null
  let decision: Decision = 'decline'
  let reason = 'Fail-closed decline'
  let error = chat.error

  if (parsed) {
    decision = parsed.decision
    reason = parsed.reason
    recordOutcome(true, chat.latencyMs)
  } else {
    error = error || 'Invalid or missing JSON from model — fail-closed'
    reason = error
    recordOutcome(false, chat.latencyMs)
  }

  let shadowDecision: Decision | null = null
  let shadowModel: string | null = null
  let shadowDiff: boolean | null = null

  if (input.shadow) {
    const shadowAi = await evaluateAiConfig(
      input.context,
      summary,
      `${process.env.LD_AI_CONFIG_KEY || 'mandate-decisioner'}-shadow`,
    )
    const shadowChat = await chatWithFallback({
      model: shadowAi.model || process.env.OPENROUTER_FALLBACK_MODEL || model,
      messages: shadowAi.messages,
      delayMs: 0,
      inferenceMode,
      authId: `${input.auth.authId}_shadow`,
      simHints: {
        mcc: input.auth.mcc,
        amountCents: input.auth.amountCents,
        risk_tier: input.context.risk_tier,
        env: input.context.env,
      },
    })
    const shadowParsed = shadowChat.content
      ? parseDecision(shadowChat.content)
      : null
    shadowDecision = shadowParsed?.decision ?? 'decline'
    shadowModel = shadowChat.model
    shadowDiff = shadowDecision !== decision
  }

  const evidence = emptyEvidence({
    ...baseMeta,
    decisionerLive: true,
    route: 'model',
    treatment: flags.treatment,
    aiConfigKey: ai.key,
    aiConfigEnabled: ai.enabled,
    promptPreview,
    model: chat.model,
    latencyMs: chat.latencyMs,
    promptTokens: chat.promptTokens,
    completionTokens: chat.completionTokens,
    costUsd: chat.costUsd,
    requestId: chat.requestId,
    contextRaw: rawContext,
    contextSent,
    reason,
    error,
    hop: chat.hop,
    shadowDecision,
    shadowModel,
    shadowDiff,
    captureAllowed: flags.captureLive,
    circuitOpen: open,
  })

  await trackMetric(
    input.context,
    decision === 'approve' ? 'auth_approved' : 'auth_declined',
    1,
  )
  await trackMetric(input.context, 'auth_latency_ms', chat.latencyMs)
  if (chat.costUsd != null) {
    await trackMetric(input.context, 'auth_cost_usd', chat.costUsd)
  }

  if (chat.costUsd != null && chat.costUsd > 0.05) {
    await fireOpsWebhook({
      event: 'cost_spike',
      request_id: chat.requestId,
      costUsd: chat.costUsd,
      audienceId: input.audienceId,
    })
  }

  return persist(input, decision, evidence, phase)
}

function persist(
  input: DecideInput,
  decision: Decision,
  evidence: Evidence,
  phase: 'authorize' | 'capture' | 'refund',
): AuditRow {
  return appendAudit({
    id: `row_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    ts: new Date().toISOString(),
    tenant: input.context.tenant,
    audienceId: input.audienceId,
    auth: input.auth,
    decision,
    evidence,
    phase,
  })
}
