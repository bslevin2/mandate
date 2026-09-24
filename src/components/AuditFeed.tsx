import type { AuditRow } from '@/types'
import { PanelHeader } from './PanelHeader'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

interface Props {
  rows: AuditRow[]
  tenant: string
  selectedId?: string | null
  onSelect: (row: AuditRow) => void
}

export function AuditFeed({ rows, tenant, selectedId, onSelect }: Props) {
  return (
    <Card className="min-w-0">
      <CardContent className="pt-6">
        <PanelHeader
          title={`Decision history · ${tenant}`}
          subheader="Every decision for this company"
          tip="Select a row to see the rules that were applied in Why this decision. Request id is the decision hop (for replay). Payment id is the spend attempt — they are different."
        />
        <p className="mb-3 text-sm text-muted-foreground">
          Select a row to inspect applied rules. Request id is the decision hop;
          it is not the payment id.
        </p>
        <ScrollArea className="h-[28rem] rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>when</TableHead>
                <TableHead title="Authorize, capture, refund, or related step">
                  phase
                </TableHead>
                <TableHead>decision</TableHead>
                <TableHead>profile</TableHead>
                <TableHead title="Model or attempt that served this decision">
                  model / attempt
                </TableHead>
                <TableHead title="Decision-hop id for replay — not the payment id">
                  request id
                </TableHead>
                <TableHead title="This row’s seal in the company ledger (not the latest seal)">
                  seal
                </TableHead>
                <TableHead>reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-muted-foreground"
                  >
                    No decisions yet for this company.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow
                  key={r.id}
                  className={cn(
                    'cursor-pointer',
                    selectedId === r.id && 'bg-accent',
                  )}
                  onClick={() => onSelect(r)}
                  title="Load this decision into Why this decision"
                >
                  <TableCell className="font-mono text-xs">
                    {new Date(r.ts).toLocaleString(undefined, {
                      dateStyle: 'short',
                      timeStyle: 'medium',
                    })}
                  </TableCell>
                  <TableCell>{r.phase}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        r.decision === 'approve' ? 'default' : 'destructive'
                      }
                      className={cn(
                        r.decision === 'approve' &&
                          'bg-[color-mix(in_oklch,var(--good),transparent_12%)] text-white',
                      )}
                    >
                      {r.decision}
                    </Badge>
                  </TableCell>
                  <TableCell>{r.audienceId}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {r.evidence.model ?? r.evidence.hop ?? '—'}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {r.evidence.requestId ?? '—'}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {r.rowHash ? `${r.rowHash.slice(0, 8)}…` : '—'}
                  </TableCell>
                  <TableCell className="max-w-[12rem] truncate">
                    {r.evidence.reason}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
