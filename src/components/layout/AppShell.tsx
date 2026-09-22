import type { ReactNode } from 'react'
import { AppSidebar, type SetupChip } from './AppSidebar'
import { ViewHeader } from './ViewHeader'
import { CONSOLE_VIEWS, type ConsoleView } from './views'

interface Props {
  activeView: ConsoleView
  onViewChange: (view: ConsoleView) => void
  live: boolean
  onRemediate: (kill: boolean) => void
  setupChips: SetupChip[]
  statusSummary: ReactNode
  children: ReactNode
}

export function AppShell({
  activeView,
  onViewChange,
  live,
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
        onRemediate={onRemediate}
        setupChips={setupChips}
        statusSummary={statusSummary}
      />
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
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
