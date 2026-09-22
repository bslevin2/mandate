import type { Evidence } from '@/types'
import { PanelHeader } from './PanelHeader'
import { StatusChip } from './StatusChip'
import { Card, CardContent } from '@/components/ui/card'

interface Props {
  evidence: Evidence | null
  evidenceSource: 'live' | 'history' | null
  paymentId: string | null
}

function Kv({
  label,
  title,
  value,
}: {
  label: string
  title?: string
  value: string
}) {
  return (
    <>
      <dt className="text-muted-foreground" title={title}>
        {label}
      </dt>
      <dd className="break-all">{value}</dd>
    </>
  )
}

export function EvidencePane({ evidence, evidenceSource, paymentId }: Props) {
  return (
    <Card className="min-w-0">
      <CardContent className="space-y-4 pt-6">
        <PanelHeader
          title="Why this decision"
          subheader="Rules applied to one payment you submitted or selected"
          tip="Read-only. Submit a test payment in Traffic, or select a Decision history row. To change how the next payment is decided, use Traffic (including Advanced)."
        />
        <div className="flex flex-wrap gap-2">
          {evidence && evidenceSource === 'live' && (
            <StatusChip
              tone="live"
              tip="Loaded from the payment you just submitted."
            >
              Just submitted
            </StatusChip>
          )}
          {evidence && evidenceSource === 'history' && (
            <StatusChip tip="Loaded from a Decision history row.">
              From history
            </StatusChip>
          )}
        </div>

        {!evidence ? (
          <p className="text-sm text-muted-foreground">
            Submit a test payment, or select a row in Decision history, to see
            the rules that were applied.
          </p>
        ) : (
          <>
            <dl className="grid gap-x-4 gap-y-2 rounded-lg border bg-muted/40 p-3 font-mono text-xs sm:grid-cols-[auto_1fr]">
              <Kv
                label="payment id"
                title="Id for this spend attempt. Different from request id."
                value={paymentId ?? '—'}
              />
              <Kv
                label="request id"
                title="Id for the decision hop. Use this for replay — not the payment id."
                value={evidence.requestId ?? '—'}
              />
              <Kv
                label="mode / attempt"
                title="Practice vs live AI, and which attempt served the answer."
                value={`${evidence.inferenceMode ?? '—'} · ${evidence.hop ?? '—'}`}
              />
              <Kv
                label="path policy"
                title="Quick rules vs model review for this audience"
                value={`${evidence.pathPolicy ?? '—'}${
                  evidence.forceModelPath ? ' · always use AI' : ''
                }`}
              />
              <Kv
                label="served model"
                title="Model that produced the decision"
                value={evidence.model ?? '—'}
              />
              <Kv
                label="served provider"
                title="Provider named by the decision config"
                value={evidence.servedProvider ?? '—'}
              />
              <Kv
                label="actor"
                title="Actor attached to the AI call"
                value={evidence.inferenceUser ?? '—'}
              />
              <Kv
                label="targeting"
                title="Why this risk profile got this path / experiment group"
                value={evidence.targetingReason ?? '—'}
              />
              <Kv
                label="path / experiment"
                title="Quick rules vs AI review, and experiment group"
                value={`${evidence.route} · ${evidence.treatment}`}
              />
              <Kv
                label="decision config"
                title="Decision config key used for prompt and model"
                value={`${evidence.aiConfigKey ?? '—'} ${
                  evidence.aiConfigEnabled ? '(enabled)' : ''
                }`}
              />
              <Kv
                label="prompt preview"
                title="Short preview of the prompt from the decision config"
                value={evidence.promptPreview ?? '—'}
              />
              <Kv
                label="latency"
                value={
                  evidence.latencyMs == null
                    ? '—'
                    : `${evidence.latencyMs}ms`
                }
              />
              <Kv
                label="tokens"
                value={`${evidence.promptTokens ?? '—'} / ${evidence.completionTokens ?? '—'}`}
              />
              <Kv
                label="cost"
                value={
                  evidence.costUsd == null
                    ? '—'
                    : `$${evidence.costUsd.toFixed(6)}`
                }
              />
              <Kv
                label="evaluation"
                title="Optional judge evaluation from the decision config"
                value={evidence.judgeEvaluation ?? '—'}
              />
              <Kv label="reason" value={evidence.reason} />
              <Kv label="error" value={evidence.error ?? '—'} />
              <Kv
                label="shadow"
                title="Shadow decision vs live; DIFF means they disagreed"
                value={
                  evidence.shadowDecision
                    ? `${evidence.shadowDecision} (${evidence.shadowModel})${
                        evidence.shadowDiff ? ' · DIFF' : ' · match'
                      }`
                    : '—'
                }
              />
            </dl>
            <p
              className="text-sm text-muted-foreground"
              title="Left: redacted context sent to the model. Right: raw context before redaction."
            >
              Context sent to model (redacted) vs raw
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <pre className="max-h-56 overflow-auto rounded-lg border bg-muted/50 p-3 font-mono text-[11px] leading-relaxed">
                {JSON.stringify(evidence.contextSent, null, 2)}
              </pre>
              <pre className="max-h-56 overflow-auto rounded-lg border bg-muted/50 p-3 font-mono text-[11px] leading-relaxed">
                {JSON.stringify(evidence.contextRaw, null, 2)}
              </pre>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
