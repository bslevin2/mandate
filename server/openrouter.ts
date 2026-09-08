import {
  appHopRequestedModels,
  labelInferenceHop,
  sameCallBackupRequested,
  sameCallBackupTarget,
  type InferencePolicy,
  type ProviderPrefs,
} from './inference-policy.js'

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
  requestedModels: string[]
  servedProvider: string | null
  inferenceUser: string | null
  allowProviderFailover: boolean
  inferencePolicy: string | null
}

export type InferenceMode = 'live' | 'simulator'

export interface ChatArgs {
  model: string
  messages: Array<{ role: string; content: string }>
  /** Force a bad first model. Alone = fail-closed. With allow backup = same-call models[]. */
  breakPipe?: boolean
  /** Force bad primary, then a second HTTP request (app hop — not provider failover). */
  failoverDemo?: boolean
  /** Artificial delay before the call (network simulator). */
  delayMs?: number
  /** Override timeout. */
  timeoutMs?: number
  fallbackModel?: string
  inferenceMode?: InferenceMode
  /** Used for deterministic sim request ids. */
  authId?: string
  /** Hint fields for simulator policy. */
  simHints?: {
    mcc?: string
    amountCents?: number
    risk_tier?: string
    env?: string
  }
  policy?: InferencePolicy
  allowProviderFailover?: boolean
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

export interface KeyStatus {
  label: string | null
  usage: number | null
  limitRemaining: number | null
  isFreeTier: boolean | null
  error: string | null
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function hasOpenRouterKey(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY?.trim())
}

export function resolveInferenceMode(
  requested?: InferenceMode,
): InferenceMode {
  if (requested === 'live' || requested === 'simulator') return requested
  return hasOpenRouterKey() ? 'live' : 'simulator'
}

function emptyChat(partial: Partial<ChatResult> & Pick<ChatResult, 'model' | 'hop'>): ChatResult {
  return {
    content: '',
    requestId: null,
    latencyMs: 0,
    promptTokens: null,
    completionTokens: null,
    costUsd: null,
    error: null,
    requestedModels: [],
    servedProvider: null,
    inferenceUser: null,
    allowProviderFailover: true,
    inferencePolicy: null,
    ...partial,
  }
}

function simulateDecision(args: ChatArgs): ChatResult {
  const hints = args.simHints ?? {}
  const mcc = hints.mcc ?? ''
  const amount = hints.amountCents ?? 0
  const risk = hints.risk_tier ?? 'low'

  let decision: 'approve' | 'decline' = 'approve'
  let reason = 'Simulator approve — low-risk policy'

  if (mcc === '7995') {
    decision = 'decline'
    reason = 'Simulator decline — blocked MCC 7995'
  } else if (risk === 'high' && amount > 50000) {
    decision = 'decline'
    reason = 'Simulator decline — high risk + large amount'
  } else if (amount > 100000) {
    decision = 'decline'
    reason = 'Simulator decline — amount over soft ceiling'
  }

  const authId = args.authId ?? 'anon'
  const requestedModels = args.policy?.requestedModels?.length
    ? args.policy.requestedModels
    : [args.model]
  const allowProviderFailover =
    args.allowProviderFailover ?? args.policy?.provider.allow_fallbacks ?? true
  return emptyChat({
    content: JSON.stringify({ decision, reason }),
    model: `simulator/${requestedModels[0] ?? args.model}`,
    requestId: `sim_${authId}`,
    latencyMs: 12 + Math.floor(Math.random() * 40),
    promptTokens: 120,
    completionTokens: 40,
    costUsd: 0.00012,
    hop: 'simulator',
    requestedModels,
    servedProvider: 'simulator',
    inferenceUser: args.policy?.user ?? null,
    allowProviderFailover,
    inferencePolicy: args.policy?.id ?? null,
  })
}

interface CompletionBody {
  id?: string
  choices?: Array<{ message?: { content?: string } }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
    cost?: number
  }
  error?: { message?: string }
  model?: string
  provider?: string
}

function providerObject(prefs: ProviderPrefs | undefined, allowFallbacks: boolean): Record<string, unknown> {
  const provider: Record<string, unknown> = {
    allow_fallbacks: allowFallbacks,
  }
  if (prefs?.sort) provider.sort = prefs.sort
  if (prefs?.data_collection) provider.data_collection = prefs.data_collection
  if (prefs?.max_price) provider.max_price = prefs.max_price
  return provider
}

