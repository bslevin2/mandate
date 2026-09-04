export type WebhookStatus = 'delivered' | 'skipped' | 'error'

export interface OpsSignal {
  id: string
  ts: string
  event: string
  webhookStatus: WebhookStatus
  payload: Record<string, unknown>
}

const signals: OpsSignal[] = []

export function listOpsSignals(limit = 50): OpsSignal[] {
  return signals.slice(0, limit)
}

function pushSignal(
  event: string,
  webhookStatus: WebhookStatus,
  payload: Record<string, unknown>,
): OpsSignal {
  const row: OpsSignal = {
    id: `ops_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    ts: new Date().toISOString(),
    event,
    webhookStatus,
    payload,
  }
  signals.unshift(row)
  if (signals.length > 200) signals.length = 200
  return row
}

/**
 * Always records an in-app ops signal. Optionally POSTs to OPS_WEBHOOK_URL.
 */
export async function fireOpsWebhook(
  payload: Record<string, unknown>,
): Promise<OpsSignal> {
  const event = String(payload.event ?? 'signal')
  const url = process.env.OPS_WEBHOOK_URL

  if (!url) {
    return pushSignal(event, 'skipped', {
      ...payload,
      note: 'OPS_WEBHOOK_URL not set — in-app signal only',
    })
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `[Mandate] ${event}`,
        ...payload,
      }),
    })
    if (!res.ok) {
      return pushSignal(event, 'error', {
        ...payload,
        httpStatus: res.status,
      })
    }
    return pushSignal(event, 'delivered', payload)
  } catch (err) {
    console.warn('[webhook] failed:', err)
    return pushSignal(event, 'error', {
      ...payload,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
