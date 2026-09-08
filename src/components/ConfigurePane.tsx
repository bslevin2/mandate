import type { AudienceId, AuthRequest } from '../types'
import { AUDIENCE_LIST } from '../audiences'
import { InfoTip } from './InfoTip'
import { PanelHeader } from './PanelHeader'
import { StatusChip } from './StatusChip'

export type TenantId = 'acme' | 'globex'

interface Props {
  audienceId: AudienceId
  onAudienceChange: (id: AudienceId) => void
  tenant: TenantId
  onTenantChange: (id: TenantId) => void
  pending: boolean
  onFireOne: () => void
  onBurst: (n: number) => void
  onTamper: () => void
  onCapture: () => void
  onRefund: () => void
  lastAuth: AuthRequest | null
  lastRequestId: string | null
  shadow: boolean
  onShadowChange: (v: boolean) => void
  breakPipe: boolean
  onBreakPipe: (v: boolean) => void
  failoverDemo: boolean
  onFailoverDemo: (v: boolean) => void
  allowProviderFailover: boolean
  onAllowProviderFailover: (v: boolean) => void
  forceModelPath: boolean
  onForceModelPath: (v: boolean) => void
  inferenceMode: 'live' | 'simulator'
  onInferenceMode: (m: 'live' | 'simulator') => void
  networkDelayMs: number
  onNetworkDelay: (ms: number) => void
  budgetUsd: number | null
  onBudget: (v: number | null) => void
  replayId: string
  onReplayId: (v: string) => void
  onReplay: () => void
  openRouterConfigured: boolean
  onLookupGeneration: () => void
  generationPending: boolean
  onLookupKey: () => void
  keyUsageLabel: string | null
  hasRequestId: boolean
}

