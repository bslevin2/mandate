import type { ReactNode } from 'react'
import { InfoTip } from './InfoTip'
import { cn } from '@/lib/utils'

interface Props {
  title: string
  subheader: string
  tip: string
  /** Use h3 for nested sections inside a panel */
  level?: 2 | 3
  children?: ReactNode
  className?: string
}

export function PanelHeader({
  title,
  subheader,
  tip,
  level = 2,
  children,
  className,
}: Props) {
  const Heading = level === 3 ? 'h3' : 'h2'
  return (
    <header className={cn('mb-4 space-y-1', className)}>
      <div className="flex items-center gap-2">
        <Heading
          className={cn(
            'font-semibold text-foreground',
            level === 3 ? 'text-base' : 'text-lg',
          )}
        >
          {title}
        </Heading>
        <InfoTip text={tip} label={`About ${title}`} />
        {children}
      </div>
      <p className="text-sm text-muted-foreground">{subheader}</p>
    </header>
  )
}
