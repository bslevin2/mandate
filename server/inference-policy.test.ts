import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  inferenceUser,
  labelInferenceHop,
  policyForAudience,
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
    assert.ok(p.requestedModels.length >= 1)
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
})