async function oneHop(opts: {
  model: string
  models?: string[]
  messages: Array<{ role: string; content: string }>
  timeoutMs: number
  hop: string
  user?: string
  provider?: Record<string, unknown>
  requestedModels: string[]
  allowProviderFailover: boolean
  inferencePolicy: string | null
}): Promise<ChatResult> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    return emptyChat({
      model: opts.model,
      hop: opts.hop,
      requestedModels: opts.requestedModels,
      allowProviderFailover: opts.allowProviderFailover,
      inferencePolicy: opts.inferencePolicy,
      inferenceUser: opts.user ?? null,
      error: 'OPENROUTER_API_KEY missing. Set it in .env (server only).',
    })
  }

  const started = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs)

  const payload: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
    temperature: 0,
    response_format: { type: 'json_object' },
    provider: opts.provider,
  }
  if (opts.models && opts.models.length > 1) {
    payload.models = opts.models
  }
  if (opts.user) payload.user = opts.user

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/bslevin2/mandate',
        'X-Title': 'Mandate',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    const latencyMs = Date.now() - started
    const body = (await res.json()) as CompletionBody
    const requestId = body.id || res.headers.get('x-request-id') || null

    if (!res.ok) {
      return emptyChat({
        model: opts.model,
        hop: opts.hop,
        requestId,
        latencyMs,
        requestedModels: opts.requestedModels,
        servedProvider: typeof body.provider === 'string' ? body.provider : null,
        inferenceUser: opts.user ?? null,
        allowProviderFailover: opts.allowProviderFailover,
        inferencePolicy: opts.inferencePolicy,
        error: body.error?.message || `OpenRouter HTTP ${res.status}`,
      })
    }

    const served = body.model || opts.model
    const hop = labelInferenceHop({
      mode: 'live',
      breakPipe: false,
      appHop: opts.hop === 'app-hop',
      allowProviderFailover: opts.allowProviderFailover,
      requestedModels: opts.requestedModels,
      servedModel: served,
      error: null,
    })

    return emptyChat({
      content: body.choices?.[0]?.message?.content ?? '',
      model: served,
      requestId,
      latencyMs,
      promptTokens: body.usage?.prompt_tokens ?? null,
      completionTokens: body.usage?.completion_tokens ?? null,
      costUsd: typeof body.usage?.cost === 'number' ? body.usage.cost : null,
      hop,
      requestedModels: opts.requestedModels,
      servedProvider: typeof body.provider === 'string' ? body.provider : null,
      inferenceUser: opts.user ?? null,
      allowProviderFailover: opts.allowProviderFailover,
      inferencePolicy: opts.inferencePolicy,
    })
  } catch (err) {
    const latencyMs = Date.now() - started
    const message =
      err instanceof Error
        ? err.name === 'AbortError'
          ? `OpenRouter timeout after ${opts.timeoutMs}ms`
          : err.message
        : String(err)
    return emptyChat({
      model: opts.model,
      hop: opts.hop,
      latencyMs,
      requestedModels: opts.requestedModels,
      inferenceUser: opts.user ?? null,
      allowProviderFailover: opts.allowProviderFailover,
      inferencePolicy: opts.inferencePolicy,
      error: message,
    })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Live path sends `models[]` + `provider` prefs on a single request.
 * Break = fail-closed (no models[], no second HTTP) unless same-call backup is on.
 * Break + allow backup = one HTTP to the next listed model (primary is skipped).
 * App hop = Mandate's second HTTP after a broken primary — not provider failover.
 * Simulator returns deterministic JSON + fake request_id/cost (labeled hop).
 */
export async function chatWithFallback(args: ChatArgs): Promise<ChatResult> {
  if (args.delayMs && args.delayMs > 0) await sleep(args.delayMs)

  const mode = resolveInferenceMode(args.inferenceMode)
  const timeoutMs =
    args.timeoutMs ?? Number(process.env.OPENROUTER_TIMEOUT_MS || 8000)
  const policy = args.policy
  const allowProviderFailover =
    args.allowProviderFailover ?? policy?.provider.allow_fallbacks ?? true
  const requestedModels =
    policy?.requestedModels?.length ? policy.requestedModels : [args.model]
  const appHopModel =
    args.fallbackModel ||
    process.env.OPENROUTER_FALLBACK_MODEL ||
    requestedModels[1] ||
    requestedModels[0] ||
    args.model
  const hopRequested = appHopRequestedModels(
    appHopModel,
    requestedModels,
    allowProviderFailover,
  )
  const meta = {
    requestedModels,
    allowProviderFailover,
    inferencePolicy: policy?.id ?? null,
    inferenceUser: policy?.user ?? null,
  }

  if (mode === 'simulator') {
    if (args.failoverDemo) {
      const ok = simulateDecision({ ...args, model: appHopModel })
      return {
        ...ok,
        hop: 'app-hop',
        model: `simulator-app-hop/${appHopModel}`,
        requestId: `sim_ah_${args.authId ?? 'anon'}`,
        ...meta,
        requestedModels: hopRequested,
      }
    }
    if (args.breakPipe && allowProviderFailover) {
      const backup = sameCallBackupTarget(requestedModels)
      if (backup && requestedModels[0]) {
        const ok = simulateDecision({ ...args, model: backup })
        return {
          ...ok,
          hop: 'model-fallback',
          model: `simulator/${backup}`,
          ...meta,
          requestedModels: sameCallBackupRequested(requestedModels[0], backup),
        }
      }
    }
    if (args.breakPipe) {
      return emptyChat({
        model: 'mandate/intentionally-invalid-model-id',
        hop: 'break',
        latencyMs: 8,
        error: 'Simulator break: intentional invalid model — no fallback (fail-closed)',
        ...meta,
      })
    }
    return simulateDecision(args)
  }

  const provider = providerObject(policy?.provider, allowProviderFailover)

  if (args.failoverDemo) {
    const primary = await oneHop({
      model: 'mandate/intentionally-invalid-model-id',
      messages: args.messages,
      timeoutMs,
      hop: 'primary',
      user: policy?.user,
      provider: { allow_fallbacks: false },
      requestedModels: ['mandate/intentionally-invalid-model-id'],
      allowProviderFailover: false,
      inferencePolicy: policy?.id ?? null,
    })
    const secondary = await oneHop({
      model: appHopModel,
      models: hopRequested,
      messages: args.messages,
      timeoutMs,
      hop: 'app-hop',
      user: policy?.user,
      provider,
      requestedModels: hopRequested,
      allowProviderFailover,
      inferencePolicy: policy?.id ?? null,
    })
    if (!secondary.error && secondary.content) {
      return { ...secondary, hop: 'app-hop' }
    }
    return {
      ...secondary,
      hop: 'exhausted',
      error:
        secondary.error ||
        primary.error ||
        'App hop exhausted — fail-closed',
    }
  }

  if (args.breakPipe && allowProviderFailover) {
    const backup = sameCallBackupTarget(requestedModels)
    const primaryId = requestedModels[0]
    if (backup && primaryId) {
      const evidenceList = sameCallBackupRequested(primaryId, backup)
      const fallbackHop = await oneHop({
        model: backup,
        messages: args.messages,
        timeoutMs,
        hop: 'primary',
        user: policy?.user,
        provider,
        requestedModels: evidenceList,
        allowProviderFailover: true,
        inferencePolicy: policy?.id ?? null,
      })
      if (!fallbackHop.error && fallbackHop.content) return fallbackHop
      return {
        ...fallbackHop,
        hop: fallbackHop.error ? 'exhausted' : fallbackHop.hop,
        error: fallbackHop.error || 'Empty completion — fail-closed',
      }
    }
  }

  if (args.breakPipe) {
    const broken = await oneHop({
      model: 'mandate/intentionally-invalid-model-id',
      messages: args.messages,
      timeoutMs,
      hop: 'break',
      user: policy?.user,
      provider: { allow_fallbacks: false },
      requestedModels: ['mandate/intentionally-invalid-model-id'],
      allowProviderFailover: false,
      inferencePolicy: policy?.id ?? null,
    })
    return {
      ...broken,
      hop: 'break',
      inferenceUser: policy?.user ?? broken.inferenceUser,
      inferencePolicy: policy?.id ?? null,
    }
  }

  const primaryModel = requestedModels[0] || args.model
  const primary = await oneHop({
    model: primaryModel,
    models: requestedModels,
    messages: args.messages,
    timeoutMs,
    hop: 'primary',
    user: policy?.user,
    provider,
    requestedModels,
    allowProviderFailover,
    inferencePolicy: policy?.id ?? null,
  })
  if (!primary.error && primary.content) return primary

  return {
    ...primary,
    hop: primary.error ? 'exhausted' : primary.hop,
    error: primary.error || 'Empty completion — fail-closed',
  }
}

export async function lookupGeneration(id: string): Promise<GenerationLookup> {
  const empty: GenerationLookup = {
    id: id || null,
    model: null,
    providerName: null,
    totalCost: null,
    finishReason: null,
    nativeFinishReason: null,
    isByok: null,
    tokensPrompt: null,
    tokensCompletion: null,
    latency: null,
    providerResponsesCount: null,
    error: null,
  }
  if (!id.trim()) {
    return { ...empty, error: 'generation id required' }
  }
  if (id.startsWith('sim_')) {
    return { ...empty, error: 'Simulator ids are local — look up only live generation ids' }
  }
  const apiKey = process.env.OPENROUTER_API_KEY?.trim()
  if (!apiKey) {
    return { ...empty, error: 'OPENROUTER_API_KEY missing. Set it in .env (server only).' }
  }

  try {
    const res = await fetch(
      `https://openrouter.ai/api/v1/generation?id=${encodeURIComponent(id.trim())}`,
      { headers: { Authorization: `Bearer ${apiKey}` } },
    )
    const body = (await res.json()) as {
      data?: {
        id?: string
        model?: string
        provider_name?: string | null
        total_cost?: number | null
        finish_reason?: string | null
        native_finish_reason?: string | null
        is_byok?: boolean | null
        tokens_prompt?: number | null
        tokens_completion?: number | null
        latency?: number | null
        provider_responses?: unknown[] | null
      }
      error?: { message?: string }
    }
    if (!res.ok) {
      return {
        ...empty,
        error: body.error?.message || `Generation lookup HTTP ${res.status}`,
      }
    }
    const data = body.data ?? {}
    return {
      id: data.id ?? id,
      model: data.model ?? null,
      providerName: data.provider_name ?? null,
      totalCost: typeof data.total_cost === 'number' ? data.total_cost : null,
      finishReason: data.finish_reason ?? null,
      nativeFinishReason: data.native_finish_reason ?? null,
      isByok: typeof data.is_byok === 'boolean' ? data.is_byok : null,
      tokensPrompt: data.tokens_prompt ?? null,
      tokensCompletion: data.tokens_completion ?? null,
      latency: data.latency ?? null,
      providerResponsesCount: Array.isArray(data.provider_responses)
        ? data.provider_responses.length
        : null,
      error: null,
    }
  } catch (err) {
    return {
      ...empty,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function lookupKeyStatus(): Promise<KeyStatus> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim()
  if (!apiKey) {
    return {
      label: null,
      usage: null,
      limitRemaining: null,
      isFreeTier: null,
      error: 'OPENROUTER_API_KEY missing. Set it in .env (server only).',
    }
  }
  try {
    const res = await fetch('https://openrouter.ai/api/v1/key', {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    const body = (await res.json()) as {
      data?: {
        label?: string
        usage?: number
        limit_remaining?: number | null
        is_free_tier?: boolean
      }
      error?: { message?: string }
    }
    if (!res.ok) {
      return {
        label: null,
        usage: null,
        limitRemaining: null,
        isFreeTier: null,
        error: body.error?.message || `Key status HTTP ${res.status}`,
      }
    }
    const data = body.data ?? {}
    return {
      label: data.label ?? null,
      usage: typeof data.usage === 'number' ? data.usage : null,
      limitRemaining:
        typeof data.limit_remaining === 'number' ? data.limit_remaining : null,
      isFreeTier: typeof data.is_free_tier === 'boolean' ? data.is_free_tier : null,
      error: null,
    }
  } catch (err) {
    return {
      label: null,
      usage: null,
      limitRemaining: null,
      isFreeTier: null,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export { hasOpenRouterKey }
