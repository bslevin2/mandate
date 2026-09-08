import { AUDIENCES } from './audiences'
import type { AudienceId, AuthRequest } from './types'

/** Merchant pool — keep MCC and name aligned when a profile pins MCC. */
const MERCHANTS: { name: string; mcc: string }[] = [
  { name: 'Northwind Market', mcc: '5411' },
  { name: 'Contoso Electronics', mcc: '5732' },
  { name: 'Fabrikam Travel', mcc: '4722' },
  { name: 'Adventure Works Casino', mcc: '7995' },
  { name: 'Tailspin Tools', mcc: '5251' },
]

type CentsRange = { min: number; max: number }

type AmountBand = {
  typical: CentsRange
  /** Exclusive sequential chances; remainder uses `typical`. */
  rare?: { chance: number; range: CentsRange }[]
}

/**
 * Fixture-only amount bands. Canonical `amount_cents` on the audience stays
 * the Decisioner preview; submitted payments sample from these ranges.
 */
const AMOUNT_BANDS: Record<AudienceId, AmountBand> = {
  'sandbox-low': {
    typical: { min: 800, max: 9000 },
    rare: [{ chance: 0.15, range: { min: 26000, max: 40000 } }],
  },
  'qa-dogfood': {
    typical: { min: 800, max: 9000 },
    rare: [{ chance: 0.15, range: { min: 26000, max: 40000 } }],
  },
  'prod-high': {
    typical: { min: 52000, max: 98000 },
    rare: [
      { chance: 0.1, range: { min: 15000, max: 45000 } },
      { chance: 0.1, range: { min: 105000, max: 140000 } },
    ],
  },
  'blocked-mcc': {
    typical: { min: 2000, max: 12000 },
  },
}

function randInclusive(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1))
}

export function sampleAmountForAudience(audienceId: AudienceId): number {
  const band = AMOUNT_BANDS[audienceId]
  const roll = Math.random()
  let acc = 0
  for (const rare of band.rare ?? []) {
    acc += rare.chance
    if (roll < acc) return randInclusive(rare.range.min, rare.range.max)
  }
  return randInclusive(band.typical.min, band.typical.max)
}

export function merchantForMcc(mcc: string): string {
  const match = MERCHANTS.find((row) => row.mcc === mcc)
  return match?.name ?? MERCHANTS[0]!.name
}

/** Pin MCC, sample a profile-typical amount, and keep merchant name coherent. */
export function applyAudienceToAuth(
  auth: AuthRequest,
  audienceId: AudienceId,
): void {
  const mcc = AUDIENCES[audienceId].context.mcc
  auth.mcc = mcc
  auth.amountCents = sampleAmountForAudience(audienceId)
  auth.merchant = merchantForMcc(mcc)
}
