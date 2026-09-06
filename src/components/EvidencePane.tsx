import type { Evidence } from '../types'

export interface OpsSignal {
  id: string
  ts: string
  event: string
  webhookStatus: 'delivered' | 'skipped' | 'error'
  payload: Record<string, unknown>
}

interface Props {
  evidence: Evidence | null
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
  sessionSpendUsd: number
  budgetUsd: number | null
  onBudget: (v: number | null) => void
  replayId: string
  onReplayId: (v: string) => void
  onReplay: () => void
  onRemediate: (kill: boolean) => void
  opsSignals: OpsSignal[]
  openRouterConfigured: boolean
  integrityValid: boolean
  tipHash: string | null
  onBreakIntegrity: () => void
  onRestoreIntegrity: () => void
  tenant: string
  inferencePolicy: string | null
  onLookupGeneration: () => void
  generationPending: boolean
  onLookupKey: () => void
  keyUsageLabel: string | null
}

export function EvidencePane({
  evidence,
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
  sessionSpendUsd,
  budgetUsd,
  onBudget,
  replayId,
  onReplayId,
  onReplay,
  onRemediate,
  opsSignals,
  openRouterConfigured,
  integrityValid,
  tipHash,
  onBreakIntegrity,
  onRestoreIntegrity,
  tenant,
  inferencePolicy,
  onLookupGeneration,
  generationPending,
  onLookupKey,
  keyUsageLabel,
}: Props) {
  return (
    <section className="panel">
      <h2>Evidence</h2>
      {inferenceMode === 'simulator' && (
        <p className="badge warn" style={{ display: 'inline-block' }}>
          Simulated inference — not a live provider call
        </p>
      )}
      <div className="row">
        <label className="field">
          Inference
          <select
            value={inferenceMode}
            onChange={(e) =>
              onInferenceMode(e.target.value as 'live' | 'simulator')
            }
          >
            <option value="simulator">Simulator</option>
            <option value="live" disabled={!openRouterConfigured}>
              Live{!openRouterConfigured ? ' (requires key)' : ''}
            </option>
          </select>
        </label>
        <label
          className="field"
          style={{ flexDirection: 'row', alignItems: 'center', gap: '0.4rem' }}
        >
          <input
            type="checkbox"
            checked={breakPipe}
            onChange={(e) => onBreakPipe(e.target.checked)}
          />
          Break (fail-closed)
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
          App hop (2nd request)
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
        <button className="danger" onClick={() => onRemediate(true)}>
          Remediate kill
        </button>
        <button onClick={() => onRemediate(false)}>Restore</button>
      </div>
      <div className="row">
        <label
          className="field"
          style={{ flexDirection: 'row', alignItems: 'center', gap: '0.4rem' }}
        >
          <input
            type="checkbox"
            checked={allowProviderFailover}
            onChange={(e) => onAllowProviderFailover(e.target.checked)}
          />
          Allow provider failover
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
          Force model path
        </label>
        <span className="badge">
          inference policy · {inferencePolicy ?? evidence?.inferencePolicy ?? '—'}
        </span>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        App hop is a second HTTP call after a broken primary — not provider
        failover. Provider failover is the per-request allow/deny on the same
        call. Force model path skips fast-path so a cheap audience still hits
        inference.
      </p>
      <div className="row">
        <label className="field">
          Replay by request ID
          <input
            value={replayId}
            onChange={(e) => onReplayId(e.target.value)}
            placeholder="req_… or sim_…"
          />
        </label>
        <button onClick={onReplay}>Replay</button>
        <button
          disabled={generationPending || !evidence?.requestId}
          onClick={onLookupGeneration}
        >
          Look up generation
        </button>
        <button onClick={onLookupKey}>Key usage</button>
        <span className="badge warn">
          session spend · ${sessionSpendUsd.toFixed(4)}
        </span>
        {keyUsageLabel && <span className="badge">{keyUsageLabel}</span>}
      </div>

      <h2 style={{ marginTop: '1rem' }}>Trust · isolation & integrity</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Audit and replay are scoped to tenant <code>{tenant}</code>. Each row
        carries <code>prevHash</code> → <code>rowHash</code> (SHA-256). Cross-tenant
        replay returns 403.
      </p>
      <div className="row">
        <span
          className={`badge ${integrityValid ? 'live' : 'frozen'}`}
        >
          chain · {integrityValid ? 'valid' : 'broken'}
        </span>
        {tipHash && (
          <span className="badge mono">
            tip · {tipHash.slice(0, 12)}…
          </span>
        )}
        <button className="danger" onClick={onBreakIntegrity}>
          Break integrity
        </button>
        <button onClick={onRestoreIntegrity}>Restore chain</button>
      </div>

      {!evidence ? (
        <p className="muted">Fire an authorization to populate evidence.</p>
      ) : (
        <>
          <dl className="kv mono">
            <dt>mode / hop</dt>
            <dd>
              {evidence.inferenceMode ?? '—'} · {evidence.hop ?? '—'}
            </dd>
            <dt>inference policy</dt>
            <dd>
              {evidence.inferencePolicy ?? '—'}
              {evidence.forceModelPath ? ' · force model path' : ''}
            </dd>
            <dt>requested models</dt>
            <dd>
              {evidence.requestedModels?.length
                ? evidence.requestedModels.join(' → ')
                : '—'}
            </dd>
            <dt>served model</dt>
            <dd>{evidence.model ?? '—'}</dd>
            <dt>served provider</dt>
            <dd>{evidence.servedProvider ?? evidence.generationLookup?.providerName ?? '—'}</dd>
            <dt>actor (user)</dt>
            <dd>{evidence.inferenceUser ?? '—'}</dd>
            <dt>provider failover</dt>
            <dd>
              {evidence.allowProviderFailover == null
                ? '—'
                : evidence.allowProviderFailover
                  ? 'allow'
                  : 'strict'}
            </dd>
            <dt>targeting</dt>
            <dd>{evidence.targetingReason ?? '—'}</dd>
            <dt>route / treatment</dt>
            <dd>
              {evidence.route} · {evidence.treatment}
            </dd>
            <dt>decision config</dt>
            <dd>
              {evidence.aiConfigKey ?? '—'}{' '}
              {evidence.aiConfigEnabled ? '(enabled)' : ''}
            </dd>
            <dt>prompt preview</dt>
            <dd>{evidence.promptPreview ?? '—'}</dd>
            <dt>latency</dt>
            <dd>
              {evidence.latencyMs == null ? '—' : `${evidence.latencyMs}ms`}
            </dd>
            <dt>tokens</dt>
            <dd>
              {evidence.promptTokens ?? '—'} / {evidence.completionTokens ?? '—'}
            </dd>
            <dt>cost</dt>
            <dd>
              {evidence.costUsd == null
                ? '—'
                : `$${evidence.costUsd.toFixed(6)}`}
            </dd>
            <dt>request_id</dt>
            <dd>{evidence.requestId ?? '—'}</dd>
            <dt>generation</dt>
            <dd>
              {evidence.generationLookup
                ? [
                    evidence.generationLookup.providerName,
                    evidence.generationLookup.totalCost != null
                      ? `$${evidence.generationLookup.totalCost.toFixed(6)}`
                      : null,
                    evidence.generationLookup.finishReason,
                    evidence.generationLookup.providerResponsesCount != null
                      ? `attempts ${evidence.generationLookup.providerResponsesCount}`
                      : null,
                    evidence.generationLookup.error,
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'looked up'
                : '—'}
            </dd>
            <dt>reason</dt>
            <dd>{evidence.reason}</dd>
            <dt>error</dt>
            <dd>{evidence.error ?? '—'}</dd>
            <dt>shadow</dt>
            <dd>
              {evidence.shadowDecision
                ? `${evidence.shadowDecision} (${evidence.shadowModel})${
                    evidence.shadowDiff ? ' · DIFF' : ' · match'
                  }`
                : '—'}
            </dd>
          </dl>
          <p className="muted" style={{ marginTop: '0.6rem' }}>
            Context sent to model (redacted) vs raw
          </p>
          <div className="row" style={{ alignItems: 'stretch' }}>
            <pre className="json" style={{ flex: 1 }}>
              {JSON.stringify(evidence.contextSent, null, 2)}
            </pre>
            <pre className="json" style={{ flex: 1 }}>
              {JSON.stringify(evidence.contextRaw, null, 2)}
            </pre>
          </div>
        </>
      )}

      <h2 style={{ marginTop: '1rem' }}>Ops signals (integrations)</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Always logged in-app. Webhook status: delivered / skipped (no URL) /
        error.
      </p>
      <div className="feed" style={{ maxHeight: 120 }}>
        <table>
          <thead>
            <tr>
              <th>time</th>
              <th>event</th>
              <th>webhook</th>
            </tr>
          </thead>
          <tbody>
            {opsSignals.length === 0 && (
              <tr>
                <td colSpan={3} className="muted">
                  No signals yet — Remediate kill to create one.
                </td>
              </tr>
            )}
            {opsSignals.slice(0, 10).map((s) => (
              <tr key={s.id}>
                <td className="mono">
                  {new Date(s.ts).toLocaleTimeString()}
                </td>
                <td>{s.event}</td>
                <td>
                  <span
                    className={`pill ${
                      s.webhookStatus === 'delivered'
                        ? 'approve'
                        : s.webhookStatus === 'error'
                          ? 'decline'
                          : ''
                    }`}
                  >
                    {s.webhookStatus}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
