import { PanelHeader } from './PanelHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface Props {
  experiment: {
    controlApprove: number
    controlDecline: number
    treatmentApprove: number
    treatmentDecline: number
  }
  pending: boolean
  onBurstExperiment: () => void
}

export function ExperimentPane({
  experiment,
  pending,
  onBurstExperiment,
}: Props) {
  const controlTotal =
    experiment.controlApprove + experiment.controlDecline
  const treatmentTotal =
    experiment.treatmentApprove + experiment.treatmentDecline

  return (
    <Card>
      <CardContent className="space-y-5 pt-6">
        <PanelHeader
          title="Experiment results"
          subheader="Approve/decline counts by experiment group for this company"
          tip="Aggregated from Decision history for the current company. Submit 12 uses the same risk profile repeatedly for volume — it does not rotate profiles. Amounts vary within that profile’s typical range."
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border bg-muted/30 p-4">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Control
            </p>
            <p className="mt-2 text-2xl font-semibold tracking-tight">
              {experiment.controlApprove}
              <span className="text-base font-normal text-muted-foreground">
                {' '}
                approve
              </span>
            </p>
            <p className="text-sm text-muted-foreground">
              {experiment.controlDecline} decline · {controlTotal} total
            </p>
          </div>
          <div className="rounded-xl border bg-muted/30 p-4">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Treatment
            </p>
            <p className="mt-2 text-2xl font-semibold tracking-tight">
              {experiment.treatmentApprove}
              <span className="text-base font-normal text-muted-foreground">
                {' '}
                approve
              </span>
            </p>
            <p className="text-sm text-muted-foreground">
              {experiment.treatmentDecline} decline · {treatmentTotal} total
            </p>
          </div>
        </div>

        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead title="Experiment variation assigned by the live flag">
                  group
                </TableHead>
                <TableHead>approve</TableHead>
                <TableHead>decline</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>control</TableCell>
                <TableCell>{experiment.controlApprove}</TableCell>
                <TableCell>{experiment.controlDecline}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>treatment</TableCell>
                <TableCell>{experiment.treatmentApprove}</TableCell>
                <TableCell>{experiment.treatmentDecline}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        <Button disabled={pending} onClick={onBurstExperiment}>
          Submit 12 test payments (same profile, amounts vary)
        </Button>
      </CardContent>
    </Card>
  )
}
