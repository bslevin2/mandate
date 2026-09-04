import type { AudienceId, AuthRequest } from '../types'
import { AUDIENCE_LIST } from '../audiences'

interface Props {
  audienceId: AudienceId
  onAudienceChange: (id: AudienceId) => void
  pending: boolean
  onFireOne: () => void
  onBurst: (n: number) => void
  onTamper: () => void
  onCapture: () => void
  onRefund: () => void
  lastAuth: AuthRequest | null
  shadow: boolean
  onShadowChange: (v: boolean) => void
}

export function TrafficPane({
  audienceId,
  onAudienceChange,
  pending,
  onFireOne,
  onBurst,
  onTamper,
  onCapture,
  onRefund,
  lastAuth,
  shadow,
  onShadowChange,
}: Props) {
  const audience = AUDIENCE_LIST.find((a) => a.id === audienceId)!

  return (
    <section className="panel">
      <h2>Traffic</h2>
      <div className="row">
        <label className="field">
          Audience
          <select
            value={audienceId}
            onChange={(e) => onAudienceChange(e.target.value as AudienceId)}
          >
            {AUDIENCE_LIST.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.4rem' }}>
          <input
            type="checkbox"
            checked={shadow}
            onChange={(e) => onShadowChange(e.target.checked)}
          />
          Shadow mode
        </label>
      </div>
      <p className="muted">{audience.description}</p>
      <div className="row">
        <button className="primary" disabled={pending} onClick={onFireOne}>
          Fire auth
        </button>
        <button disabled={pending} onClick={() => onBurst(5)}>
          Burst ×5
        </button>
        <button disabled={pending} onClick={() => onBurst(12)}>
          Burst ×12
        </button>
        <button className="danger" disabled={pending} onClick={onTamper}>
          Tamper POST
        </button>
        <button disabled={pending || !lastAuth} onClick={onCapture}>
          Capture
        </button>
        <button disabled={pending || !lastAuth} onClick={onRefund}>
          Refund
        </button>
      </div>
      {lastAuth && (
        <dl className="kv mono">
          <dt>auth_id</dt>
          <dd>{lastAuth.authId}</dd>
          <dt>amount</dt>
          <dd>
            {(lastAuth.amountCents / 100).toFixed(2)} {lastAuth.currency}
          </dd>
          <dt>mcc / merchant</dt>
          <dd>
            {lastAuth.mcc} · {lastAuth.merchant}
          </dd>
          <dt>agent</dt>
          <dd>{lastAuth.agentId}</dd>
        </dl>
      )}
    </section>
  )
}
