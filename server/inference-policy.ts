import type { AudienceId, LdContextAttrs } from './types.js'

/**
 * Audience path label for evidence — quick rules vs model review.
 * Which model runs is chosen by the decision config, not a gateway list.
 */
export type PathPolicyId = 'quick-rules' | 'model-review' | 'no-model'

export interface PathPolicy {
  id: PathPolicyId
  /** True when this audience must not call a model. */
  skipModel: boolean
  user: string
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
): PathPolicy {
  const user = inferenceUser(audienceId, context)

  if (audienceId === 'blocked-mcc' || context.mcc === '7995') {
    return { id: 'no-model', skipModel: true, user }
  }

  if (audienceId === 'prod-high') {
    return { id: 'model-review', skipModel: false, user }
  }

  if (audienceId === 'sandbox-low' && context.risk_tier === 'low') {
    return { id: 'quick-rules', skipModel: false, user }
  }

  return { id: 'model-review', skipModel: false, user }
}
