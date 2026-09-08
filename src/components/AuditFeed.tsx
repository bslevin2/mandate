import type { AuditRow } from '../types'
import { PanelHeader } from './PanelHeader'

interface Props {
  rows: AuditRow[]
  tenant: string
  onSelect: (row: AuditRow) => void
}

export function AuditFeed({ rows, tenant, onSelect }: Props) {
  return (
    <section className="panel">
      <PanelHeader
        title={`Decision history · ${tenant}`}
        subheader="Every decision for this company"
        tip="Select a row to see the rules that were applied in Why this decision. Request id is the decision hop (replay / provider receipt). Payment id is the spend attempt — they are different."
      />
      <p className="muted" style={{ marginTop: 0 }}>
        Select a row to inspect applied rules. Request id is the decision hop;
        it is not the payment id.
      </p>
      <div className="panel-body">
        <div className="feed">
          <table>
          <thead>
            <tr>
              <th>time</th>
              <th title="Authorize, capture, refund, or related step">
                phase
              </th>
              <th>decision</th>
              <th>profile</th>
              <th title="Model or attempt that served this decision">
                model / attempt
              </th>
              <th title="Decision-hop id for replay and provider receipt — not the payment id">
                request id
              </th>
              <th title="This row’s seal in the company ledger (not the latest seal)">
                seal
              </th>
              <th>reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="muted">
                  No decisions yet for this company.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr
                key={r.id}
                style={{ cursor: 'pointer' }}
                onClick={() => onSelect(r)}
                title="Load this decision into Why this decision"
              >
                <td className="mono">{new Date(r.ts).toLocaleTimeString()}</td>
                <td>{r.phase}</td>
                <td>
                  <span className={`pill ${r.decision}`}>{r.decision}</span>
                </td>
                <td>{r.audienceId}</td>
                <td className="mono">
                  {r.evidence.model ?? r.evidence.hop ?? '—'}
                </td>
                <td className="mono">{r.evidence.requestId ?? '—'}</td>
                <td className="mono">
                  {r.rowHash ? `${r.rowHash.slice(0, 8)}…` : '—'}
                </td>
                <td>{r.evidence.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </section>
  )
}
