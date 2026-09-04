import type { AuthRequest } from './types.js'

const MERCHANTS = [
  { name: 'Northwind Market', mcc: '5411' },
  { name: 'Contoso Electronics', mcc: '5732' },
  { name: 'Fabrikam Travel', mcc: '4722' },
  { name: 'Adventure Works Casino', mcc: '7995' },
  { name: 'Tailspin Tools', mcc: '5251' },
]

export function makeFixture(overrides: Partial<AuthRequest> = {}): AuthRequest {
  const merchant = MERCHANTS[Math.floor(Math.random() * MERCHANTS.length)]!
  const amountCents = overrides.amountCents ?? 500 + Math.floor(Math.random() * 120000)
  return {
    authId: overrides.authId ?? `auth_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    amountCents,
    currency: 'usd',
    mcc: overrides.mcc ?? merchant.mcc,
    merchant: overrides.merchant ?? merchant.name,
    agentId: overrides.agentId ?? `agent_${Math.floor(Math.random() * 40)}`,
    cardLast4: overrides.cardLast4 ?? String(1000 + Math.floor(Math.random() * 9000)),
    panDemo: overrides.panDemo ?? `411111111111${String(1000 + Math.floor(Math.random() * 9000))}`,
  }
}

export function burstFixtures(n: number, base?: Partial<AuthRequest>): AuthRequest[] {
  return Array.from({ length: n }, (_, i) =>
    makeFixture({
      ...base,
      authId: `burst_${Date.now()}_${i}`,
    }),
  )
}
