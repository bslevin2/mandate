/**
 * Server-side policy / flag evaluation.
 * Set LD_SDK_KEY — see README Configuration for flag keys and decision config.
 */

import * as ld from '@launchdarkly/node-server-sdk'
import { initAi } from '@launchdarkly/server-sdk-ai'
import type { LdContextAttrs, RouteMode } from './types.js'

export interface FlagSnapshot {
  decisionerLive: boolean
  route: RouteMode
  treatment: string
  captureLive: boolean
  spendCapCents: number
  source: 'launchdarkly' | 'local-fallback'
}

export interface AiConfigSnapshot {
  key: string
  enabled: boolean
  model: string | null
  systemPrompt: string
  messages: Array<{ role: string; content: string }>
  source: 'launchdarkly' | 'local-fallback'
}

let client: ld.LDClient | null = null
let aiClient: ReturnType<typeof initAi> | null = null
let ready = false

/** Local kill latch used by /api/remediate when the flag dashboard is unavailable. */
let localKill = false

export function setLocalKill(v: boolean) {
  localKill = v
}

export function getLocalKill() {
  return localKill
}

function toLdContext(attrs: LdContextAttrs): ld.LDContext {
  return {
    kind: 'user',
    key: attrs.key,
    email: attrs.email,
    env: attrs.env,
    risk_tier: attrs.risk_tier,
    tenant: attrs.tenant,
    mcc: attrs.mcc,
    amount_cents: attrs.amount_cents,
  }
}

export async function initLd(): Promise<void> {
  const sdkKey = process.env.LD_SDK_KEY
  if (!sdkKey) {
    console.warn('[ld] LD_SDK_KEY missing — using local policy fallbacks. See README Configuration.')
    ready = true
    return
  }
  client = ld.init(sdkKey)
  await client.waitForInitialization({ timeout: 10 })
  aiClient = initAi(client)
  ready = true
  console.log('[ld] server SDK ready')
}

export async function evaluateFlags(attrs: LdContextAttrs): Promise<FlagSnapshot> {
  if (!ready || !client) {
    return localFlags(attrs)
  }
  const ctx = toLdContext(attrs)
  const decisionerLive = (await client.variation('decisioner.live', ctx, true)) as boolean
  const routeRaw = String(await client.variation('decisioner.route', ctx, defaultRoute(attrs)))
  const route: RouteMode = routeRaw === 'fast' ? 'fast' : 'model'
  const treatment = String(await client.variation('decisioner.experiment', ctx, 'control'))
  const captureLive = (await client.variation('capture.live', ctx, true)) as boolean
  const spendCapCents = Number(await client.variation('spend.cap.cents', ctx, defaultCap(attrs)))

  return {
    decisionerLive: decisionerLive && !localKill,
    route,
    treatment,
    captureLive,
    spendCapCents,
    source: 'launchdarkly',
  }
}

export async function evaluateAiConfig(
  attrs: LdContextAttrs,
  authSummary: string,
  configKey = process.env.LD_AI_CONFIG_KEY || 'mandate-decisioner',
): Promise<AiConfigSnapshot> {
  const fallback = localAiConfig(configKey, authSummary)
  if (!aiClient || !client) return fallback

  try {
    const ctx = toLdContext(attrs)
    const defaultConfig = {
      enabled: true,
      model: {
        name: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
      },
      messages: [
        { role: 'system', content: DEFAULT_SYSTEM },
        { role: 'user', content: authSummary },
      ],
    }
    const cfg = await aiClient.completionConfig(configKey, ctx, defaultConfig, {
      auth_summary: authSummary,
    })

    const messages =
      cfg.messages?.map((m) => ({
        role: String(m.role ?? 'user'),
        content: String(m.content ?? ''),
      })) ?? fallback.messages

    return {
      key: configKey,
      enabled: Boolean(cfg.enabled),
      model: cfg.model?.name ? String(cfg.model.name) : fallback.model,
      systemPrompt:
        messages.find((m) => m.role === 'system')?.content ?? DEFAULT_SYSTEM,
      messages: messages.length ? messages : fallback.messages,
      source: 'launchdarkly',
    }
  } catch (err) {
    console.warn('[ld] AI Config fallback:', err)
    return fallback
  }
}

export async function trackMetric(
  attrs: LdContextAttrs,
  key: string,
  data?: number | string | boolean,
): Promise<void> {
  if (!client) return
  const ctx = toLdContext(attrs)
  client.track(key, ctx, data)
}

function defaultRoute(attrs: LdContextAttrs): RouteMode {
  if (attrs.mcc === '7995') return 'model'
  if (attrs.env === 'sandbox' && attrs.risk_tier === 'low') return 'fast'
  if (attrs.risk_tier === 'high' || attrs.amount_cents > 50000) return 'model'
  return 'fast'
}

function defaultCap(attrs: LdContextAttrs): number {
  if (attrs.env === 'sandbox') return 25000
  if (attrs.risk_tier === 'high') return 100000
  return 50000
}

function localFlags(attrs: LdContextAttrs): FlagSnapshot {
  return {
    decisionerLive: !localKill,
    route: defaultRoute(attrs),
    treatment: attrs.email === 'qa@mandate.local' ? 'treatment' : 'control',
    captureLive: !localKill,
    spendCapCents: defaultCap(attrs),
    source: 'local-fallback',
  }
}

const DEFAULT_SYSTEM = `You are Mandate, an automated authorization decisioner for agent spend.
Return ONLY valid JSON: {"decision":"approve"|"decline","reason":"short string"}.
Fail closed on uncertainty. Decline blocked MCC 7995. Prefer decline when amount is high for the risk tier.
Never include card numbers or PII in the reason.`

function localAiConfig(key: string, authSummary: string): AiConfigSnapshot {
  return {
    key,
    enabled: true,
    model: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
    systemPrompt: DEFAULT_SYSTEM,
    messages: [
      { role: 'system', content: DEFAULT_SYSTEM },
      { role: 'user', content: authSummary },
    ],
    source: 'local-fallback',
  }
}

export { DEFAULT_SYSTEM }
