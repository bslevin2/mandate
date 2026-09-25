import type { ReactNode } from 'react'
import {
  Activity,
  Beaker,
  History,
  OctagonAlert,
  Play,
  Radio,
  ShieldCheck,
  Zap,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import type { RemediateAction } from '@/types'
import { CONSOLE_VIEWS, type ConsoleView } from './views'

const VIEW_ICONS: Record<ConsoleView, typeof Zap> = {
  traffic: Zap,
  engine: Activity,
  decisions: History,
  experiments: Beaker,
  trust: ShieldCheck,
  signals: Radio,
}

export interface SetupChip {
  label: string
  tip: string
  tone?: 'live' | 'warn' | 'default'
}

interface Props {
  activeView: ConsoleView
  onViewChange: (view: ConsoleView) => void
  live: boolean
  remediating: RemediateAction | null
  remediateNotice: string | null
  ldWriteConfigured: boolean
  onRemediate: (kill: boolean) => void
  setupChips: SetupChip[]
  statusSummary: ReactNode
}

export function AppSidebar({
  activeView,
  onViewChange,
  live,
  remediating,
  remediateNotice,
  ldWriteConfigured,
  onRemediate,
  setupChips,
  statusSummary,
}: Props) {
  return (
    <aside className="flex w-full shrink-0 flex-col border-b border-sidebar-border bg-sidebar text-sidebar-foreground lg:h-screen lg:w-72 lg:border-r lg:border-b-0">
      <div className="space-y-3 p-4">
        <div className="flex items-center gap-2.5">
          <img
            className="size-8 rounded-md"
            src="/favicon.svg"
            width={32}
            height={32}
            alt="Mandate"
          />
          <div>
            <div className="text-base font-semibold">Mandate</div>
            <p className="text-xs text-muted-foreground">Spend authorization</p>
          </div>
        </div>
        <p className="hidden text-xs leading-relaxed text-muted-foreground sm:block">
          Approve or decline agent spend automatically, with a clear record for
          each company.
        </p>
      </div>

      <div className="space-y-3 px-4 pb-4">
        <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              Engine
            </span>
            <Badge
              variant={live ? 'default' : 'destructive'}
              className={cn(
                live &&
                  'bg-[color-mix(in_oklch,var(--good),transparent_12%)] text-white',
              )}
            >
              {live ? 'Accepting' : 'Stopped'}
            </Badge>
          </div>
          <div className="flex gap-2">
            <Button
              variant="destructive"
              size="sm"
              className="flex-1"
              disabled={remediating !== null}
              title={
                ldWriteConfigured
                  ? 'Decline all new spend now and turn decisioner.live off'
                  : 'Decline all new spend now'
              }
              onClick={() => onRemediate(true)}
            >
              <OctagonAlert />
              {remediating === 'stop' ? 'Stopping…' : 'Stop'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              disabled={live || remediating !== null}
              title={
                ldWriteConfigured
                  ? 'Clear the stop and turn decisioner.live back on'
                  : 'Clear the emergency stop'
              }
              onClick={() => onRemediate(false)}
            >
              <Play />
              {remediating === 'resume' ? 'Resuming…' : 'Resume'}
            </Button>
          </div>
          {remediateNotice && (
            <p
              role="alert"
              className="mt-2 text-xs leading-snug text-destructive"
            >
              {remediateNotice}
            </p>
          )}
        </div>
        <div className="hidden flex-wrap gap-1.5 lg:flex">{statusSummary}</div>
      </div>

      <Separator className="hidden lg:block" />

      <nav className="flex gap-1 overflow-x-auto p-3 lg:flex-1 lg:flex-col lg:space-y-1 lg:overflow-y-auto">
        {CONSOLE_VIEWS.map((view) => {
          const Icon = VIEW_ICONS[view.id]
          const active = activeView === view.id
          return (
            <button
              key={view.id}
              type="button"
              onClick={() => onViewChange(view.id)}
              className={cn(
                'flex shrink-0 items-start gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors lg:w-full',
                active
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent/70',
              )}
            >
              <Icon
                className={cn(
                  'mt-0.5 size-4 shrink-0',
                  active ? 'text-primary' : 'text-muted-foreground',
                )}
              />
              <span>
                <span className="block text-sm font-medium">{view.label}</span>
                <span className="mt-0.5 hidden text-[11px] leading-snug text-muted-foreground lg:block">
                  {view.description}
                </span>
              </span>
            </button>
          )
        })}
      </nav>

      <Separator className="hidden lg:block" />

      <div className="hidden space-y-2 p-4 lg:block">
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          Setup
        </p>
        <div className="flex flex-wrap gap-1.5">
          {setupChips.map((chip) => (
            <Badge
              key={chip.label}
              title={chip.tip}
              variant={
                chip.tone === 'live'
                  ? 'default'
                  : chip.tone === 'warn'
                    ? 'secondary'
                    : 'outline'
              }
              className={cn(
                'max-w-full truncate',
                chip.tone === 'live' &&
                  'bg-[color-mix(in_oklch,var(--good),transparent_12%)] text-white',
                chip.tone === 'warn' &&
                  'border-[color-mix(in_oklch,var(--warn),transparent_40%)] bg-[color-mix(in_oklch,var(--warn),white_82%)] text-foreground',
              )}
            >
              {chip.label}
            </Badge>
          ))}
        </div>
      </div>
    </aside>
  )
}