export function ConfigurePane({
  audienceId,
  onAudienceChange,
  tenant,
  onTenantChange,
  pending,
  onFireOne,
  onBurst,
  onTamper,
  onCapture,
  onRefund,
  lastAuth,
  lastRequestId,
  shadow,
  onShadowChange,
  breakPipe,
  onBreakPipe,
  failoverDemo,
  onFailoverDemo,
  allowProviderFailover,
  onAllowProviderFailover,
  forceModelPath,
  onForceModelPath,
  inferenceMode,
  onInferenceMode,
  networkDelayMs,
  onNetworkDelay,
  budgetUsd,
  onBudget,
  replayId,
  onReplayId,
  onReplay,
  openRouterConfigured,
  onLookupGeneration,
  generationPending,
  onLookupKey,
  keyUsageLabel,
  hasRequestId,
}: Props) {
  const audience = AUDIENCE_LIST.find((a) => a.id === audienceId)!
  const lookupDisabled = generationPending || !hasRequestId
  const lookupTip = generationPending
    ? 'Lookup in progress…'
    : 'Submit a test payment first — this looks up cost and details for that decision’s request id (not the payment id).'

  return (
    <section className="panel">
      <PanelHeader
        title="Configure & submit"
        subheader="Set company and risk profile, then send a test payment"
        tip="Everyday path: pick company and risk profile, check the preview on the right, then submit. Burst uses the same risk profile; amounts vary within that profile’s typical range. Advanced settings change how the next payment is decided — they do not rewrite a past decision."
      />
      <div className="row">
        <label className="field">
          Risk profile
          <select
            value={audienceId}
            onChange={(e) => onAudienceChange(e.target.value as AudienceId)}
          >
            {AUDIENCE_LIST.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-with-tip">
            Company
            <InfoTip text="Decisions and the audit trail stay inside one company. Switch companies to see another company’s ledger." />
          </span>
          <select
            value={tenant}
            onChange={(e) => onTenantChange(e.target.value as TenantId)}
          >
            <option value="acme">acme</option>
            <option value="globex">globex</option>
          </select>
        </label>
      </div>
      <p className="muted audience-blurb">{audience.description}</p>
      <div className="row">
        <button className="primary" disabled={pending} onClick={onFireOne}>
          Submit a test payment
        </button>
        <button disabled={pending} onClick={() => onBurst(5)}>
          Submit 5 (same profile, amounts vary)
        </button>
        <button disabled={pending} onClick={() => onBurst(12)}>
          Submit 12 (same profile, amounts vary)
        </button>
      </div>
      {lastAuth && (
        <dl className="kv mono">
          <dt title="Id for this spend attempt. Opaque fixture — it does not encode the approve/decline reason.">
            payment id
          </dt>
          <dd>{lastAuth.authId}</dd>
          <dt title="Id for the decision hop. Use this for replay and provider receipt — not the payment id.">
            request id
          </dt>
          <dd>{lastRequestId ?? '—'}</dd>
          <dt>amount</dt>
          <dd>
            {(lastAuth.amountCents / 100).toFixed(2)} {lastAuth.currency}
          </dd>
          <dt>merchant category / name</dt>
          <dd>
            {lastAuth.mcc} · {lastAuth.merchant}
          </dd>
          <dt>agent</dt>
          <dd>{lastAuth.agentId}</dd>
        </dl>
      )}

      <details className="advanced">
        <summary>Advanced settings</summary>
        <p className="muted" style={{ marginTop: '0.45rem' }}>
          These apply to the next submit — not to a payment you are inspecting
          below.
        </p>

        <div className="control-group">
          <span className="control-group-label">Decision method</span>
          <div className="row">
            <label className="field">
              Practice vs live AI
              <select
                value={inferenceMode}
                onChange={(e) =>
                  onInferenceMode(e.target.value as 'live' | 'simulator')
                }
              >
                <option value="simulator">Practice mode</option>
                <option value="live" disabled={!openRouterConfigured}>
                  Live AI{!openRouterConfigured ? ' (requires key)' : ''}
                </option>
              </select>
            </label>
            <label className="field">
              Network delay (ms)
              <input
                type="number"
                min={0}
                max={5000}
                value={networkDelayMs}
                onChange={(e) => onNetworkDelay(Number(e.target.value) || 0)}
              />
            </label>
            <label className="field">
              Session budget USD
              <input
                type="number"
                min={0}
                step={0.01}
                placeholder="unlimited"
                value={budgetUsd ?? ''}
                onChange={(e) =>
                  onBudget(e.target.value === '' ? null : Number(e.target.value))
                }
              />
            </label>
          </div>
          <div className="row">
            <label
              className="field"
              style={{ flexDirection: 'row', alignItems: 'center', gap: '0.4rem' }}
            >
              <input
                type="checkbox"
                checked={breakPipe}
                onChange={(e) => onBreakPipe(e.target.checked)}
              />
              <span className="field-with-tip">
                Break the AI path (decline if it fails)
                <InfoTip text="Fail-closed on a broken primary. With Allow backup model, this request uses the other listed model instead. With Retry on backup, Mandate makes a second request." />
              </span>
            </label>
            <label
              className="field"
              style={{ flexDirection: 'row', alignItems: 'center', gap: '0.4rem' }}
            >
              <input
                type="checkbox"
                checked={failoverDemo}
                onChange={(e) => onFailoverDemo(e.target.checked)}
              />
              <span className="field-with-tip">
                Retry on backup AI call
                <InfoTip text="A second request after a broken primary — not the same as allowing a backup model on one call." />
              </span>
            </label>
            <label
              className="field"
              style={{ flexDirection: 'row', alignItems: 'center', gap: '0.4rem' }}
            >
              <input
                type="checkbox"
                checked={allowProviderFailover}
                onChange={(e) => onAllowProviderFailover(e.target.checked)}
              />
              <span className="field-with-tip">
                Allow backup model on same call
                <InfoTip text="On a healthy primary the provider will not switch. Check Break as well: primary is skipped and this request uses the other listed model." />
              </span>
            </label>
            <label
              className="field"
              style={{ flexDirection: 'row', alignItems: 'center', gap: '0.4rem' }}
            >
              <input
                type="checkbox"
                checked={forceModelPath}
                onChange={(e) => onForceModelPath(e.target.checked)}
              />
              <span className="field-with-tip">
                Always use AI (skip simple rules)
                <InfoTip text="Skips quick rules so a low-risk profile still hits AI review." />
              </span>
            </label>
          </div>
        </div>

        <div className="control-group">
          <span className="control-group-label">Demo &amp; settlement</span>
          <div className="row">
            <label
              className="field"
              style={{ flexDirection: 'row', alignItems: 'center', gap: '0.4rem' }}
            >
              <input
                type="checkbox"
                checked={shadow}
                onChange={(e) => onShadowChange(e.target.checked)}
              />
              <span className="field-with-tip">
                Compare with shadow decision
                <InfoTip text="Runs a second (shadow) decision alongside the live one so you can compare outcomes without changing the real approve/decline." />
              </span>
            </label>
            <span className="field-with-tip">
              <button className="danger" disabled={pending} onClick={onTamper}>
                Send a tampered request
              </button>
              <InfoTip text="Sends a deliberately invalid or altered payload so you can see how the system declines unsafe traffic." />
            </span>
            <span className="field-with-tip">
              <button disabled={pending || !lastAuth} onClick={onCapture}>
                Capture
              </button>
              <InfoTip text="Settles the last approved payment (irreversible in a real network). Needs a prior test payment." />
            </span>
            <span className="field-with-tip">
              <button disabled={pending || !lastAuth} onClick={onRefund}>
                Refund
              </button>
              <InfoTip text="Refunds against the last payment. Needs a prior test payment." />
            </span>
          </div>
        </div>

        <div className="control-group">
          <span className="control-group-label">Lookups</span>
          <div className="row">
            <label className="field">
              <span className="field-with-tip">
                Replay by request id
                <InfoTip text="Request id is the decision-hop id (req_… or sim_…), not the payment id. Results load into Why this decision." />
              </span>
              <input
                value={replayId}
                onChange={(e) => onReplayId(e.target.value)}
                placeholder="req_… or sim_…"
              />
            </label>
            <button onClick={onReplay}>Replay</button>
            <span
              className={lookupDisabled ? 'disabled-wrap' : undefined}
              title={lookupDisabled ? lookupTip : undefined}
            >
              <button disabled={lookupDisabled} onClick={onLookupGeneration}>
                Check provider receipt
              </button>
            </span>
            <button onClick={onLookupKey}>Key usage</button>
            {keyUsageLabel && (
              <StatusChip tip="Provider key usage from the last lookup.">
                {keyUsageLabel}
              </StatusChip>
            )}
          </div>
        </div>
      </details>
    </section>
  )
}
