import { useId } from 'react'

interface Props {
  /** Tooltip body shown on hover/focus */
  text: string
  /** Accessible label for the tip button */
  label?: string
}

/** Focus/hover info tip — no dependency, CSS-driven tooltip. */
export function InfoTip({ text, label = 'More information' }: Props) {
  const id = useId()
  return (
    <span className="info-tip">
      <button
        type="button"
        className="info-tip-btn"
        aria-label={label}
        aria-describedby={id}
      >
        ?
      </button>
      <span id={id} role="tooltip" className="info-tip-bubble">
        {text}
      </span>
    </span>
  )
}
