import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLDClient } from 'launchdarkly-react-client-sdk'
import { AUDIENCES } from './audiences'
import { applyAudienceToAuth } from './fixtureProfile'
import { AuditFeed } from './components/AuditFeed'
import { ConfigurePane, type TenantId } from './components/ConfigurePane'
import { DecisionerPane } from './components/DecisionerPane'
import { EvidencePane } from './components/EvidencePane'
import { ExperimentPane } from './components/ExperimentPane'
import {
  OpsSignalsPane,
  type OpsSignal,
} from './components/OpsSignalsPane'
import { StatusChip } from './components/StatusChip'
import { TrustPane } from './components/TrustPane'
import { AppShell } from './components/layout/AppShell'
import type { ConsoleView } from './components/layout/views'
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
  flagSource?: string
  targetingReason?: string
  inferenceMode?: 'live' | 'simulator'
  ldClientConfigured?: boolean
  ldSdkConfigured?: boolean
  providerConfigured?: boolean
  webhookConfigured?: boolean
  streamingHint?: string
  aiConfigKey?: string
  aiConfigEnabled?: boolean
  aiConfigModel?: string | null
  aiConfigProvider?: string | null
  promptPreview?: string
  tenant?: string
  integrityValid?: boolean
  integrityBrokenAt?: string | null
  tipHash?: string | null
  pathPolicy?: string | null
  forceModelPath?: boolean
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
    servedProvider: null,
    pathPolicy: null,
    inferenceUser: null,
    forceModelPath: null,
    judgeEvaluation: null,
    ...partial,
  }
}

export default function App({ ldEnabled = false }: { ldEnabled?: boolean }) {
  if (ldEnabled) return <AppWithLD />
  return <MandateConsole ldClient={null} />
}

function AppWithLD() {
  const ldClient = useLDClient()
  return <MandateConsole ldClient={ldClient ?? null} />
}

