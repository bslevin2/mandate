import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  appHopRequestedModels,
  inferenceUser,
  labelInferenceHop,
  policyForAudience,
  sameCallBackupRequested,
  sameCallBackupTarget,
  sameModel,
} from './inference-policy.ts'
import type { LdContextAttrs } from './types.ts'

const sandbox: LdContextAttrs = {
  key: 'ops-sandbox',
  email: 'ops@sandbox.mandate.local',
  env: 'sandbox',
  risk_tier: 'low',
  tenant: 'acme',
  mcc: '5411',
  amount_cents: 1200,
}

const prod: LdContextAttrs = {
  key: 'ops-prod',
  email: 'ops@prod.mandate.local',
  env: 'prod',
  risk_tier: 'high',
  tenant: 'globex',
  mcc: '5732',
  amount_cents: 85000,
}

const blocked: LdContextAttrs = {
  key: 'ops-blocked',
  email: 'ops@blocked.mandate.local',
  env: 'prod',
  risk_tier: 'high',
  tenant: 'acme',
  mcc: '7995',
  amount_cents: 5000,
}

describe('policyForAudience', () => {
  it('maps sandbox-low to cheap/price', () => {
    const p = policyForAudience('sandbox-low', sandbox, {
      allowProviderFailover: true,
    })
    assert.equal(p.id, 'cheap-price')
    assert.equal(p.provider.sort, 'price')
    assert.equal(p.skipModel, false)
    assert.equal(p.requestedModels[0], 'openai/gpt-4.1-nano')
    assert.deepEqual(p.requestedModels, [
      'openai/gpt-4.1-nano',
      'google/gemini-2.5-flash-lite',
    ])
  })

  it('maps prod-high to strong/latency with data_collection deny', () => {
    const p = policyForAudience('prod-high', prod, {
      allowProviderFailover: true,
      preferredModel: 'openai/gpt-4o-mini',
    })
    assert.equal(p.id, 'strong-latency')
    assert.equal(p.provider.sort, 'latency')
    assert.equal(p.provider.data_collection, 'deny')
    assert.equal(p.requestedModels[0], 'openai/gpt-4o-mini')
    assert.ok(p.provider.max_price)
  })

  it('uses gpt-4.1-nano then gemini flash-lite for prod-high when no preferred model', () => {
    const p = policyForAudience('prod-high', prod, {
      allowProviderFailover: true,
    })
    assert.deepEqual(p.requestedModels, [
      'openai/gpt-4.1-nano',
      'google/gemini-2.5-flash-lite',
    ])
  })

  it('live routing lists ignore a LaunchDarkly-style model unless preferred is passed', () => {
    const cheap = policyForAudience('sandbox-low', sandbox, {
      allowProviderFailover: false,
    })
    const strong = policyForAudience('prod-high', prod, {
      allowProviderFailover: false,
    })
    assert.deepEqual(cheap.requestedModels, ['openai/gpt-4.1-nano'])
    assert.deepEqual(strong.requestedModels, ['openai/gpt-4.1-nano'])
  })

  it('maps blocked-mcc to no-model', () => {
    const p = policyForAudience('blocked-mcc', blocked, {
      allowProviderFailover: true,
    })
    assert.equal(p.id, 'no-model')
    assert.equal(p.skipModel, true)
    assert.deepEqual(p.requestedModels, [])
  })

  it('honors strict provider (allow_fallbacks false)', () => {
    const p = policyForAudience('sandbox-low', sandbox, {
      allowProviderFailover: false,
    })
    assert.equal(p.provider.allow_fallbacks, false)
    assert.equal(p.requestedModels.length, 1)
  })

  it('strict failover requests primary only, even with a short preferred id', () => {
    const p = policyForAudience('prod-high', prod, {
      allowProviderFailover: false,
      preferredModel: 'gpt-4o-mini',
    })
    assert.equal(p.provider.allow_fallbacks, false)
    assert.deepEqual(p.requestedModels, ['gpt-4o-mini'])
  })

  it('dedupes short preferred ids against provider-prefixed backups', () => {
    const p = policyForAudience('prod-high', prod, {
      allowProviderFailover: true,
      preferredModel: 'gpt-4.1-nano',
    })
    assert.equal(p.requestedModels[0], 'gpt-4.1-nano')
    assert.equal(
      p.requestedModels.filter((m) => sameModel(m, 'openai/gpt-4.1-nano')).length,
      1,
    )
  })

  it('builds a stable actor user id', () => {
    assert.equal(
      inferenceUser('sandbox-low', sandbox),
      'mandate:acme:sandbox-low:ops-sandbox',
    )
  })
})

