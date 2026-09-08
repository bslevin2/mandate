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

const DEFAULT_CHEAP = ['openai/gpt-4.1-nano', 'google/gemini-2.5-flash-lite']
const DEFAULT_STRONG = ['openai/gpt-4.1-nano', 'google/gemini-2.5-flash-lite']

function csvEnv(name: string, fallback: string[]): string[] {
  const raw = process.env[name]?.trim()
  if (!raw) return fallback
  return raw.split(',').map((s) => s.trim()).filter(Boolean)
}

export function sameModel(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  const slug = (s: string) => {
    const noVariant = s.toLowerCase().split(':')[0]!.trim()
    const parts = noVariant.split('/')
    return parts[parts.length - 1] || noVariant
  }
  return slug(a) === slug(b)
}

function uniqueModels(list: Array<string | null | undefined>): string[] {
  const out: string[] = []
  for (const item of list) {
    const id = item?.trim()
    if (!id || out.some((existing) => sameModel(existing, id))) continue
    out.push(id)
  }
  return out
}

function requestedForPolicy(
  preferred: string | null | undefined,
  defaults: string[],
  allowFailover: boolean,
): string[] {
  const all = uniqueModels([preferred, ...defaults])
  if (!allowFailover) return all.slice(0, 1)
  return all
}

/** Models recorded / sent on Mandate's second HTTP (retry on backup). */
export function appHopRequestedModels(
  appHopModel: string,
  policyModels: string[],
  allowProviderFailover: boolean,
): string[] {
  if (!allowProviderFailover) return [appHopModel]
  return uniqueModels([appHopModel, ...policyModels])
}

/** Backup model to call when primary is broken on the same authorize. */
export function sameCallBackupTarget(policyModels: string[]): string | null {
  const primary = policyModels[0]
  const backup = policyModels[1]
  if (!primary || !backup || sameModel(backup, primary)) return null
  return backup
}

/** Evidence list: intended primary first, then the model we actually send. */
export function sameCallBackupRequested(
  primary: string,
  backup: string,
): string[] {
  return uniqueModels([primary, backup])
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
    /** Optional extra primary for tests. Live decide does not prepend a decision-config model. */
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
    const requestedModels = requestedForPolicy(
      opts.preferredModel,
      strong,
      opts.allowProviderFailover,
    )
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

  const requestedModels = requestedForPolicy(
    opts.preferredModel,
    cheap,
    opts.allowProviderFailover,
  )
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
  if (opts.error && !opts.servedModel) return 'exhausted'

  const first = opts.requestedModels[0]
  const servedMatchesPrimary = Boolean(
    opts.servedModel && first && sameModel(opts.servedModel, first),
  )

  if (!opts.allowProviderFailover) {
    if (opts.servedModel && first && !servedMatchesPrimary) {
      return 'unexpected-model'
    }
    return 'strict'
  }

  if (opts.servedModel && first && !servedMatchesPrimary) {
    return 'model-fallback'
  }
  return 'primary'
}