function MandateConsole({
  ldClient,
}: {
  ldClient: ReturnType<typeof useLDClient> | null
}) {
  const [view, setView] = useState<ConsoleView>('traffic')
  const [audienceId, setAudienceId] = useState<AudienceId>('sandbox-low')
  const audience = AUDIENCES[audienceId]
  const [tenant, setTenant] = useState<TenantId>('acme')
  const [pending, setPending] = useState(false)
  const [lastAuth, setLastAuth] = useState<AuthRequest | null>(null)
  const [evidence, setEvidence] = useState<Evidence | null>(null)
  const [evidenceSource, setEvidenceSource] = useState<
    'live' | 'history' | null
  >(null)
  const [selectedAuditId, setSelectedAuditId] = useState<string | null>(null)
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
  const [forceModelPath, setForceModelPath] = useState(false)
  const [inferenceMode, setInferenceMode] = useState<'live' | 'simulator'>(
    'simulator',
  )
  const [networkDelayMs, setNetworkDelayMs] = useState(0)
  const [budgetUsd, setBudgetUsd] = useState<number | null>(null)
  const [shadow, setShadow] = useState(false)
  const [replayId, setReplayId] = useState('')
  const [clientLive, setClientLive] = useState(true)
  const [clientRoute, setClientRoute] = useState<RouteMode | null>(null)
  const [ldReady, setLdReady] = useState(false)

  const contextAttrs = useMemo(
    () => ({ ...audience.context, tenant }),
    [audience, tenant],
  )

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

  const applyClientFlags = useCallback(() => {
    if (!ldClient) return
    setClientLive(ldClient.variation('decisioner.live', true) as boolean)
    const route = String(ldClient.variation('decisioner.route', 'fast'))
    setClientRoute(route === 'fast' ? 'fast' : 'model')
  }, [ldClient])

  const identify = useCallback(async () => {
    if (!ldClient) return
    try {
      if (typeof ldClient.waitForInitialization === 'function') {
        await ldClient.waitForInitialization(5)
      }
      setLdReady(true)
    } catch {
      setLdReady(Boolean(ldClient))
    }
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
    applyClientFlags()
  }, [ldClient, contextAttrs, applyClientFlags])

  useEffect(() => {
    void identify()
  }, [identify])

  const refreshAudit = useCallback(async () => {
    const t = encodeURIComponent(contextAttrs.tenant)
    const res = await fetch(`/api/audit?tenant=${t}`)
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
    if (typeof data.forceModelPath === 'boolean')
      setForceModelPath(data.forceModelPath)
  }, [contextAttrs, audienceId])

  useEffect(() => {
    if (!ldClient) return
    const handler = () => {
      applyClientFlags()
      void refreshStatus()
    }
    ldClient.on('change', handler)
    return () => {
      ldClient.off('change', handler)
    }
  }, [ldClient, applyClientFlags, refreshStatus])

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

  const onTenantChange = (next: TenantId) => {
    if (next === tenant) return
    setTenant(next)
    setEvidence(null)
    setEvidenceSource(null)
    setSelectedAuditId(null)
    setLastAuth(null)
    setReplayId('')
  }

  const onAudienceChange = (id: AudienceId) => {
    if (id === audienceId) return
    setAudienceId(id)
    setEvidence(null)
    setEvidenceSource(null)
    setSelectedAuditId(null)
    setLastAuth(null)
    setReplayId('')
  }

  const pushControls = useCallback(
    async (patch: {
      breakPipe?: boolean
      inferenceMode?: 'live' | 'simulator'
      networkDelayMs?: number
      budgetUsd?: number | null
      forceModelPath?: boolean
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
          ...contextAttrs,
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
        if (data.evidence) {
          setEvidence(data.evidence as Evidence)
          setEvidenceSource('live')
          setSelectedAuditId(null)
        }
        if (data.audit) {
          const audit = data.audit as AuditRow
          setRows((prev) => [audit, ...prev.filter((r) => r.id !== audit.id)])
          setSelectedAuditId(audit.id)
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
      audienceId,
      breakPipe,
      contextAttrs,
      ldClient,
      refreshOps,
      refreshStatus,
      shadow,
    ],
  )

  const fireOne = async () => {
    const res = await fetch('/api/fixtures/one')
    const auth = (await res.json()) as AuthRequest
    applyAudienceToAuth(auth, audienceId)
    await authorize(auth)
  }

  const burst = async (n: number) => {
    const res = await fetch(`/api/fixtures/burst?n=${n}`)
    const list = (await res.json()) as AuthRequest[]
    for (const auth of list) {
      applyAudienceToAuth(auth, audienceId)
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
        ...contextAttrs,
        mcc: lastAuth.mcc,
        amount_cents: lastAuth.amountCents,
      }
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audienceId, context, auth: lastAuth }),
      })
      const data = await res.json()
      if (data.evidence) {
        setEvidence(data.evidence as Evidence)
        setEvidenceSource('live')
      }
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
    const t = encodeURIComponent(contextAttrs.tenant)
    const res = await fetch(
      `/api/audit/by-request/${encodeURIComponent(replayId.trim())}?tenant=${t}`,
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
          reason: 'Company isolation',
          error: body.error ?? 'Request id belongs to another company',
          requestId: replayId,
          hop: 'tenant-isolation',
        }),
      )
      setEvidenceSource('history')
      setView('decisions')
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
          error: 'No history row for that request id',
          requestId: replayId,
        }),
      )
      setEvidenceSource('history')
      setView('decisions')
      return
    }
    const row = (await res.json()) as AuditRow
    setEvidence(row.evidence)
    setEvidenceSource('history')
    setSelectedAuditId(row.id)
    setLastAuth(row.auth)
    setView('decisions')
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

  const flagStreamConnected = Boolean(
    ldClient && (ldReady || status.ldClientConfigured),
  )
  const engineLive =
    clientLive && status.decisionerLive && !status.circuitOpen

  const setupChips = [
    {
      label: flagStreamConnected
        ? 'flag stream · live'
        : 'flag stream · local',
      tip: flagStreamConnected
        ? 'Live flag stream connected. Flipping decisioner.live in the dashboard freezes the authorization engine without a reload.'
        : 'No live flag stream — use Emergency stop only. Set VITE_LD_CLIENT_ID to enable streaming kill from the dashboard.',
      tone: (flagStreamConnected ? 'live' : 'warn') as 'live' | 'warn',
    },
    {
      label: `policy · ${status.ldSdkConfigured ? 'live' : 'local'}`,
      tip: 'Server policy evaluation: live flags vs local fallbacks.',
      tone: (status.ldSdkConfigured ? 'live' : 'warn') as 'live' | 'warn',
    },
    {
      label: `AI · ${status.providerConfigured ? 'live ready' : 'practice only'}`,
      tip: 'Provider key present for live AI vs practice mode only.',
      tone: (status.providerConfigured ? 'live' : 'warn') as 'live' | 'warn',
    },
    {
      label: `alerts · ${status.webhookConfigured ? 'webhook on' : 'in-app only'}`,
      tip: 'Optional alert webhook for stop/cost signals; otherwise in-app only.',
      tone: (status.webhookConfigured ? 'live' : 'warn') as 'live' | 'warn',
    },
    {
      label: `config · ${status.aiConfigKey ?? 'mandate-decisioner'}`,
      tip: 'Decision config key used for prompt and model selection.',
      tone: (status.aiConfigEnabled ? 'live' : 'warn') as 'live' | 'warn',
    },
  ]

  const statusSummary = (
    <>
      <StatusChip tip="Company scope for history, replay, and isolation checks.">
        company · {contextAttrs.tenant}
      </StatusChip>
      <StatusChip
        tone={status.integrityValid === false ? 'frozen' : 'live'}
        tip="Whether this company’s sealed decision trail still checks out."
      >
        ledger · {status.integrityValid === false ? 'tampered' : 'intact'}
      </StatusChip>
      <StatusChip tip="Current path: quick rules vs AI review.">
        path · {status.route === 'fast' ? 'quick rules' : 'AI review'}
      </StatusChip>
      <StatusChip tip="Experiment group from the live flag.">
        experiment · {status.treatment}
      </StatusChip>
      <StatusChip
        tone={inferenceMode === 'simulator' ? 'warn' : 'live'}
        tip="Whether decisions use practice mode or live AI."
      >
        {inferenceMode === 'simulator' ? 'practice mode' : 'live AI'}
      </StatusChip>
      <StatusChip
        tone="warn"
        tip="Cumulative AI decision spend this browser session."
      >
        ${status.sessionSpendUsd.toFixed(4)} session
      </StatusChip>
    </>
  )

  return (
    <AppShell
      activeView={view}
      onViewChange={setView}
      live={engineLive}
      onRemediate={(kill) => void onRemediate(kill)}
      setupChips={setupChips}
      statusSummary={statusSummary}
    >
      {view === 'traffic' && (
        <ConfigurePane
          audienceId={audienceId}
          onAudienceChange={onAudienceChange}
          tenant={tenant}
          onTenantChange={onTenantChange}
          pending={pending}
          onFireOne={() => void fireOne()}
          onBurst={(n) => void burst(n)}
          onTamper={() => void tamper()}
          onCapture={() => void phaseCall('/api/capture')}
          onRefund={() => void phaseCall('/api/refund')}
          lastAuth={lastAuth}
          lastRequestId={evidence?.requestId ?? null}
          shadow={shadow}
          onShadowChange={setShadow}
          breakPipe={breakPipe}
          onBreakPipe={(v) => {
            setBreakPipe(v)
            void pushControls({ breakPipe: v })
          }}
          forceModelPath={forceModelPath}
          onForceModelPath={(v) => {
            setForceModelPath(v)
            void pushControls({ forceModelPath: v })
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
          budgetUsd={budgetUsd}
          onBudget={(v) => {
            setBudgetUsd(v)
            void pushControls({ budgetUsd: v })
          }}
          replayId={replayId}
          onReplayId={setReplayId}
          onReplay={() => void onReplay()}
          providerConfigured={Boolean(status.providerConfigured)}
        />
      )}

      {view === 'engine' && (
        <DecisionerPane
          live={engineLive}
          route={clientRoute ?? status.route}
          treatment={status.treatment}
          captureLive={status.captureLive}
          circuitOpen={status.circuitOpen}
          networkDelayMs={networkDelayMs}
          preview={{
            env: contextAttrs.env,
            riskTier: contextAttrs.risk_tier,
            mcc: contextAttrs.mcc,
            amountCents: contextAttrs.amount_cents,
          }}
          flagSource={status.flagSource ?? null}
          pathPolicy={status.pathPolicy ?? null}
          decisionConfigLabel={
            status.aiConfigModel
              ? `${status.aiConfigProvider ?? 'config'} · ${status.aiConfigModel}`
              : (status.aiConfigKey ?? null)
          }
          onRemediate={(kill) => void onRemediate(kill)}
        />
      )}

      {view === 'decisions' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <AuditFeed
            rows={rows}
            tenant={contextAttrs.tenant}
            selectedId={selectedAuditId}
            onSelect={(row) => {
              setEvidence(row.evidence)
              setEvidenceSource('history')
              setSelectedAuditId(row.id)
              setLastAuth(row.auth)
              if (row.evidence.requestId) setReplayId(row.evidence.requestId)
            }}
          />
          <EvidencePane
            evidence={evidence}
            evidenceSource={evidenceSource}
            paymentId={lastAuth?.authId ?? null}
          />
        </div>
      )}

      {view === 'experiments' && (
        <ExperimentPane
          experiment={experiment}
          pending={pending}
          onBurstExperiment={() => void burst(12)}
        />
      )}

      {view === 'trust' && (
        <TrustPane
          tenant={contextAttrs.tenant}
          integrityValid={status.integrityValid !== false}
          tipHash={status.tipHash ?? null}
          onBreakIntegrity={() => void onBreakIntegrity()}
          onRestoreIntegrity={() => void onRestoreIntegrity()}
        />
      )}

      {view === 'signals' && <OpsSignalsPane opsSignals={opsSignals} />}
    </AppShell>
  )
}
