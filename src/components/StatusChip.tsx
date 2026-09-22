import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

type Tone = 'default' | 'live' | 'frozen' | 'warn'

interface Props {
  children: ReactNode
  tone?: Tone
  /** Read-only status tip — chips are never interactive */
  tip?: string
  className?: string
  mono?: boolean
}

/** Read-only status chip — intentionally not button-like. */
export function StatusChip({
  children,
  tone = 'default',
  tip,
  className,
  mono = false,
}: Props) {
  const badge = (
    <Badge
      role="status"
      variant={
        tone === 'frozen'
          ? 'destructive'
          : tone === 'live'
            ? 'default'
            : tone === 'warn'
              ? 'secondary'
              : 'outline'
      }
      className={cn(
        'max-w-full truncate font-normal',
        mono && 'font-mono text-[11px]',
        tone === 'live' &&
          'bg-[color-mix(in_oklch,var(--good),transparent_12%)] text-white hover:bg-[color-mix(in_oklch,var(--good),transparent_12%)]',
        tone === 'warn' &&
          'border-[color-mix(in_oklch,var(--warn),transparent_40%)] bg-[color-mix(in_oklch,var(--warn),white_82%)] text-foreground hover:bg-[color-mix(in_oklch,var(--warn),white_82%)]',
        className,
      )}
    >
      {children}
    </Badge>
  )

  if (!tip) return badge

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex max-w-full">{badge}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-pretty">{tip}</TooltipContent>
    </Tooltip>
  )
}
