import { PanelHeader } from './PanelHeader'

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
  return (
    <section className="panel">
      <PanelHeader
        title="Experiment results"
        subheader="Approve/decline counts by experiment group for this company"
        tip="Aggregated from Decision history for the current company. Submit 12 uses the same risk profile repeatedly for volume — it does not rotate profiles. Amounts vary within that profile’s typical range."
      />
      <div className="panel-body">
        <div className="feed">
          <table>
          <thead>
            <tr>
              <th title="Experiment variation assigned by the live flag">
                group
              </th>
              <th>approve</th>
              <th>decline</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>control</td>
              <td>{experiment.controlApprove}</td>
              <td>{experiment.controlDecline}</td>
            </tr>
            <tr>
              <td>treatment</td>
              <td>{experiment.treatmentApprove}</td>
              <td>{experiment.treatmentDecline}</td>
            </tr>
          </tbody>
        </table>
        </div>
      </div>
      <div className="row" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
        <button disabled={pending} onClick={onBurstExperiment}>
          Submit 12 test payments (same profile, amounts vary)
        </button>
      </div>
    </section>
  )
}
