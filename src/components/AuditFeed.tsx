import type { AuditRow } from '../types'

interface Props {
  rows: AuditRow[]
  tenant: string
  onSelect: (row: AuditRow) => void
}

export function AuditFeed({ rows, tenant, onSelect }: Props) {
  return (
    <section className="panel">
      <h2>Audit feed · {tenant}</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Tenant-scoped. Hash chain tip updates on each decision.
      </p>
      <div className="feed">
        <table>
          <thead>
            <tr>
              <th>time</th>
              <th>phase</th>
              <th>decision</th>
              <th>audience</th>
              <th>model / hop</th>
              <th>request_id</th>
              <th>hash</th>
              <th>reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="muted">
                  No decisions yet for this tenant.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr
                key={r.id}
                style={{ cursor: 'pointer' }}
                onClick={() => onSelect(r)}
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
    </section>
  )
}
