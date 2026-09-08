import type { ReactNode } from 'react'
import { InfoTip } from './InfoTip'

interface Props {
  title: string
  subheader: string
  tip: string
  /** Use h3 for nested sections inside a panel */
  level?: 2 | 3
  children?: ReactNode
}

export function PanelHeader({
  title,
  subheader,
  tip,
  level = 2,
  children,
}: Props) {
  const Heading = level === 3 ? 'h3' : 'h2'
  return (
    <header className={`panel-header${level === 3 ? ' nested' : ''}`}>
      <div className="panel-header-title-row">
        <Heading>{title}</Heading>
        <InfoTip text={tip} label={`About ${title}`} />
        {children}
      </div>
      <p className="panel-subheader">{subheader}</p>
    </header>
  )
}
