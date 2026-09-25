import type { ReactNode } from 'react'
import type { RemediateAction } from '@/types'
import { AppSidebar, type SetupChip } from './AppSidebar'
import { ViewHeader } from './ViewHeader'
import { CONSOLE_VIEWS, type ConsoleView } from './views'

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
  children: ReactNode
}

export function AppShell({
  activeView,
  onViewChange,
  live,
  remediating,
  remediateNotice,
  ldWriteConfigured,
  onRemediate,
  setupChips,
  statusSummary,
  children,
}: Props) {
  const meta = CONSOLE_VIEWS.find((v) => v.id === activeView)!

  return (
    <div className="flex min-h-screen flex-col bg-background lg:flex-row">
      <AppSidebar
        activeView={activeView}
        onViewChange={onViewChange}
        live={live}
        remediating={remediating}
        remediateNotice={remediateNotice}
        ldWriteConfigured={ldWriteConfigured}
        onRemediate={onRemediate}
        setupChips={setupChips}
        statusSummary={statusSummary}
      />
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="w-full max-w-[90rem] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <ViewHeader
            title={meta.label}
            description={meta.description}
          />
          {children}
        </div>
      </main>
    </div>
  )
}
