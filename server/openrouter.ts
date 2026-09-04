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
}

export type InferenceMode = 'live' | 'simulator'

export interface ChatArgs {
  model: string
  messages: Array<{ role: string; content: string }>
  /** Force a bad model id; do NOT run fallback (surface error). */
  breakPipe?: boolean
  /** Force bad primary, then run fallback hop (demo failover). */
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
  return {
    content: JSON.stringify({ decision, reason }),
    model: `simulator/${args.model}`,
    requestId: `sim_${authId}`,
    latencyMs: 12 + Math.floor(Math.random() * 40),
    promptTokens: 120,
    completionTokens: 40,
    costUsd: 0.00012,
    hop: 'simulator',
    error: null,
  }
}

async function oneHop(
  model: string,
  messages: Array<{ role: string; content: string }>,
  timeoutMs: number,
  hop: string,
): Promise<ChatResult> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    return {
      content: '',
      model,
      requestId: null,
      latencyMs: 0,
      promptTokens: null,
      completionTokens: null,
      costUsd: null,
      hop,
      error: 'OPENROUTER_API_KEY missing. Set it in .env (server only).',
    }
  }

  const started = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/bslevin2/mandate',
        'X-Title': 'Mandate',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    })

    const latencyMs = Date.now() - started
    const requestId =
      res.headers.get('x-request-id') ||
      res.headers.get('x-openrouter-request-id') ||
      null

    const body = (await res.json()) as {
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
    }

    if (!res.ok) {
      return {
        content: '',
        model,
        requestId: requestId || body.id || null,
        latencyMs,
        promptTokens: null,
        completionTokens: null,
        costUsd: null,
        hop,
        error: body.error?.message || `OpenRouter HTTP ${res.status}`,
      }
    }

    const content = body.choices?.[0]?.message?.content ?? ''
    return {
      content,
      model: body.model || model,
      requestId: requestId || body.id || null,
      latencyMs,
      promptTokens: body.usage?.prompt_tokens ?? null,
      completionTokens: body.usage?.completion_tokens ?? null,
      costUsd: typeof body.usage?.cost === 'number' ? body.usage.cost : null,
      hop,
      error: null,
    }
  } catch (err) {
    const latencyMs = Date.now() - started
    const message =
      err instanceof Error
        ? err.name === 'AbortError'
          ? `OpenRouter timeout after ${timeoutMs}ms`
          : err.message
        : String(err)
    return {
      content: '',
      model,
      requestId: null,
      latencyMs,
      promptTokens: null,
      completionTokens: null,
      costUsd: null,
      hop,
      error: message,
    }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Primary model, then fallback model, then fail-closed caller handles empty content.
 * Simulator mode returns deterministic JSON + fake request_id/cost (labeled hop).
 */
export async function chatWithFallback(args: ChatArgs): Promise<ChatResult> {
  if (args.delayMs && args.delayMs > 0) await sleep(args.delayMs)

  const mode = resolveInferenceMode(args.inferenceMode)
  const timeoutMs =
    args.timeoutMs ?? Number(process.env.OPENROUTER_TIMEOUT_MS || 8000)
  const fallbackModel =
    args.fallbackModel ||
    process.env.OPENROUTER_FALLBACK_MODEL ||
    process.env.OPENROUTER_MODEL ||
    'openai/gpt-4o-mini'

  // Simulator path — still honors break vs failover for demo clarity.
  if (mode === 'simulator') {
    if (args.breakPipe) {
      return {
        content: '',
        model: 'mandate/intentionally-invalid-model-id',
        requestId: null,
        latencyMs: 8,
        promptTokens: null,
        completionTokens: null,
        costUsd: null,
        hop: 'primary-broken',
        error:
          'Simulator break: intentional invalid model — no fallback (fail-closed)',
      }
    }
    if (args.failoverDemo) {
      const ok = simulateDecision({ ...args, model: fallbackModel })
      return {
        ...ok,
        hop: 'fallback-after:simulator-primary-invalid',
        model: `simulator-fallback/${fallbackModel}`,
        requestId: `sim_fb_${args.authId ?? 'anon'}`,
      }
    }
    return simulateDecision(args)
  }

  // Live OpenRouter
  if (args.breakPipe && args.failoverDemo) {
    // Prefer break when both set — mutual exclusion should be UI-enforced.
  }

  const forceBadPrimary = Boolean(args.breakPipe || args.failoverDemo)
  const primaryModel = forceBadPrimary
    ? 'mandate/intentionally-invalid-model-id'
    : args.model

  const primary = await oneHop(primaryModel, args.messages, timeoutMs, 'primary')
  if (!primary.error && primary.content) return primary

  if (args.breakPipe) {
    return { ...primary, hop: 'primary-broken' }
  }

  // failoverDemo or natural primary failure → try fallback
  if (fallbackModel === primaryModel && !args.failoverDemo) {
    return primary
  }

  const secondary = await oneHop(
    fallbackModel,
    args.messages,
    timeoutMs,
    'fallback',
  )
  if (!secondary.error && secondary.content) {
    return {
      ...secondary,
      hop: `fallback-after:${primary.error || 'empty'}`,
    }
  }

  return {
    ...secondary,
    hop: 'exhausted',
    error: secondary.error || primary.error || 'All OpenRouter hops failed',
  }
}

export { hasOpenRouterKey }
