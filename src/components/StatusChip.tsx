import type { ReactNode } from 'react'

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
  className = '',
  mono = false,
}: Props) {
  const toneClass = tone === 'default' ? '' : ` ${tone}`
  const monoClass = mono ? ' mono' : ''
  return (
    <span
      className={`status-chip${toneClass}${monoClass} ${className}`.trim()}
      title={tip}
      role="status"
    >
      {children}
    </span>
  )
}
