/**
 * Server-side flag evaluation, control-plane client init, and the kill-switch flag write.
 * Decision-config inspect / invoke live in inference.ts.
 * See README Configuration for flag keys and decision config.
 */

import * as ld from '@launchdarkly/node-server-sdk'
import { initClient } from '@launchdarkly/ai-server'
import type { LdContextAttrs, RouteMode } from './types.js'

export interface FlagSnapshot {
  decisionerLive: boolean
  route: RouteMode
  treatment: string
  captureLive: boolean
  spendCapCents: number
  source: 'launchdarkly' | 'local-fallback'
}

let client: ld.LDClient | null = null
let ready = false

/** Kill latch set by /api/remediate. Fail-closes immediately, before a flag write streams back. */
let localKill = false

export function setLocalKill(v: boolean) {
  localKill = v
}

export function getLocalKill() {
  return localKill
}

export interface FlagWriteResult {
  ok: boolean
  skipped?: boolean
  error?: string
}

function flagWriteEnv() {
  const token = process.env.LD_API_TOKEN?.trim()
  const projectKey = process.env.LD_PROJECT_KEY?.trim()
  const environmentKey = process.env.LD_ENVIRONMENT_KEY?.trim()
  return token && projectKey && environmentKey
    ? { token, projectKey, environmentKey }
    : null
}

export function ldWriteConfigured(): boolean {
  return flagWriteEnv() !== null
}

/**
 * Turns decisioner.live targeting on or off. SDK keys can only evaluate flags, so this
 * needs a REST access token. Targeting off serves the off variation, which must be `false`.
 */
export async function setDecisionerLiveFlag(
  live: boolean,
): Promise<FlagWriteResult> {
  const env = flagWriteEnv()
  if (!env) return { ok: false, skipped: true }
  try {
    const res = await fetch(
      `https://app.launchdarkly.com/api/v2/flags/${encodeURIComponent(env.projectKey)}/decisioner.live`,
      {
        method: 'PATCH',
        headers: {
          Authorization: env.token,
          'Content-Type':
            'application/json; domain-model=launchdarkly.semanticpatch',
        },
        body: JSON.stringify({
          environmentKey: env.environmentKey,
          comment: live
            ? 'Mandate console: resume approvals'
            : 'Mandate console: emergency stop',
          instructions: [{ kind: live ? 'turnFlagOn' : 'turnFlagOff' }],
        }),
        signal: AbortSignal.timeout(5000),
      },
    )
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        message?: string
      } | null
      return {
        ok: false,
        error: `HTTP ${res.status}${body?.message ? `: ${body.message}` : ''}`,
      }
    }
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export function toLdContext(attrs: LdContextAttrs): ld.LDContext {
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
    console.warn(
      '[ld] LD_SDK_KEY missing — using local policy fallbacks. See README Configuration.',
    )
    ready = true
    return
  }
  client = ld.init(sdkKey)
  await client.waitForInitialization({ timeout: 10 })
  // Share the flag client with the AI SDK so decision-config invoke uses the same connection.
  await initClient(client)
  ready = true
  console.log('[ld] server SDK ready')
}

export async function evaluateFlags(
  attrs: LdContextAttrs,
): Promise<FlagSnapshot> {
  if (!ready || !client) {
    return localFlags(attrs)
  }
  const ctx = toLdContext(attrs)
  const decisionerLive = (await client.variation(
    'decisioner.live',
    ctx,
    true,
  )) as boolean
  const routeRaw = String(
    await client.variation('decisioner.route', ctx, defaultRoute(attrs)),
  )
  const route: RouteMode = routeRaw === 'fast' ? 'fast' : 'model'
  const treatment = String(
    await client.variation('decisioner.experiment', ctx, 'control'),
  )
  const captureLive = (await client.variation(
    'capture.live',
    ctx,
    true,
  )) as boolean
  const spendCapCents = Number(
    await client.variation('spend.cap.cents', ctx, defaultCap(attrs)),
  )

  return {
    decisionerLive: decisionerLive && !localKill,
    route,
    treatment,
    captureLive: captureLive && !localKill,
    spendCapCents,
    source: 'launchdarkly',
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
