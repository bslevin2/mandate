import { PanelHeader } from './PanelHeader'

export interface OpsSignal {
  id: string
  ts: string
  event: string
  webhookStatus: 'delivered' | 'skipped' | 'error'
  payload: Record<string, unknown>
}

interface Props {
  opsSignals: OpsSignal[]
}

export function OpsSignalsPane({ opsSignals }: Props) {
  return (
    <section className="panel">
      <PanelHeader
        title="Alerts & notifications"
        subheader="What fired when you stop approvals or hit cost spikes"
        tip="In-app log of emergency-stop and cost signals. Notification status is delivered, skipped (no webhook URL), or error."
      />
      <div className="feed" style={{ maxHeight: 220 }}>
        <table>
          <thead>
            <tr>
              <th>time</th>
              <th>event</th>
              <th>notification</th>
            </tr>
          </thead>
          <tbody>
            {opsSignals.length === 0 && (
              <tr>
                <td colSpan={3} className="muted">
                  No alerts yet — use Emergency stop to create one.
                </td>
              </tr>
            )}
            {opsSignals.slice(0, 10).map((s) => (
              <tr key={s.id}>
                <td className="mono">
                  {new Date(s.ts).toLocaleTimeString()}
                </td>
                <td>{s.event}</td>
                <td>
                  <span
                    className={`pill ${
                      s.webhookStatus === 'delivered'
                        ? 'approve'
                        : s.webhookStatus === 'error'
                          ? 'decline'
                          : ''
                    }`}
                  >
                    {s.webhookStatus}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
