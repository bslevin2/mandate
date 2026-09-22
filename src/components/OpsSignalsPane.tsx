import { PanelHeader } from './PanelHeader'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { Bell, CheckCircle2, CircleAlert, SkipForward } from 'lucide-react'

export interface OpsSignal {
  id: string
  ts: string
  event: string
  webhookStatus: 'delivered' | 'skipped' | 'error'
  payload: Record<string, unknown>
}

interface Props {
  opsSignals: OpsSignal[]
}

function StatusIcon({ status }: { status: OpsSignal['webhookStatus'] }) {
  if (status === 'delivered')
    return <CheckCircle2 className="size-4 text-[var(--good)]" />
  if (status === 'error')
    return <CircleAlert className="size-4 text-destructive" />
  return <SkipForward className="size-4 text-muted-foreground" />
}

export function OpsSignalsPane({ opsSignals }: Props) {
  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <PanelHeader
          title="Alerts & notifications"
          subheader="What fired when you stop approvals or hit cost spikes"
          tip="In-app log of emergency-stop and cost signals. Notification status is delivered, skipped (no webhook URL), or error."
        />

        <div className="divide-y rounded-lg border">
          {opsSignals.length === 0 && (
            <div className="flex items-center gap-3 px-4 py-6 text-sm text-muted-foreground">
              <Bell className="size-4" />
              No alerts yet — use Emergency stop to create one.
            </div>
          )}
          {opsSignals.slice(0, 10).map((s) => (
            <div
              key={s.id}
              className="flex items-start gap-3 px-4 py-3"
            >
              <StatusIcon status={s.webhookStatus} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{s.event}</span>
                  <Badge
                    variant={
                      s.webhookStatus === 'delivered'
                        ? 'default'
                        : s.webhookStatus === 'error'
                          ? 'destructive'
                          : 'secondary'
                    }
                    className={cn(
                      s.webhookStatus === 'delivered' &&
                        'bg-[color-mix(in_oklch,var(--good),transparent_12%)] text-white',
                    )}
                  >
                    {s.webhookStatus}
                  </Badge>
                </div>
                <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                  {new Date(s.ts).toLocaleTimeString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