describe('labelInferenceHop', () => {
  it('labels break before anything else', () => {
    assert.equal(
      labelInferenceHop({
        mode: 'live',
        breakPipe: true,
        appHop: true,
        allowProviderFailover: true,
        requestedModels: ['openai/gpt-4o-mini'],
        servedModel: null,
        error: 'bad model',
      }),
      'break',
    )
  })

  it('labels Mandate second HTTP as app-hop, not model-fallback', () => {
    assert.equal(
      labelInferenceHop({
        mode: 'live',
        breakPipe: false,
        appHop: true,
        allowProviderFailover: true,
        requestedModels: ['openai/gpt-4o-mini'],
        servedModel: 'google/gemini-2.0-flash-001',
        error: null,
      }),
      'app-hop',
    )
  })

  it('labels served≠requested as model-fallback', () => {
    assert.equal(
      labelInferenceHop({
        mode: 'live',
        breakPipe: false,
        appHop: false,
        allowProviderFailover: true,
        requestedModels: ['openai/gpt-4o-mini', 'google/gemini-2.0-flash-001'],
        servedModel: 'google/gemini-2.0-flash-001',
        error: null,
      }),
      'model-fallback',
    )
  })

  it('labels multi-provider chain as provider-failover', () => {
    assert.equal(
      labelInferenceHop({
        mode: 'live',
        breakPipe: false,
        appHop: false,
        allowProviderFailover: true,
        requestedModels: ['openai/gpt-4o-mini'],
        servedModel: 'openai/gpt-4o-mini',
        error: null,
        providerResponsesCount: 2,
      }),
      'provider-failover',
    )
  })

  it('labels strict when provider failover is off', () => {
    assert.equal(
      labelInferenceHop({
        mode: 'live',
        breakPipe: false,
        appHop: false,
        allowProviderFailover: false,
        requestedModels: ['openai/gpt-4o-mini'],
        servedModel: 'openai/gpt-4o-mini',
        error: null,
      }),
      'strict',
    )
  })

  it('treats :variant suffixes as the same model', () => {
    assert.equal(sameModel('openai/gpt-4o-mini:nitro', 'openai/gpt-4o-mini'), true)
  })

  it('treats a bare model slug as the same as a provider-prefixed id', () => {
    assert.equal(sameModel('gpt-4o-mini', 'openai/gpt-4o-mini'), true)
  })

  it('labels strict when failover is off even if served has a provider prefix', () => {
    assert.equal(
      labelInferenceHop({
        mode: 'live',
        breakPipe: false,
        appHop: false,
        allowProviderFailover: false,
        requestedModels: ['gpt-4o-mini'],
        servedModel: 'openai/gpt-4o-mini',
        error: null,
      }),
      'strict',
    )
  })

  it('labels unexpected-model when failover is off but a different model served', () => {
    assert.equal(
      labelInferenceHop({
        mode: 'live',
        breakPipe: false,
        appHop: false,
        allowProviderFailover: false,
        requestedModels: ['gpt-4o-mini'],
        servedModel: 'google/gemini-2.5-flash',
        error: null,
      }),
      'unexpected-model',
    )
  })

  it('labels the audit-shaped prefix mismatch as strict when failover is off', () => {
    assert.equal(
      labelInferenceHop({
        mode: 'live',
        breakPipe: false,
        appHop: false,
        allowProviderFailover: false,
        requestedModels: ['gpt-4o-mini', 'google/gemini-2.5-flash', 'openai/gpt-4o-mini'],
        servedModel: 'openai/gpt-4o-mini',
        error: null,
      }),
      'strict',
    )
  })

  it('labels same-call backup as model-fallback when the poisoned first id is not served', () => {
    assert.equal(
      labelInferenceHop({
        mode: 'live',
        breakPipe: false,
        appHop: false,
        allowProviderFailover: true,
        requestedModels: [
          'mandate/intentionally-invalid-model-id',
          'openai/gpt-4.1-nano',
        ],
        servedModel: 'openai/gpt-4.1-nano',
        error: null,
      }),
      'model-fallback',
    )
  })
})

describe('appHopRequestedModels', () => {
  it('records only the fallback model when same-call backup is off', () => {
    assert.deepEqual(
      appHopRequestedModels(
        'google/gemini-2.5-flash-lite',
        ['openai/gpt-4.1-nano', 'google/gemini-2.5-flash-lite'],
        false,
      ),
      ['google/gemini-2.5-flash-lite'],
    )
  })

  it('puts the fallback first and keeps policy backups when same-call backup is on', () => {
    assert.deepEqual(
      appHopRequestedModels(
        'google/gemini-2.5-flash-lite',
        ['openai/gpt-4.1-nano', 'google/gemini-2.5-flash-lite'],
        true,
      ),
      ['google/gemini-2.5-flash-lite', 'openai/gpt-4.1-nano'],
    )
  })
})

describe('sameCallBackupTarget', () => {
  it('returns the next listed model when it differs from primary', () => {
    assert.equal(
      sameCallBackupTarget(
        ['openai/gpt-4.1-nano', 'google/gemini-2.5-flash-lite'],
      ),
      'google/gemini-2.5-flash-lite',
    )
  })

  it('returns null when there is no distinct backup', () => {
    assert.equal(
      sameCallBackupTarget(['openai/gpt-4.1-nano']),
      null,
    )
  })

  it('records primary then backup for evidence', () => {
    assert.deepEqual(
      sameCallBackupRequested('openai/gpt-4.1-nano', 'google/gemini-2.5-flash-lite'),
      ['openai/gpt-4.1-nano', 'google/gemini-2.5-flash-lite'],
    )
  })
})
