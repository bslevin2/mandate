/**
 * Live / practice completions for the model path.
 * Live: control-plane decision config → provider handler (metrics recorded by the AI SDK).
 * Practice: deterministic local simulator when no provider key is set.
 */

import {
  config,
  inspectConfig,
  type AiConfigRep,
} from '@launchdarkly/ai-server'
import { createOpenAIHandler } from '@launchdarkly/ai-openai-messages'
import { createClaudeMessagesHandler } from '@launchdarkly/ai-claude-messages'
import type { LdContextAttrs } from './types.js'
import { toLdContext } from './ld.js'

export type InferenceMode = 'live' | 'simulator'

export interface ChatResult {
  content: string
  model: string
  requestId: string | null
  latencyMs: number
  promptTokens: number | null
  completionTokens: number | null
  costUsd: number | null
  hop: string
  error: string | null
  servedProvider: string | null
  judgeEvaluation: string | null
}

export interface CompleteArgs {
  configKey: string
  authSummary: string
  context: LdContextAttrs
  breakPipe?: boolean
  delayMs?: number
  inferenceMode?: InferenceMode
  authId?: string
  simHints?: {
    mcc?: string
    amountCents?: number
    risk_tier?: string
    env?: string
  }
}

export interface DecisionConfigSnapshot {
  key: string
  enabled: boolean
  model: string | null
  provider: string | null
  systemPrompt: string
  source: 'launchdarkly' | 'local-fallback'
}

const DEFAULT_SYSTEM = `You are Mandate, an automated authorization decisioner for agent spend.
Return ONLY valid JSON: {"decision":"approve"|"decline","reason":"short string"}.
Fail closed on uncertainty. Decline blocked MCC 7995. Prefer decline when amount is high for the risk tier.
Never include card numbers or PII in the reason.`

const DEFAULT_MODEL = process.env.INFERENCE_DEFAULT_MODEL || 'gpt-4.1-nano'

export function hasProviderKey(): boolean {
  return Boolean(
    process.env.OPENAI_API_KEY?.trim() ||
      process.env.ANTHROPIC_API_KEY?.trim(),
  )
}

export function resolveInferenceMode(
  requested?: InferenceMode,
): InferenceMode {
  if (requested === 'live' || requested === 'simulator') return requested
  return hasProviderKey() ? 'live' : 'simulator'
}

function emptyChat(
  partial: Partial<ChatResult> & Pick<ChatResult, 'model' | 'hop'>,
): ChatResult {
  return {
    content: '',
    requestId: null,
    latencyMs: 0,
    promptTokens: null,
    completionTokens: null,
    costUsd: null,
    error: null,
    servedProvider: null,
    judgeEvaluation: null,
    ...partial,
  }
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function simulateDecision(args: CompleteArgs): ChatResult {
  const hints = args.simHints ?? {}
  const mcc = hints.mcc ?? ''
  const amount = hints.amountCents ?? 0
  const risk = hints.risk_tier ?? 'low'

  let decision: 'approve' | 'decline' = 'approve'
  let reason = 'Simulator approve — low-risk policy'

  if (mcc === '7995') {
    decision = 'decline'
    reason = 'Simulator decline — blocked MCC'
  } else if (risk === 'high' && amount > 50_000) {
    decision = 'decline'
    reason = 'Simulator decline — high risk / high amount'
  } else if (amount > 100_000) {
    decision = 'decline'
    reason = 'Simulator decline — amount over practice ceiling'
  }

  const idBase =
    args.authId?.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12) || 'sim'
  return emptyChat({
    content: JSON.stringify({ decision, reason }),
    model: 'simulator',
    requestId: `sim_${idBase}_${Date.now().toString(36)}`,
    latencyMs: 8,
    promptTokens: 40,
    completionTokens: 24,
    hop: 'simulator',
    servedProvider: 'simulator',
  })
}

