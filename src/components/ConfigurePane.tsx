import type { AudienceId, AuthRequest } from '@/types'
import { AUDIENCE_LIST } from '@/audiences'
import { InfoTip } from './InfoTip'
import { PanelHeader } from './PanelHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

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
  providerConfigured: boolean
  controlsError: string | null
}

function CheckRow({
  id,
  checked,
  onCheckedChange,
  label,
  tip,
}: {
  id: string
  checked: boolean
  onCheckedChange: (v: boolean) => void
  label: string
  tip: string
}) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(v) => onCheckedChange(v === true)}
      />
      <Label htmlFor={id} className="flex items-center gap-1 font-normal">
        {label}
        <InfoTip text={tip} />
      </Label>
    </div>
  )
}

function LastPaymentPanel({
  lastAuth,
  lastRequestId,
}: {
  lastAuth: AuthRequest | null
  lastRequestId: string | null
}) {
  return (
    <Card className="h-fit xl:sticky xl:top-6">
      <CardContent className="space-y-4 pt-6">
        <PanelHeader
          title="Last payment"
          subheader="Most recent test payment from this session"
          tip="Shows the last spend attempt you submitted here. Use the request id for replay on Decisions — not the payment id."
        />
        {lastAuth ? (
          <dl className="grid gap-x-4 gap-y-2 rounded-lg border bg-muted/40 p-3 font-mono text-xs sm:grid-cols-[auto_1fr]">
            <dt
              className="text-muted-foreground"
              title="Id for this spend attempt. Opaque fixture — it does not encode the approve/decline reason."
            >
              payment id
            </dt>
            <dd>{lastAuth.authId}</dd>
            <dt
              className="text-muted-foreground"
              title="Id for the decision hop. Use this for replay — not the payment id."
            >
              request id
            </dt>
            <dd>{lastRequestId ?? '—'}</dd>
            <dt className="text-muted-foreground">amount</dt>
            <dd>
              {(lastAuth.amountCents / 100).toFixed(2)} {lastAuth.currency}
            </dd>
            <dt className="text-muted-foreground">merchant category / name</dt>
            <dd>
              {lastAuth.mcc} · {lastAuth.merchant}
            </dd>
            <dt className="text-muted-foreground">agent</dt>
            <dd>{lastAuth.agentId}</dd>
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">
            No payment yet. Submit a test payment to see the details here.
          </p>
        )}
      </CardContent>
    </Card>
  )
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
  providerConfigured,
  controlsError,
}: Props) {
  const audience = AUDIENCE_LIST.find((a) => a.id === audienceId)!

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)]">
      <Card>
        <CardContent className="space-y-5 pt-6">
          <PanelHeader
            title="Configure & submit"
            subheader="Set company and risk profile, then send a test payment"
            tip="Everyday path: pick company and risk profile, check the preview on Engine, then submit. Burst uses the same risk profile; amounts vary within that profile’s typical range. Advanced settings change how the next payment is decided — they do not rewrite a past decision."
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="risk-profile">Risk profile</Label>
              <Select
                value={audienceId}
                onValueChange={(v) => onAudienceChange(v as AudienceId)}
              >
                <SelectTrigger id="risk-profile" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AUDIENCE_LIST.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="company" className="flex items-center gap-1">
                Company
                <InfoTip text="Decisions and the audit trail stay inside one company. Switch companies to see another company’s ledger." />
              </Label>
              <Select
                value={tenant}
                onValueChange={(v) => onTenantChange(v as TenantId)}
              >
                <SelectTrigger id="company" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="acme">acme</SelectItem>
                  <SelectItem value="globex">globex</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <p className="text-sm text-muted-foreground">{audience.description}</p>

          <div className="flex flex-wrap gap-2">
            <Button disabled={pending} onClick={onFireOne}>
              Submit a test payment
            </Button>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => onBurst(5)}
            >
              Submit 5 (same profile, amounts vary)
            </Button>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => onBurst(12)}
            >
              Submit 12 (same profile, amounts vary)
            </Button>
          </div>

          <details className="rounded-lg border bg-card">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
              Advanced settings
            </summary>
            <div className="space-y-5 border-t px-4 py-4">
              <p className="text-sm text-muted-foreground">
                These apply to the next submit — not to a payment you are
                inspecting in Last payment.
              </p>
              {controlsError && (
                <p role="alert" className="text-sm font-medium text-destructive">
                  {controlsError}
                </p>
              )}

              <div className="space-y-3">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Decision method
                </p>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Practice vs live AI</Label>
                    <Select
                      value={inferenceMode}
                      onValueChange={(v) =>
                        onInferenceMode(v as 'live' | 'simulator')
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="simulator">Practice mode</SelectItem>
                        <SelectItem
                          value="live"
                          disabled={!providerConfigured}
                        >
                          Live AI
                          {!providerConfigured ? ' (requires key)' : ''}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="network-delay">Network delay (ms)</Label>
                    <Input
                      id="network-delay"
                      type="number"
                      min={0}
                      max={5000}
                      value={networkDelayMs}
                      onChange={(e) =>
                        onNetworkDelay(Number(e.target.value) || 0)
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="budget">Session budget USD</Label>
                    <Input
                      id="budget"
                      type="number"
                      min={0}
                      step={0.01}
                      placeholder="unlimited"
                      value={budgetUsd ?? ''}
                      onChange={(e) =>
                        onBudget(
                          e.target.value === ''
                            ? null
                            : Number(e.target.value),
                        )
                      }
                    />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <CheckRow
                    id="break-pipe"
                    checked={breakPipe}
                    onCheckedChange={onBreakPipe}
                    label="Break the AI path (decline if it fails)"
                    tip="Fail-closed without calling the model."
                  />
                  <CheckRow
                    id="force-model"
                    checked={forceModelPath}
                    onCheckedChange={onForceModelPath}
                    label="Always use AI (skip simple rules)"
                    tip="Skips quick rules so a low-risk profile still hits AI review."
                  />
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Demo &amp; settlement
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <CheckRow
                    id="shadow"
                    checked={shadow}
                    onCheckedChange={onShadowChange}
                    label="Compare with shadow decision"
                    tip="Runs a second (shadow) decision alongside the live one so you can compare outcomes without changing the real approve/decline."
                  />
                  <div className="flex items-center gap-1">
                    <Button
                      variant="destructive"
                      disabled={pending}
                      onClick={onTamper}
                    >
                      Send a tampered request
                    </Button>
                    <InfoTip text="Sends a deliberately invalid or altered payload so you can see how the system declines unsafe traffic." />
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      disabled={pending || !lastAuth}
                      onClick={onCapture}
                    >
                      Capture
                    </Button>
                    <InfoTip text="Settles the last approved payment (irreversible in a real network). Needs a prior test payment." />
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      disabled={pending || !lastAuth}
                      onClick={onRefund}
                    >
                      Refund
                    </Button>
                    <InfoTip text="Refunds against the last payment. Needs a prior test payment." />
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Replay
                </p>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[14rem] flex-1 space-y-2">
                    <Label
                      htmlFor="replay-id"
                      className="flex items-center gap-1"
                    >
                      Replay by request id
                      <InfoTip text="Request id is the decision-hop id (req_… or sim_…), not the payment id. Results load into Why this decision." />
                    </Label>
                    <Input
                      id="replay-id"
                      value={replayId}
                      onChange={(e) => onReplayId(e.target.value)}
                      placeholder="req_… or sim_…"
                    />
                  </div>
                  <Button variant="outline" onClick={onReplay}>
                    Replay
                  </Button>
                </div>
              </div>
            </div>
          </details>
        </CardContent>
      </Card>

      <LastPaymentPanel lastAuth={lastAuth} lastRequestId={lastRequestId} />
    </div>
  )
}
