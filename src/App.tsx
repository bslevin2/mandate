import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLDClient } from 'launchdarkly-react-client-sdk'
import { AUDIENCES } from './audiences'
import { AuditFeed } from './components/AuditFeed'
import { DecisionerPane } from './components/DecisionerPane'
import { EvidencePane, type OpsSignal } from './components/EvidencePane'
import { TrafficPane } from './components/TrafficPane'
import type {
  AudienceId,
  AuditRow,
  AuthRequest,
  Evidence,
  RouteMode,
} from './types'

interface Status {
  decisionerLive: boolean
  route: RouteMode
  treatment: string
  captureLive: boolean
  circuitOpen: boolean
  sessionSpendUsd: number
  networkDelayMs: number
  breakPipe: boolean
  failoverDemo?: boolean
  flagSource?: string
  targetingReason?: string
  inferenceMode?: 'live' | 'simulator'
  ldClientConfigured?: boolean
  ldSdkConfigured?: boolean
  openRouterConfigured?: boolean
  webhookConfigured?: boolean
  streamingHint?: string
  aiConfigKey?: string
  aiConfigEnabled?: boolean
  promptPreview?: string
  tenant?: string
  integrityValid?: boolean
  integrityBrokenAt?: string | null
  tipHash?: string | null
}

function emptyEvidence(
  partial: Partial<Evidence> &
    Pick<
      Evidence,
      | 'decisionerLive'
      | 'route'
      | 'treatment'
      | 'captureAllowed'
      | 'circuitOpen'
    >,
): Evidence {
  return {
    aiConfigKey: null,
    aiConfigEnabled: false,
    promptPreview: null,
    model: null,
    latencyMs: null,
    promptTokens: null,
    completionTokens: null,
    costUsd: null,
    requestId: null,
    contextSent: {},
    contextRaw: {},
    reason: '',
    error: null,
    hop: null,
    shadowDecision: null,
    shadowModel: null,
    shadowDiff: null,
    spendCapHit: false,
    targetingReason: null,
    flagSource: null,
    inferenceMode: null,
    ...partial,
  }
}

export default function App({ ldEnabled = false }: { ldEnabled?: boolean }) {
  if (ldEnabled) return <AppWithLD />
  return <AppShell ldClient={null} />
}

function AppWithLD() {
  const ldClient = useLDClient()
  return <AppShell ldClient={ldClient ?? null} />
}

