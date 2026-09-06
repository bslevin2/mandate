import type { AudienceId, LdContextAttrs } from './types.js'

export type InferencePolicyId = 'cheap-price' | 'strong-latency' | 'no-model'

export type ProviderSort = 'price' | 'latency' | 'throughput'

export interface ProviderPrefs {
  allow_fallbacks: boolean
  sort: ProviderSort
  data_collection?: 'allow' | 'deny'
  max_price?: { prompt: number; completion: number }
}

export interface InferencePolicy {
  id: InferencePolicyId
  /** Models tried in order inside one provider request (`models[]`). */
  requestedModels: string[]
  provider: ProviderPrefs
  /** Stable actor id for abuse isolation — not a login. */
  user: string
  /** True when this audience must not call a model. */
  skipModel: boolean
}

const DEFAULT_CHEAP = ['openai/gpt-4o-mini', 'google/gemini-2.0-flash-001']
const DEFAULT_STRONG = ['google/gemini-2.5-flash', 'openai/gpt-4o-mini']

function csvEnv(name: string, fallback: string[]): string[] {
  const raw = process.env[name]?.trim()
  if (!raw) return fallback
  return raw.split(',').map((s) => s.trim()).filter(Boolean)
}

function uniqueModels(list: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of list) {
    const id = item?.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

export function inferenceUser(
  audienceId: AudienceId,
  context: Pick<LdContextAttrs, 'tenant' | 'key'>,
): string {
  return `mandate:${context.tenant}:${audienceId}:${context.key}`
}

export function policyForAudience(
  audienceId: AudienceId,
  context: LdContextAttrs,
  opts: {
    allowProviderFailover: boolean
    /** Decision-config or env primary — prepended when present. */
    preferredModel?: string | null
  },
): InferencePolicy {
  const user = inferenceUser(audienceId, context)
  const cheap = csvEnv('OPENROUTER_CHEAP_MODELS', DEFAULT_CHEAP)
  const strong = csvEnv('OPENROUTER_STRONG_MODELS', DEFAULT_STRONG)

  if (audienceId === 'blocked-mcc' || context.mcc === '7995') {
    return {
      id: 'no-model',
      requestedModels: [],
      provider: {
        allow_fallbacks: opts.allowProviderFailover,
        sort: 'price',
      },
      user,
      skipModel: true,
    }
  }

  if (audienceId === 'prod-high') {
    const requestedModels = uniqueModels([opts.preferredModel, ...strong])
    return {
      id: 'strong-latency',
      requestedModels,
      provider: {
        allow_fallbacks: opts.allowProviderFailover,
        sort: 'latency',
        data_collection: 'deny',
        // Generous ceiling so the hop still runs; ops can tighten via env later.
        max_price: { prompt: 5, completion: 15 },
      },
      user,
      skipModel: false,
    }
  }

  const requestedModels = uniqueModels([opts.preferredModel, ...cheap])
  return {
    id: 'cheap-price',
    requestedModels,
    provider: {
      allow_fallbacks: opts.allowProviderFailover,
      sort: 'price',
    },
    user,
    skipModel: false,
  }
}

export function sameModel(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  const norm = (s: string) => s.toLowerCase().split(':')[0]!.trim()
  return norm(a) === norm(b)
}

/**
 * Honest hop labels. Do not call Mandate's second HTTP request
 * "provider failover" or "model fallback".
 */
export function labelInferenceHop(opts: {
  mode: 'live' | 'simulator'
  breakPipe: boolean
  appHop: boolean
  allowProviderFailover: boolean
  requestedModels: string[]
  servedModel: string | null
  error: string | null
  providerResponsesCount?: number | null
}): string {
  if (opts.breakPipe) return 'break'
  if (opts.appHop) return 'app-hop'
  if (opts.mode === 'simulator') return 'simulator'
  if (opts.providerResponsesCount != null && opts.providerResponsesCount > 1) {
    return 'provider-failover'
  }
  const first = opts.requestedModels[0]
  if (
    opts.servedModel &&
    first &&
    !sameModel(opts.servedModel, first)
  ) {
    return 'model-fallback'
  }
  if (opts.error && !opts.servedModel) return 'exhausted'
  if (!opts.allowProviderFailover) return 'strict'
  return 'primary'
}
