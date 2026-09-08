import type { Evidence } from '../types'
import { PanelHeader } from './PanelHeader'
import { StatusChip } from './StatusChip'

interface Props {
  evidence: Evidence | null
  evidenceSource: 'live' | 'history' | null
  paymentId: string | null
}

export function EvidencePane({ evidence, evidenceSource, paymentId }: Props) {
  return (
    <section className="panel">
      <PanelHeader
        title="Why this decision"
        subheader="Rules applied to one payment you submitted or selected"
        tip="Read-only. Submit a test payment above, or select a Decision history row. To change how the next payment is decided, use Configure & submit (including Advanced)."
      />
      <div className="row">
        {evidence && evidenceSource === 'live' && (
          <StatusChip tone="live" tip="Loaded from the payment you just submitted.">
            Just submitted
          </StatusChip>
        )}
        {evidence && evidenceSource === 'history' && (
          <StatusChip tip="Loaded from a Decision history row.">
            From history
          </StatusChip>
        )}
      </div>

      <div className="panel-body">
      {!evidence ? (
        <p className="muted">
          Submit a test payment, or select a row in Decision history, to see
          the rules that were applied.
        </p>
      ) : (
        <>
          <dl className="kv mono">
            <dt title="Id for this spend attempt. Different from request id.">
              payment id
            </dt>
            <dd>{paymentId ?? '—'}</dd>
            <dt title="Id for the decision hop. Use this for replay and provider receipt — not the payment id.">
              request id
            </dt>
            <dd>{evidence.requestId ?? '—'}</dd>
            <dt title="Practice vs live AI, and which attempt served the answer. strict = backup model disallowed; model-fallback = same call used a later model in the list; app-hop = Retry on backup; unexpected-model = a different model served while backups were off.">
              mode / attempt
            </dt>
            <dd>
              {evidence.inferenceMode ?? '—'} · {evidence.hop ?? '—'}
            </dd>
            <dt title="Which model list / sort policy was selected">
              decision policy
            </dt>
            <dd>
              {evidence.inferencePolicy ?? '—'}
              {evidence.forceModelPath ? ' · always use AI' : ''}
            </dd>
            <dt title="Models requested in preference order">
              requested models
            </dt>
            <dd>
              {evidence.requestedModels?.length
                ? evidence.requestedModels.join(' → ')
                : '—'}
            </dd>
            <dt title="Model that actually produced the decision">
              served model
            </dt>
            <dd>{evidence.model ?? '—'}</dd>
            <dt title="Upstream provider that served the answer">
              served provider
            </dt>
            <dd>
              {evidence.servedProvider ??
                evidence.generationLookup?.providerName ??
                '—'}
            </dd>
            <dt title="Actor attached to the AI call">actor</dt>
            <dd>{evidence.inferenceUser ?? '—'}</dd>
            <dt title="Whether a backup model was allowed on this request">
              backup model
            </dt>
            <dd>
              {evidence.allowProviderFailover == null
                ? '—'
                : evidence.allowProviderFailover
                  ? 'allow'
                  : 'strict'}
            </dd>
            <dt title="Why this risk profile got this path / experiment group">
              targeting
            </dt>
            <dd>{evidence.targetingReason ?? '—'}</dd>
            <dt title="Quick rules vs AI review, and experiment group">
              path / experiment
            </dt>
            <dd>
              {evidence.route} · {evidence.treatment}
            </dd>
            <dt title="Decision config key used for prompt and model">
              decision config
            </dt>
            <dd>
              {evidence.aiConfigKey ?? '—'}{' '}
              {evidence.aiConfigEnabled ? '(enabled)' : ''}
            </dd>
            <dt title="Short preview of the prompt sent to the model">
              prompt preview
            </dt>
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
            <dt title="Provider receipt: cost, finish reason, attempts, errors">
              provider receipt
            </dt>
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
            <dt title="Shadow decision vs live; DIFF means they disagreed">
              shadow
            </dt>
            <dd>
              {evidence.shadowDecision
                ? `${evidence.shadowDecision} (${evidence.shadowModel})${
                    evidence.shadowDiff ? ' · DIFF' : ' · match'
                  }`
                : '—'}
            </dd>
          </dl>
          <p
            className="muted"
            style={{ marginTop: '0.6rem' }}
            title="Left: redacted context sent to the model. Right: raw context before redaction."
          >
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
      </div>
    </section>
  )
}