function AppShell({
  ldClient,
}: {
  ldClient: ReturnType<typeof useLDClient> | null
}) {
  const [audienceId, setAudienceId] = useState<AudienceId>('sandbox-low')
  const audience = AUDIENCES[audienceId]
  const [pending, setPending] = useState(false)
  const [lastAuth, setLastAuth] = useState<AuthRequest | null>(null)
  const [evidence, setEvidence] = useState<Evidence | null>(null)
  const [rows, setRows] = useState<AuditRow[]>([])
  const [opsSignals, setOpsSignals] = useState<OpsSignal[]>([])
  const [status, setStatus] = useState<Status>({
    decisionerLive: true,
    route: 'fast',
    treatment: 'control',
    captureLive: true,
    circuitOpen: false,
    sessionSpendUsd: 0,
    networkDelayMs: 0,
    breakPipe: false,
    inferenceMode: 'simulator',
    integrityValid: true,
  })
  const [breakPipe, setBreakPipe] = useState(false)
  const [failoverDemo, setFailoverDemo] = useState(false)
  const [inferenceMode, setInferenceMode] = useState<'live' | 'simulator'>(
    'simulator',
  )
  const [networkDelayMs, setNetworkDelayMs] = useState(0)
  const [budgetUsd, setBudgetUsd] = useState<number | null>(null)
  const [shadow, setShadow] = useState(false)
  const [replayId, setReplayId] = useState('')
  const [clientLive, setClientLive] = useState(true)
  const [clientRoute, setClientRoute] = useState<RouteMode | null>(null)

  const contextAttrs = useMemo(() => audience.context, [audience])

  const experiment = useMemo(() => {
    const score = {
      controlApprove: 0,
      controlDecline: 0,
      treatmentApprove: 0,
      treatmentDecline: 0,
    }
    for (const r of rows) {
      const t = r.evidence.treatment === 'treatment' ? 'treatment' : 'control'
      if (r.decision === 'approve') {
        if (t === 'treatment') score.treatmentApprove++
        else score.controlApprove++
      } else if (t === 'treatment') score.treatmentDecline++
      else score.controlDecline++
    }
    return score
  }, [rows])

  const identify = useCallback(async () => {
    if (!ldClient) return
    await ldClient.identify({
      kind: 'user',
      key: contextAttrs.key,
      email: contextAttrs.email,
      env: contextAttrs.env,
      risk_tier: contextAttrs.risk_tier,
      tenant: contextAttrs.tenant,
      mcc: contextAttrs.mcc,
      amount_cents: contextAttrs.amount_cents,
    })
    setClientLive(ldClient.variation('decisioner.live', true) as boolean)
    const route = String(ldClient.variation('decisioner.route', 'fast'))
    setClientRoute(route === 'fast' ? 'fast' : 'model')
  }, [ldClient, contextAttrs])

  useEffect(() => {
    void identify()
  }, [identify])

  useEffect(() => {
    if (!ldClient) return
    const handler = () => {
      setClientLive(ldClient.variation('decisioner.live', true) as boolean)
      const route = String(ldClient.variation('decisioner.route', 'model'))
      setClientRoute(route === 'fast' ? 'fast' : 'model')
    }
    ldClient.on('change', handler)
    return () => {
      ldClient.off('change', handler)
    }
  }, [ldClient])

  const refreshAudit = useCallback(async () => {
    const tenant = encodeURIComponent(contextAttrs.tenant)
    const res = await fetch(`/api/audit?tenant=${tenant}`)
    const data = (await res.json()) as AuditRow[]
    setRows(data)
  }, [contextAttrs.tenant])

  const refreshOps = useCallback(async () => {
    const res = await fetch('/api/ops-signals')
    const data = (await res.json()) as OpsSignal[]
    setOpsSignals(data)
  }, [])

  const refreshStatus = useCallback(async () => {
    const q = encodeURIComponent(JSON.stringify(contextAttrs))
    const res = await fetch(
      `/api/status?context=${q}&audienceId=${audienceId}`,
    )
    const data = (await res.json()) as Status
    setStatus(data)
    if (data.inferenceMode) setInferenceMode(data.inferenceMode)
    if (typeof data.breakPipe === 'boolean') setBreakPipe(data.breakPipe)
    if (typeof data.failoverDemo === 'boolean')
      setFailoverDemo(Boolean(data.failoverDemo))
  }, [contextAttrs, audienceId])

  useEffect(() => {
    void refreshAudit()
    void refreshStatus()
    void refreshOps()
    const t = setInterval(() => {
      void refreshStatus()
      void refreshAudit()
      void refreshOps()
    }, 4000)
    return () => clearInterval(t)
  }, [refreshAudit, refreshStatus, refreshOps])

  const pushControls = useCallback(
    async (patch: {
      breakPipe?: boolean
      failoverDemo?: boolean
      inferenceMode?: 'live' | 'simulator'
      networkDelayMs?: number
      budgetUsd?: number | null
    }) => {
      await fetch('/api/controls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      await refreshStatus()
    },
    [refreshStatus],
  )

  const authorize = useCallback(
    async (
      auth: AuthRequest,
      opts: { tamper?: boolean; shadow?: boolean; breakPipe?: boolean } = {},
    ) => {
      setPending(true)
      setLastAuth(auth)
      try {
        const context = {
          ...audience.context,
          mcc: auth.mcc,
          amount_cents: auth.amountCents,
        }
        if (ldClient) {
          await ldClient.identify({
            kind: 'user',
            key: context.key,
            email: context.email,
            env: context.env,
            risk_tier: context.risk_tier,
            tenant: context.tenant,
            mcc: context.mcc,
            amount_cents: context.amount_cents,
          })
        }
        const res = await fetch('/api/authorize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            audienceId,
            context,
            auth,
            tamper: opts.tamper,
            shadow: opts.shadow ?? shadow,
            breakPipe: opts.breakPipe ?? breakPipe,
          }),
        })
        const data = await res.json()
        if (data.evidence) setEvidence(data.evidence as Evidence)
        if (data.audit) {
          const audit = data.audit as AuditRow
          setRows((prev) => [audit, ...prev.filter((r) => r.id !== audit.id)])
        }
        if (typeof data.sessionSpendUsd === 'number') {
          setStatus((s) => ({ ...s, sessionSpendUsd: data.sessionSpendUsd }))
        }
        await refreshStatus()
        await refreshOps()
      } finally {
        setPending(false)
      }
    },
    [
      audience,
      audienceId,
      breakPipe,
      ldClient,
      refreshOps,
      refreshStatus,
      shadow,
    ],
  )

  const fireOne = async () => {
    const res = await fetch('/api/fixtures/one')
    const auth = (await res.json()) as AuthRequest
    if (audienceId !== 'blocked-mcc') {
      auth.mcc = audience.context.mcc
      auth.amountCents = audience.context.amount_cents
    } else {
      auth.mcc = '7995'
    }
    await authorize(auth)
  }

  const burst = async (n: number) => {
    const res = await fetch(`/api/fixtures/burst?n=${n}`)
    const list = (await res.json()) as AuthRequest[]
    for (const auth of list) {
      if (audienceId === 'blocked-mcc') auth.mcc = '7995'
      else auth.mcc = audience.context.mcc
      await authorize(auth)
    }
  }

  const tamper = async () => {
    const res = await fetch('/api/fixtures/one')
    const auth = (await res.json()) as AuthRequest
    await authorize(auth, { tamper: true })
  }

  const phaseCall = async (path: '/api/capture' | '/api/refund') => {
    if (!lastAuth) return
    setPending(true)
    try {
      const context = {
        ...audience.context,
        mcc: lastAuth.mcc,
        amount_cents: lastAuth.amountCents,
      }
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audienceId, context, auth: lastAuth }),
      })
      const data = await res.json()
      if (data.evidence) setEvidence(data.evidence as Evidence)
      if (data.audit) setRows((prev) => [data.audit as AuditRow, ...prev])
      await refreshStatus()
    } finally {
      setPending(false)
    }
  }

  const onRemediate = async (kill: boolean) => {
    await fetch('/api/remediate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kill }),
    })
    await refreshStatus()
    await refreshOps()
  }

  const onReplay = async () => {
    if (!replayId.trim()) return
    const tenant = encodeURIComponent(contextAttrs.tenant)
    const res = await fetch(
      `/api/audit/by-request/${encodeURIComponent(replayId.trim())}?tenant=${tenant}`,
    )
    if (res.status === 403) {
      const body = (await res.json()) as { error?: string }
      setEvidence(
        emptyEvidence({
          decisionerLive: status.decisionerLive,
          route: status.route,
          treatment: status.treatment,
          captureAllowed: status.captureLive,
          circuitOpen: status.circuitOpen,
          reason: 'Tenant isolation',
          error: body.error ?? 'Request id belongs to another tenant',
          requestId: replayId,
          hop: 'tenant-isolation',
        }),
      )
      return
    }
    if (!res.ok) {
      setEvidence(
        emptyEvidence({
          decisionerLive: status.decisionerLive,
          route: status.route,
          treatment: status.treatment,
          captureAllowed: status.captureLive,
          circuitOpen: status.circuitOpen,
          reason: 'Replay miss',
          error: 'No audit row for that request id',
          requestId: replayId,
        }),
      )
      return
    }
    const row = (await res.json()) as AuditRow
    setEvidence(row.evidence)
    setLastAuth(row.auth)
  }

  const onBreakIntegrity = async () => {
    await fetch('/api/integrity/break', { method: 'POST' })
    await refreshStatus()
  }

  const onRestoreIntegrity = async () => {
    await fetch('/api/integrity/restore', { method: 'POST' })
    await refreshStatus()
    await refreshAudit()
  }

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>Mandate</h1>
          <p>
            Automated agent-spend authorization control plane. Watch and steer
            the decisioner at volume — audiences, live kill, model routing, and
            an audit trail. Not a human review queue.
          </p>
        </div>
        <div className="badges">
          <span className="badge">tenant · {contextAttrs.tenant}</span>
          <span
            className={`badge ${status.integrityValid === false ? 'frozen' : 'live'}`}
          >
            integrity · {status.integrityValid === false ? 'broken' : 'valid'}
          </span>
          <span className={`badge ${status.decisionerLive ? 'live' : 'frozen'}`}>
            server {status.decisionerLive ? 'live' : 'killed'}
          </span>
          <span className="badge">route · {status.route}</span>
          <span className="badge">treatment · {status.treatment}</span>
          <span
            className={`badge ${inferenceMode === 'simulator' ? 'warn' : 'live'}`}
          >
            inference · {inferenceMode}
          </span>
          <span className="badge warn">
            ${status.sessionSpendUsd.toFixed(4)} session
          </span>
        </div>
      </header>

      <div className="row" style={{ marginBottom: '0.85rem' }}>
        <span
          className={`badge ${status.ldClientConfigured || ldClient ? 'live' : 'warn'}`}
        >
          {status.streamingHint ??
            (ldClient
              ? 'LD client: live streaming'
              : 'Remediate path (no reload)')}
        </span>
        <span
          className={`badge ${status.ldSdkConfigured ? 'live' : 'warn'}`}
        >
          LD server · {status.ldSdkConfigured ? 'keyed' : 'local-fallback'}
        </span>
        <span
          className={`badge ${status.openRouterConfigured ? 'live' : 'warn'}`}
        >
          OpenRouter ·{' '}
          {status.openRouterConfigured ? 'keyed' : 'simulator default'}
        </span>
        <span
          className={`badge ${status.webhookConfigured ? 'live' : 'warn'}`}
        >
          Webhook · {status.webhookConfigured ? 'configured' : 'in-app only'}
        </span>
        <span
          className={`badge ${status.aiConfigEnabled ? 'live' : 'warn'}`}
        >
          AI Config · {status.aiConfigKey ?? 'mandate-decisioner'}
        </span>
      </div>

      <div className="grid">
        <TrafficPane
          audienceId={audienceId}
          onAudienceChange={setAudienceId}
          pending={pending}
          onFireOne={() => void fireOne()}
          onBurst={(n) => void burst(n)}
          onTamper={() => void tamper()}
          onCapture={() => void phaseCall('/api/capture')}
          onRefund={() => void phaseCall('/api/refund')}
          lastAuth={lastAuth}
          shadow={shadow}
          onShadowChange={setShadow}
        />
        <DecisionerPane
          live={clientLive && status.decisionerLive && !status.circuitOpen}
          route={clientRoute ?? status.route}
          treatment={status.treatment}
          captureLive={status.captureLive}
          circuitOpen={status.circuitOpen}
          networkDelayMs={networkDelayMs}
          lastLatencyMs={evidence?.latencyMs ?? null}
          targetingReason={
            evidence?.targetingReason ?? status.targetingReason ?? null
          }
          flagSource={status.flagSource ?? null}
          experiment={experiment}
          onBurstExperiment={() => void burst(12)}
          pending={pending}
        />
        <EvidencePane
          evidence={evidence}
          breakPipe={breakPipe}
          onBreakPipe={(v) => {
            setBreakPipe(v)
            if (v) setFailoverDemo(false)
            void pushControls({ breakPipe: v, failoverDemo: false })
          }}
          failoverDemo={failoverDemo}
          onFailoverDemo={(v) => {
            setFailoverDemo(v)
            if (v) setBreakPipe(false)
            void pushControls({ failoverDemo: v, breakPipe: false })
          }}
          inferenceMode={inferenceMode}
          onInferenceMode={(m) => {
            setInferenceMode(m)
            void pushControls({ inferenceMode: m })
          }}
          networkDelayMs={networkDelayMs}
          onNetworkDelay={(ms) => {
            setNetworkDelayMs(ms)
            void pushControls({ networkDelayMs: ms })
          }}
          sessionSpendUsd={status.sessionSpendUsd}
          budgetUsd={budgetUsd}
          onBudget={(v) => {
            setBudgetUsd(v)
            void pushControls({ budgetUsd: v })
          }}
          replayId={replayId}
          onReplayId={setReplayId}
          onReplay={() => void onReplay()}
          onRemediate={(kill) => void onRemediate(kill)}
          opsSignals={opsSignals}
          openRouterConfigured={Boolean(status.openRouterConfigured)}
          integrityValid={status.integrityValid !== false}
          tipHash={status.tipHash ?? null}
          onBreakIntegrity={() => void onBreakIntegrity()}
          onRestoreIntegrity={() => void onRestoreIntegrity()}
          tenant={contextAttrs.tenant}
        />
        <AuditFeed
          rows={rows}
          tenant={contextAttrs.tenant}
          onSelect={(row) => {
            setEvidence(row.evidence)
            setLastAuth(row.auth)
            if (row.evidence.requestId) setReplayId(row.evidence.requestId)
          }}
        />
      </div>
    </div>
  )
}
