import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { CircleHelp } from 'lucide-react'

interface Props {
  /** Tooltip body shown on hover/focus */
  text: string
  /** Accessible label for the tip button */
  label?: string
}

/** Focus/hover info tip via shadcn Tooltip. */
export function InfoTip({ text, label = 'More information' }: Props) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="size-5 text-muted-foreground"
          aria-label={label}
        >
          <CircleHelp className="size-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-pretty">
        {text}
      </TooltipContent>
    </Tooltip>
  )
}