function systemFromConfig(cfg: AiConfigRep | null): string {
  if (!cfg) return DEFAULT_SYSTEM
  const fromMessages = cfg.messages?.find((m) => m.role === 'system')?.content
  if (fromMessages?.trim()) return fromMessages
  if (cfg.instructions?.trim()) return cfg.instructions
  return DEFAULT_SYSTEM
}

export async function resolveDecisionConfig(
  attrs: LdContextAttrs,
  configKey = process.env.LD_AI_CONFIG_KEY || 'mandate-decisioner',
): Promise<DecisionConfigSnapshot> {
  const fallback: DecisionConfigSnapshot = {
    key: configKey,
    enabled: true,
    model: DEFAULT_MODEL,
    provider: null,
    systemPrompt: DEFAULT_SYSTEM,
    source: 'local-fallback',
  }

  if (!process.env.LD_SDK_KEY?.trim()) return fallback

  try {
    const inspected = await inspectConfig(configKey, toLdContext(attrs))
    if (!inspected.config) {
      return { ...fallback, enabled: Boolean(inspected.enabled) }
    }
    return {
      key: configKey,
      enabled: Boolean(inspected.enabled ?? inspected.meta?.enabled ?? true),
      model: inspected.config.model?.name
        ? String(inspected.config.model.name)
        : fallback.model,
      provider: inspected.config.provider?.name
        ? String(inspected.config.provider.name)
        : null,
      systemPrompt: systemFromConfig(inspected.config),
      source: 'launchdarkly',
    }
  } catch (err) {
    console.warn('[inference] decision config inspect failed:', err)
    return fallback
  }
}

function formatJudgeEvaluation(
  judges: Record<string, { score: number; response: string }> | undefined,
): string | null {
  if (!judges) return null
  const entries = Object.entries(judges)
  if (!entries.length) return null
  return entries
    .map(
      ([name, j]) =>
        `${name}: score=${j.score} · ${j.response.slice(0, 120)}`,
    )
    .join(' | ')
}

/**
 * Complete a decision via the control-plane adapter (live) or local simulator.
 */
export async function completeDecision(
  args: CompleteArgs,
): Promise<ChatResult> {
  const mode = resolveInferenceMode(args.inferenceMode)

  if (args.delayMs && args.delayMs > 0) {
    await sleep(args.delayMs)
  }

  if (args.breakPipe) {
    return emptyChat({
      model: 'broken',
      hop: 'break',
      error: 'AI path broken — fail-closed',
      latencyMs: 1,
    })
  }

  if (mode === 'simulator' || !hasProviderKey()) {
    return simulateDecision(args)
  }

  const started = Date.now()
  const ldCtx = toLdContext(args.context)

  try {
    const result = await config({
      key: args.configKey,
      handler: [createOpenAIHandler(), createClaudeMessagesHandler()],
    }).invoke(args.authSummary, ldCtx, {
      auth_summary: args.authSummary,
    })

    const inspected = await inspectConfig(args.configKey, ldCtx)
    const model =
      inspected.config?.model?.name != null
        ? String(inspected.config.model.name)
        : DEFAULT_MODEL
    const provider =
      inspected.config?.provider?.name != null
        ? String(inspected.config.provider.name)
        : null

    const content =
      typeof result.response === 'string'
        ? result.response
        : JSON.stringify(result.response)

    return emptyChat({
      content,
      model,
      requestId: result.trackData?.runId
        ? String(result.trackData.runId)
        : `req_${Date.now().toString(36)}`,
      latencyMs: Date.now() - started,
      promptTokens: result.usage?.input ?? null,
      completionTokens: result.usage?.output ?? null,
      hop: 'primary',
      servedProvider: provider,
      judgeEvaluation: formatJudgeEvaluation(result.judgeResults),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return emptyChat({
      model: DEFAULT_MODEL,
      hop: 'break',
      error: message,
      latencyMs: Date.now() - started,
    })
  }
}

export { DEFAULT_SYSTEM }
