import type { RouteMode } from '../types'

interface Props {
  live: boolean
  route: RouteMode
  treatment: string
  captureLive: boolean
  circuitOpen: boolean
  networkDelayMs: number
  lastLatencyMs: number | null
  targetingReason: string | null
  flagSource: string | null
  experiment: {
    controlApprove: number
    controlDecline: number
    treatmentApprove: number
    treatmentDecline: number
  }
  onBurstExperiment: () => void
  pending: boolean
}

export function DecisionerPane({
  live,
  route,
  treatment,
  captureLive,
  circuitOpen,
  networkDelayMs,
  lastLatencyMs,
  targetingReason,
  flagSource,
  experiment,
  onBurstExperiment,
  pending,
}: Props) {
  const sloMs = 2000
  const effectiveLatency = (lastLatencyMs ?? 0) + networkDelayMs
  const sloOk = effectiveLatency <= sloMs

  return (
    <section className="panel">
      <h2>Decisioner</h2>
      <div className="row">
        <span className={`badge ${live ? 'live' : 'frozen'}`}>
          {live ? 'LIVE' : 'FROZEN / FAIL-CLOSED'}
        </span>
        <span className="badge">treatment · {treatment}</span>
        <span className={`badge ${captureLive ? 'live' : 'frozen'}`}>
          capture · {captureLive ? 'on' : 'off'}
        </span>
        {flagSource && <span className="badge">flags · {flagSource}</span>}
        {circuitOpen && <span className="badge frozen">circuit open</span>}
      </div>

      {targetingReason && (
        <p className="mono muted" style={{ marginTop: 0 }}>
          Targeting: {targetingReason}
        </p>
      )}

      {!live ? (
        <div className="decisioner-box frozen">
          <strong>Decisioner killed</strong>
          <p className="muted">
            Toggle <code>decisioner.live</code> off in LaunchDarkly (streaming)
            or use <strong>Remediate kill</strong> (no reload either way). New
            authorizations decline on the server even if a client tries to bypass
            this UI.
          </p>
        </div>
      ) : (
        <div className="decisioner-box">
          {route === 'fast' ? (
            <div>
              <strong>Route: fast-path policy</strong>
              <p className="muted">
                Low-risk / under-cap traffic decides without a model call. Spend
                caps and blocked MCC rules apply here.
              </p>
            </div>
          ) : (
            <div>
              <strong>Route: model path</strong>
              <p className="muted">
                AI Config supplies prompt + model; OpenRouter (or simulator)
                executes. Structured JSON <code>approve|decline</code> required
                or we fail closed.
              </p>
            </div>
          )}
          <div className={`slo ${sloOk ? 'ok' : 'bad'}`}>
            Auth SLO ~{sloMs}ms · last effective latency{' '}
            {lastLatencyMs == null ? '—' : `${effectiveLatency}ms`}
            {networkDelayMs > 0 ? ` (incl. ${networkDelayMs}ms sim)` : ''}
          </div>
        </div>
      )}

      <h2 style={{ marginTop: '1rem' }}>Experiment scoreboard</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Local counts by <code>decisioner.experiment</code> treatment (also
        tracked to LD when the server SDK is keyed).
      </p>
      <div className="feed" style={{ maxHeight: 140 }}>
        <table>
          <thead>
            <tr>
              <th>treatment</th>
              <th>approve</th>
              <th>decline</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>control</td>
              <td>{experiment.controlApprove}</td>
              <td>{experiment.controlDecline}</td>
            </tr>
            <tr>
              <td>treatment</td>
              <td>{experiment.treatmentApprove}</td>
              <td>{experiment.treatmentDecline}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="row" style={{ marginTop: '0.5rem' }}>
        <button disabled={pending} onClick={onBurstExperiment}>
          Burst ×12 (experiment)
        </button>
      </div>
    </section>
  )
}
