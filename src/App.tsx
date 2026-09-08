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
  inferencePolicy?: string | null
  requestedModels?: string[] | null
  allowProviderFailover?: boolean
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
    requestedModels: null,
    servedProvider: null,
    inferencePolicy: null,
    allowProviderFailover: null,
    inferenceUser: null,
    generationLookup: null,
    forceModelPath: null,
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
  const [tenant, setTenant] = useState<TenantId>('acme')
  const [pending, setPending] = useState(false)
  const [lastAuth, setLastAuth] = useState<AuthRequest | null>(null)
  const [evidence, setEvidence] = useState<Evidence | null>(null)
  const [evidenceSource, setEvidenceSource] = useState<
    'live' | 'history' | null
  >(null)
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
  const [allowProviderFailover, setAllowProviderFailover] = useState(true)
  const [forceModelPath, setForceModelPath] = useState(false)
  const [inferenceMode, setInferenceMode] = useState<'live' | 'simulator'>(
    'simulator',
  )
  const [networkDelayMs, setNetworkDelayMs] = useState(0)
  const [budgetUsd, setBudgetUsd] = useState<number | null>(null)
  const [shadow, setShadow] = useState(false)
  const [replayId, setReplayId] = useState('')
  const [generationPending, setGenerationPending] = useState(false)
  const [keyUsageLabel, setKeyUsageLabel] = useState<string | null>(null)
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
    if (typeof data.failoverDemo === 'boolean')
      setFailoverDemo(Boolean(data.failoverDemo))
    if (typeof data.allowProviderFailover === 'boolean')
      setAllowProviderFailover(data.allowProviderFailover)
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
    setLastAuth(null)
    setReplayId('')
  }

  const onAudienceChange = (id: AudienceId) => {
    if (id === audienceId) return
    setAudienceId(id)
    setEvidence(null)
    setEvidenceSource(null)
    setLastAuth(null)
    setReplayId('')
  }

  const pushControls = useCallback(
    async (patch: {
      breakPipe?: boolean
      failoverDemo?: boolean
      inferenceMode?: 'live' | 'simulator'
      networkDelayMs?: number
      budgetUsd?: number | null
      allowProviderFailover?: boolean
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
        }
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
      return
    }
    const row = (await res.json()) as AuditRow
    setEvidence(row.evidence)
    setEvidenceSource('history')
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

  const onLookupGeneration = async () => {
    const id = evidence?.requestId?.trim()
    if (!id) return
    setGenerationPending(true)
    try {
      const res = await fetch(
        `/api/inference/generation?id=${encodeURIComponent(id)}`,
      )
      const data = await res.json()
      setEvidence((prev) => {
        if (!prev) return prev
        const hop =
          typeof data.providerResponsesCount === 'number' &&
          data.providerResponsesCount > 1
            ? 'provider-failover'
            : prev.hop
        return {
          ...prev,
          hop,
          generationLookup: data,
          servedProvider: prev.servedProvider ?? data.providerName ?? null,
        }
      })
    } finally {
      setGenerationPending(false)
    }
  }

  const onLookupKey = async () => {
    const res = await fetch('/api/inference/key')
    const data = (await res.json()) as {
      label?: string | null
      usage?: number | null
      limitRemaining?: number | null
      error?: string | null
    }
    if (data.error) {
      setKeyUsageLabel(data.error)
      return
    }
    const usage =
      typeof data.usage === 'number' ? `$${data.usage.toFixed(4)} used` : 'usage n/a'
    const remaining =
      typeof data.limitRemaining === 'number'
        ? ` · ${data.limitRemaining.toFixed(4)} left`
        : ''
    setKeyUsageLabel(`${data.label ?? 'key'} · ${usage}${remaining}`)
  }

  const flagStreamConnected = Boolean(ldClient && (ldReady || status.ldClientConfigured))

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <div className="brand">
            <img
              className="brand-mark"
              src="/favicon.svg"
              width={28}
              height={28}
              alt="Mandate"
            />
            <h1>Mandate</h1>
          </div>
          <p className="brand-blurb">
            Approve or decline agent spend automatically, with a clear record
            for each company.
          </p>
        </div>
        <div className="badges">
          <div className="badge-row">
            <StatusChip tip="Company scope for history, replay, and isolation checks.">
              company · {contextAttrs.tenant}
            </StatusChip>
            <StatusChip
              tone={status.integrityValid === false ? 'frozen' : 'live'}
              tip="Whether this company’s sealed decision trail still checks out."
            >
              ledger · {status.integrityValid === false ? 'tampered' : 'intact'}
            </StatusChip>
            <StatusChip
              tone={status.decisionerLive ? 'live' : 'frozen'}
              tip="Server stop state. When stopped, new spend is declined even if the UI is bypassed."
            >
              server {status.decisionerLive ? 'accepting' : 'stopped'}
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
          </div>
        </div>
      </header>

      <div className="setup-strip badges">
        <p className="status-strip-label">
          Setup — what’s wired (read-only)
        </p>
        <div className="badge-row">
          <StatusChip
            tone={flagStreamConnected ? 'live' : 'warn'}
            tip={
              flagStreamConnected
                ? 'Live flag stream connected. Flipping decisioner.live in the dashboard freezes the authorization engine without a reload.'
                : 'No live flag stream — use Emergency stop only. Set VITE_LD_CLIENT_ID to enable streaming kill from the dashboard.'
            }
          >
            {flagStreamConnected
              ? 'Live flag stream · kill works from dashboard'
              : 'No live flag stream · use Emergency stop only'}
          </StatusChip>
          <StatusChip
            tone={status.ldSdkConfigured ? 'live' : 'warn'}
            tip="Server policy evaluation: live flags vs local fallbacks."
          >
            policy · {status.ldSdkConfigured ? 'live' : 'local'}
          </StatusChip>
          <StatusChip
            tone={status.openRouterConfigured ? 'live' : 'warn'}
            tip="Live AI key present vs practice mode only."
          >
            AI · {status.openRouterConfigured ? 'live ready' : 'practice only'}
          </StatusChip>
          <StatusChip
            tone={status.webhookConfigured ? 'live' : 'warn'}
            tip="Optional alert webhook for stop/cost signals; otherwise in-app only."
          >
            alerts · {status.webhookConfigured ? 'webhook on' : 'in-app only'}
          </StatusChip>
          <StatusChip
            tone={status.aiConfigEnabled ? 'live' : 'warn'}
            tip="Decision config key used for prompt and model selection."
          >
            decision config · {status.aiConfigKey ?? 'mandate-decisioner'}
          </StatusChip>
        </div>
      </div>

      <p className="zone-label">Before you submit</p>
      <div className="grid pair">
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
            if (v) setFailoverDemo(false)
            void pushControls({ breakPipe: v, failoverDemo: false })
          }}
          failoverDemo={failoverDemo}
          onFailoverDemo={(v) => {
            setFailoverDemo(v)
            if (v) setBreakPipe(false)
            void pushControls({ failoverDemo: v, breakPipe: false })
          }}
          allowProviderFailover={allowProviderFailover}
          onAllowProviderFailover={(v) => {
            setAllowProviderFailover(v)
            void pushControls({ allowProviderFailover: v })
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
          openRouterConfigured={Boolean(status.openRouterConfigured)}
          onLookupGeneration={() => void onLookupGeneration()}
          generationPending={generationPending}
          onLookupKey={() => void onLookupKey()}
          keyUsageLabel={keyUsageLabel}
          hasRequestId={Boolean(evidence?.requestId)}
        />
        <DecisionerPane
          live={clientLive && status.decisionerLive && !status.circuitOpen}
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
          inferencePolicy={status.inferencePolicy ?? null}
          requestedModels={status.requestedModels ?? null}
          onRemediate={(kill) => void onRemediate(kill)}
        />
      </div>

      <p className="zone-label">After decisions</p>
      <div className={evidence ? 'grid pair filled' : 'grid'}>
        <AuditFeed
          rows={rows}
          tenant={contextAttrs.tenant}
          onSelect={(row) => {
            setEvidence(row.evidence)
            setEvidenceSource('history')
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

      <div className="grid pair">
        <ExperimentPane
          experiment={experiment}
          pending={pending}
          onBurstExperiment={() => void burst(12)}
        />
        <TrustPane
          tenant={contextAttrs.tenant}
          integrityValid={status.integrityValid !== false}
          tipHash={status.tipHash ?? null}
          onBreakIntegrity={() => void onBreakIntegrity()}
          onRestoreIntegrity={() => void onRestoreIntegrity()}
        />
      </div>

      <div className="grid full">
        <OpsSignalsPane opsSignals={opsSignals} />
      </div>
    </div>
  )
}
