import { InfoTip } from '@/components/InfoTip'

interface Props {
  title: string
  description: string
  tip?: string
}

export function ViewHeader({ title, description, tip }: Props) {
  return (
    <header className="mb-6 space-y-1">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-semibold text-foreground">
          {title}
        </h1>
        {tip ? <InfoTip text={tip} label={`About ${title}`} /> : null}
      </div>
      <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
    </header>
  )
}
