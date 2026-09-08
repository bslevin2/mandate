import type { RouteMode } from '../types'
import { PanelHeader } from './PanelHeader'
import { StatusChip } from './StatusChip'

interface Props {
  live: boolean
  route: RouteMode
  treatment: string
  captureLive: boolean
  circuitOpen: boolean
  networkDelayMs: number
  preview: {
    env: string
    riskTier: string
    mcc: string
    amountCents: number
  }
  flagSource: string | null
  inferencePolicy: string | null
  requestedModels: string[] | null
  onRemediate: (kill: boolean) => void
}

export function DecisionerPane({
  live,
  route,
  treatment,
  captureLive,
  circuitOpen,
  networkDelayMs,
  preview,
  flagSource,
  inferencePolicy,
  requestedModels,
  onRemediate,
}: Props) {
  const pathLabel = route === 'fast' ? 'quick rules' : 'AI review'
  const amount = `$${(preview.amountCents / 100).toFixed(2)}`
  const profileLine = `Profile defaults: ${preview.env} · ${preview.riskTier} risk · MCC ${preview.mcc} · ${amount} → path ${pathLabel} · group ${treatment}`

  return (
    <section className="panel">
      <PanelHeader
        title="Authorization engine"
        subheader="Live status and what the next test payment will use"
        tip="Status chips reflect live flags. Emergency stop/resume change engine state for all new spend. The preview is based on the selected risk profile — not a past payment."
      />
      <p className="when-updates">
        Status updates when live flags change, when you stop/resume, or every
        few seconds. Preview updates when you change risk profile.
      </p>
      <div className="row">
        <StatusChip
          tone={live ? 'live' : 'frozen'}
          tip={
            live
              ? 'The engine is accepting spend authorizations.'
              : 'Stopped — all new spend is declined. Use Resume approvals here, or flip the live flag in the dashboard.'
          }
        >
          {live ? 'Accepting spend' : 'Stopped — all new spend declined'}
        </StatusChip>
        <StatusChip tip="Experiment group (control vs treatment) from the live flag.">
          experiment group · {treatment}
        </StatusChip>
        <StatusChip
          tone={captureLive ? 'live' : 'frozen'}
          tip="When off, irreversible capture is blocked separately from authorize."
        >
          capture · {captureLive ? 'on' : 'off'}
        </StatusChip>
        {flagSource && (
          <StatusChip tip="Where the current policy came from (live flags vs local fallback).">
            flags · {flagSource}
          </StatusChip>
        )}
        {circuitOpen && (
          <StatusChip
            tone="frozen"
            tip="Safety breaker open — traffic is declined until conditions recover."
          >
            circuit open
          </StatusChip>
        )}
      </div>
      <div className="row">
        <button className="danger" onClick={() => onRemediate(true)}>
          Emergency stop
        </button>
        <span
          className={!live ? undefined : 'disabled-wrap'}
          title={live ? 'Approvals are already running.' : undefined}
        >
          <button disabled={live} onClick={() => onRemediate(false)}>
            Resume approvals
          </button>
        </span>
      </div>

      <div className="decisioner-box">
        <strong>Next payment preview</strong>
        <p className="muted" style={{ marginTop: '0.25rem' }}>
          Based on the selected risk profile — not a specific past payment.
          Submitted amounts vary within that profile’s typical range.
        </p>
        <p className="mono muted" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
          {profileLine}
          {flagSource ? ` · source ${flagSource}` : ''}
        </p>
        <p className="mono muted" style={{ marginTop: '0.35rem', marginBottom: 0 }}>
          Decision method:{' '}
          {inferencePolicy
            ? `${inferencePolicy}${
                requestedModels?.length
                  ? ` · ${requestedModels.join(' → ')}`
                  : ''
              }`
            : '—'}
        </p>
        {!live ? (
          <p className="muted" style={{ marginTop: '0.65rem', marginBottom: 0 }}>
            Authorization is stopped. Use <strong>Resume approvals</strong> or
            flip the live flag in the dashboard. New payments decline on the
            server even if someone bypasses this screen.
          </p>
        ) : route === 'fast' ? (
          <p className="muted" style={{ marginTop: '0.65rem', marginBottom: 0 }}>
            <strong>Path: quick rules</strong> — lower-risk / under-cap traffic
            decides without an AI call. Spend caps and blocked merchant
            categories apply here.
          </p>
        ) : (
          <p className="muted" style={{ marginTop: '0.65rem', marginBottom: 0 }}>
            <strong>Path: AI review</strong> — prompt and model come from the
            decision config; practice mode or live AI runs. Structured
            approve/decline required or we decline by default.
          </p>
        )}
        <div className="slo ok" style={{ marginTop: '0.5rem' }}>
          Response target ~2000ms
          {networkDelayMs > 0
            ? ` · simulated delay ${networkDelayMs}ms will be added`
            : ''}
        </div>
      </div>
    </section>
  )
}
