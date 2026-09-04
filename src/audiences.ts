import type { Audience, AudienceId } from './types'

export const AUDIENCES: Record<AudienceId, Audience> = {
  'sandbox-low': {
    id: 'sandbox-low',
    label: 'Sandbox · low risk',
    description: 'env=sandbox, risk_tier=low, grocery MCC, small amount',
    context: {
      key: 'ops-sandbox',
      email: 'ops@sandbox.mandate.local',
      env: 'sandbox',
      risk_tier: 'low',
      tenant: 'acme',
      mcc: '5411',
      amount_cents: 1200,
    },
  },
  'prod-high': {
    id: 'prod-high',
    label: 'Prod · high risk',
    description: 'env=prod, risk_tier=high, larger amount',
    context: {
      key: 'ops-prod',
      email: 'ops@prod.mandate.local',
      env: 'prod',
      risk_tier: 'high',
      tenant: 'globex',
      mcc: '5732',
      amount_cents: 85000,
    },
  },
  'blocked-mcc': {
    id: 'blocked-mcc',
    label: 'Blocked MCC',
    description: 'MCC 7995 — gambling-shaped spend control',
    context: {
      key: 'ops-blocked',
      email: 'ops@blocked.mandate.local',
      env: 'prod',
      risk_tier: 'high',
      tenant: 'acme',
      mcc: '7995',
      amount_cents: 5000,
    },
  },
  'qa-dogfood': {
    id: 'qa-dogfood',
    label: 'QA dogfood',
    description: 'Individual target — always get the new treatment',
    context: {
      key: 'qa-dogfood',
      email: 'qa@mandate.local',
      env: 'sandbox',
      risk_tier: 'low',
      tenant: 'acme',
      mcc: '5411',
      amount_cents: 2500,
    },
  },
}

export const AUDIENCE_LIST = Object.values(AUDIENCES)
