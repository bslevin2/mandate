import { InfoTip } from './InfoTip'
import { PanelHeader } from './PanelHeader'
import { StatusChip } from './StatusChip'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ShieldAlert } from 'lucide-react'

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
    <Card>
      <CardContent className="space-y-5 pt-6">
        <PanelHeader
          title="Company separation & tamper check"
          subheader="Each company’s ledger stays separate — and you can prove it wasn’t altered"
          tip="Decision history and replay only show this company’s rows. Each decision is sealed into the next (a hash chain). Break seal corrupts the latest seal on purpose; Restore re-seals. Looking up another company’s request id is blocked."
        />

        <Alert variant={integrityValid ? 'default' : 'destructive'}>
          <ShieldAlert />
          <AlertTitle>
            Ledger · {integrityValid ? 'intact' : 'tampered'}
          </AlertTitle>
          <AlertDescription>
            Viewing company <code className="font-mono">{tenant}</code>.
            {tipHash
              ? ` Latest seal ${tipHash.slice(0, 12)}…`
              : ' No seal yet.'}
          </AlertDescription>
        </Alert>

        <div className="flex flex-wrap items-center gap-2">
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
          <div className="flex items-center gap-1">
            <Button variant="destructive" onClick={onBreakIntegrity}>
              Break seal
            </Button>
            <InfoTip text="Demo only — deliberately corrupts the latest seal so the ledger shows as tampered." />
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" onClick={onRestoreIntegrity}>
              Restore ledger
            </Button>
            <InfoTip text="Re-seals the decision trail after a break demo." />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
