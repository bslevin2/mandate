import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { inferenceUser, policyForAudience } from './inference-policy.ts'
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
  it('maps sandbox-low to quick-rules', () => {
    const p = policyForAudience('sandbox-low', sandbox)
    assert.equal(p.id, 'quick-rules')
    assert.equal(p.skipModel, false)
  })

  it('maps prod-high to model-review', () => {
    const p = policyForAudience('prod-high', prod)
    assert.equal(p.id, 'model-review')
    assert.equal(p.skipModel, false)
  })

  it('maps blocked MCC to no-model', () => {
    const p = policyForAudience('blocked-mcc', blocked)
    assert.equal(p.id, 'no-model')
    assert.equal(p.skipModel, true)
  })

  it('builds a stable inference user', () => {
    assert.equal(
      inferenceUser('sandbox-low', sandbox),
      'mandate:acme:sandbox-low:ops-sandbox',
    )
  })
})
