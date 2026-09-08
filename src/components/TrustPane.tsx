import { InfoTip } from './InfoTip'
import { PanelHeader } from './PanelHeader'
import { StatusChip } from './StatusChip'

interface Props {
  tenant: string
  integrityValid: boolean
  tipHash: string | null
  onBreakIntegrity: () => void
  onRestoreIntegrity: () => void
}

export function TrustPane({
  tenant,
  integrityValid,
  tipHash,
  onBreakIntegrity,
  onRestoreIntegrity,
}: Props) {
  return (
    <section className="panel">
      <PanelHeader
        title="Company separation & tamper check"
        subheader="Each company’s ledger stays separate — and you can prove it wasn’t altered"
        tip="Decision history and replay only show this company’s rows. Each decision is sealed into the next (a hash chain). Break seal corrupts the latest seal on purpose; Restore re-seals. Looking up another company’s request id is blocked."
      />
      <div className="panel-body">
      <div className="row">
        <StatusChip
          tone={integrityValid ? 'live' : 'frozen'}
          tip="Whether this company’s sealed decision trail still checks out end-to-end."
        >
          ledger · {integrityValid ? 'intact' : 'tampered'}
        </StatusChip>
        {tipHash && (
          <StatusChip
            mono
            tip="Latest seal on the ledger — updates on each new decision. Different from the per-row seal in Decision history."
          >
            latest seal · {tipHash.slice(0, 12)}…
          </StatusChip>
        )}
        <span className="field-with-tip">
          <button className="danger" onClick={onBreakIntegrity}>
            Break seal
          </button>
          <InfoTip text="Demo only — deliberately corrupts the latest seal so the ledger shows as tampered." />
        </span>
        <span className="field-with-tip">
          <button onClick={onRestoreIntegrity}>Restore ledger</button>
          <InfoTip text="Re-seals the decision trail after a break demo." />
        </span>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        Viewing company <code>{tenant}</code>.
      </p>
      </div>
    </section>
  )
}
