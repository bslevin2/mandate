import type { RemediateAction, RouteMode } from '@/types'
import { PanelHeader } from './PanelHeader'
import { StatusChip } from './StatusChip'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { OctagonAlert, Play } from 'lucide-react'

interface Props {
  live: boolean
  localKill: boolean
  flagLive: boolean
  ldConfigured: boolean
  ldWriteConfigured: boolean
  remediating: RemediateAction | null
  notice: string | null
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
  pathPolicy: string | null
  decisionConfigLabel: string | null
  onRemediate: (kill: boolean) => void
}

const FLAG_WRITE_ENV = 'LD_API_TOKEN, LD_PROJECT_KEY, and LD_ENVIRONMENT_KEY'

function controlsSummary(ldConfigured: boolean, ldWriteConfigured: boolean) {
  if (ldWriteConfigured) {
    return 'Stop declines all new spend on the server instantly and turns decisioner.live off in the flag dashboard. Resume turns it back on.'
  }
  if (ldConfigured) {
    return `Stop declines all new spend on the server instantly but doesn’t change decisioner.live in the flag dashboard. Set ${FLAG_WRITE_ENV} so Stop and Resume flip it.`
  }
  return 'Freeze the decisioner for all new spend without a deploy. Resume when ready.'
}

function stoppedDetail({
  localKill,
  flagLive,
  circuitOpen,
  ldWriteConfigured,
}: Pick<Props, 'localKill' | 'flagLive' | 'circuitOpen' | 'ldWriteConfigured'>) {
  if (!localKill && flagLive) {
    return circuitOpen
      ? 'The safety breaker is open until conditions recover.'
      : ''
  }
  if (flagLive) return 'Emergency stop is on. Resume approvals clears it.'
  const cause = localKill
    ? 'Emergency stop is on and decisioner.live is off.'
    : 'decisioner.live is off.'
  if (ldWriteConfigured) {
    return `${cause} Resume approvals ${localKill ? 'clears the stop and turns the flag back on' : 'turns it back on'}.`
  }
  return localKill
    ? `${cause} Turn the flag back on in the dashboard and use Resume approvals to clear the emergency stop.`
    : `${cause} Turn it back on in the flag dashboard — Resume can’t change the flag without ${FLAG_WRITE_ENV}.`
}

export function DecisionerPane({
  live,
  localKill,
  flagLive,
  ldConfigured,
  ldWriteConfigured,
  remediating,
  notice,
  route,
  treatment,
  captureLive,
  circuitOpen,
  networkDelayMs,
  preview,
  flagSource,
  pathPolicy,
  decisionConfigLabel,
  onRemediate,
}: Props) {
  const pathLabel = route === 'fast' ? 'quick rules' : 'AI review'
  const amount = `$${(preview.amountCents / 100).toFixed(2)}`
  const profileLine = `Profile defaults: ${preview.env} · ${preview.riskTier} risk · MCC ${preview.mcc} · ${amount} → path ${pathLabel} · group ${treatment}`
  const stopped = stoppedDetail({
    localKill,
    flagLive,
    circuitOpen,
    ldWriteConfigured,
  })

  return (
    <Card>
      <CardContent className="space-y-5 pt-6">
        <PanelHeader
          title="Authorization engine"
          subheader="Live status and what the next test payment will use"
          tip="Status chips reflect live flags and the server’s emergency stop. The preview is based on the selected risk profile — not a past payment."
        />
        <p className="text-sm text-muted-foreground">
          Status updates when live flags change, when you stop/resume, or every
          few seconds. Preview updates when you change risk profile.
        </p>

        <div className="flex flex-wrap gap-2">
          <StatusChip
            tone={live ? 'live' : 'frozen'}
            tip={
              live
                ? 'The engine is accepting spend authorizations.'
                : `Stopped — all new spend is declined. ${stopped}`
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

        <Alert variant={live ? 'default' : 'destructive'}>
          <OctagonAlert />
          <AlertTitle>
            {live ? 'Emergency controls' : 'Approvals are stopped'}
          </AlertTitle>
          <AlertDescription className="space-y-3">
            <p>
              {live
                ? controlsSummary(ldConfigured, ldWriteConfigured)
                : `New payments decline on the server even if someone bypasses this screen. ${stopped}`}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="destructive"
                size="sm"
                disabled={remediating !== null}
                onClick={() => onRemediate(true)}
              >
                <OctagonAlert />
                {remediating === 'stop' ? 'Stopping…' : 'Emergency stop'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={live || remediating !== null}
                title={live ? 'Approvals are already running.' : undefined}
                onClick={() => onRemediate(false)}
              >
                <Play />
                {remediating === 'resume' ? 'Resuming…' : 'Resume approvals'}
              </Button>
            </div>
            {notice && <p className="font-medium text-destructive">{notice}</p>}
          </AlertDescription>
        </Alert>

        <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
          <strong className="text-sm">Next payment preview</strong>
          <p className="text-sm text-muted-foreground">
            Based on the selected risk profile — not a specific past payment.
            Submitted amounts vary within that profile’s typical range.
          </p>
          <p className="font-mono text-xs text-muted-foreground">
            {profileLine}
            {flagSource ? ` · source ${flagSource}` : ''}
          </p>
          <p className="font-mono text-xs text-muted-foreground">
            Decision method:{' '}
            {pathPolicy
              ? `${pathPolicy}${
                  decisionConfigLabel ? ` · ${decisionConfigLabel}` : ''
                }`
              : '—'}
          </p>
          {!live ? (
            <p className="text-sm text-muted-foreground">
              Authorization is stopped — the next payment will be declined.
            </p>
          ) : route === 'fast' ? (
            <p className="text-sm text-muted-foreground">
              <strong>Path: quick rules</strong> — lower-risk / under-cap traffic
              decides without an AI call. Spend caps and blocked merchant
              categories apply here.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              <strong>Path: AI review</strong> — prompt and model come from the
              decision config; practice mode or live AI runs. Structured
              approve/decline required or we decline by default.
            </p>
          )}
          <div className="rounded-md border border-[color-mix(in_oklch,var(--good),transparent_60%)] bg-[color-mix(in_oklch,var(--good),white_90%)] px-3 py-2 text-xs text-foreground">
            Response target ~2000ms
            {networkDelayMs > 0
              ? ` · simulated delay ${networkDelayMs}ms will be added`
              : ''}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
