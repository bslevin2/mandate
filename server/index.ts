import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import {
  breakIntegrity,
  findByRequestId,
  findByRequestIdAny,
  listAudit,
  restoreIntegrity,
  sessionSpendUsd,
  verifyChain,
} from './audit.js'
import { burstFixtures, makeFixture } from './fixtures.js'
import {
  buildTargetingReason,
  circuitOpen,
  decide,
  getControls,
  setControls,
} from './decisioner.js'
import {
  evaluateAiConfig,
  evaluateFlags,
  getLocalKill,
  initLd,
  setLocalKill,
} from './ld.js'
import { hasOpenRouterKey, resolveInferenceMode } from './openrouter.js'
import { fireOpsWebhook, listOpsSignals } from './webhook.js'
import type { AudienceId, AuthRequest, LdContextAttrs } from './types.js'

const app = express()
const PORT = Number(process.env.PORT || 8787)

app.use(cors())
app.use(express.json({ limit: '1mb' }))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'mandate' })
})

app.get('/api/status', async (req, res) => {
  const context = (req.query.context
    ? JSON.parse(String(req.query.context))
    : {
        key: 'ops-sandbox',
        email: 'ops@sandbox.mandate.local',
        env: 'sandbox',
        risk_tier: 'low',
        tenant: 'acme',
        mcc: '5411',
        amount_cents: 1200,
      }) as LdContextAttrs

  const audienceId = (req.query.audienceId as AudienceId) || 'sandbox-low'
  const flags = await evaluateFlags(context)
  const controls = getControls()
  const inferenceMode = resolveInferenceMode(controls.inferenceMode)
  const ai = await evaluateAiConfig(
    context,
    JSON.stringify({ probe: true, mcc: context.mcc }),
  )
  const integrity = verifyChain()

  res.json({
    decisionerLive: flags.decisionerLive,
    route: flags.route,
    treatment: flags.treatment,
    captureLive: flags.captureLive,
    localKill: getLocalKill(),
    circuitOpen: circuitOpen(),
    sessionSpendUsd: sessionSpendUsd(context.tenant),
    auditCount: listAudit({ tenant: context.tenant }).length,
    breakPipe: controls.breakPipe,
    failoverDemo: controls.failoverDemo,
    networkDelayMs: controls.networkDelayMs,
    budgetUsd: controls.budgetUsd,
    flagSource: flags.source,
    spendCapCents: flags.spendCapCents,
    targetingReason: buildTargetingReason(
      audienceId,
      context,
      flags.route,
      flags.treatment,
      flags.source,
    ),
    inferenceMode,
    ldClientConfigured: Boolean(process.env.VITE_LD_CLIENT_ID?.trim()),
    ldSdkConfigured: Boolean(process.env.LD_SDK_KEY?.trim()),
    openRouterConfigured: hasOpenRouterKey(),
    webhookConfigured: Boolean(process.env.OPS_WEBHOOK_URL?.trim()),
    aiConfigKey: ai.key,
    aiConfigEnabled: ai.enabled,
    aiConfigSource: ai.source,
    promptPreview: ai.systemPrompt.slice(0, 280),
    streamingHint: process.env.VITE_LD_CLIENT_ID?.trim()
      ? 'LD client: live streaming on decisioner.live'
      : 'Remediate path (no reload) — add VITE_LD_CLIENT_ID for LD stream',
    tenant: context.tenant,
    integrityValid: integrity.valid,
    integrityBrokenAt: integrity.brokenAt,
    integrityLength: integrity.length,
    tipHash: integrity.tipHash,
  })
})

app.get('/api/audit', (req, res) => {
  const tenant = typeof req.query.tenant === 'string' ? req.query.tenant : undefined
  res.json(listAudit(tenant ? { tenant } : undefined))
})

app.get('/api/ops-signals', (_req, res) => {
  res.json(listOpsSignals(50))
})

app.get('/api/integrity', (_req, res) => {
  res.json(verifyChain())
})

/** Local demo only — mutates a stored row so the hash chain fails. */
app.post('/api/integrity/break', (_req, res) => {
  res.json(breakIntegrity())
})

/** Re-seal the chain from current payloads. */
app.post('/api/integrity/restore', (_req, res) => {
  res.json(restoreIntegrity())
})

app.get('/api/audit/by-request/:requestId', (req, res) => {
  const tenant =
    typeof req.query.tenant === 'string' ? req.query.tenant : undefined
  const any = findByRequestIdAny(req.params.requestId)
  if (!any) {
    res.status(404).json({ error: 'No audit row for that request id' })
    return
  }
  if (tenant && any.tenant !== tenant) {
    res.status(403).json({
      error: 'Tenant isolation — request id belongs to another tenant',
      tenant: any.tenant,
    })
    return
  }
  const row = findByRequestId(req.params.requestId, tenant)
  if (!row) {
    res.status(404).json({ error: 'No audit row for that request id' })
    return
  }
  res.json(row)
})

app.get('/api/fixtures/burst', (req, res) => {
  const n = Math.min(Number(req.query.n || 5), 25)
  res.json(burstFixtures(n))
})

app.get('/api/fixtures/one', (_req, res) => {
  res.json(makeFixture())
})

app.post('/api/controls', (req, res) => {
  const next = setControls({
    breakPipe: req.body?.breakPipe,
    failoverDemo: req.body?.failoverDemo,
    inferenceMode: req.body?.inferenceMode,
    networkDelayMs: req.body?.networkDelayMs,
    budgetUsd: req.body?.budgetUsd,
  })
  res.json(next)
})

/**
 * Remediate trigger — flips local kill latch (fail-closed) and fires ops webhook.
 * Prefer flipping decisioner.live in the LaunchDarkly dashboard so the client SDK streams;
 * this endpoint is the curl/browser path when the dashboard is unavailable.
 */
app.post('/api/remediate', async (req, res) => {
  const kill = req.body?.kill !== false
  setLocalKill(kill)
  const signal = await fireOpsWebhook({
    event: kill ? 'remediate_kill' : 'remediate_restore',
    source: 'api/remediate',
  })
  res.json({
    localKill: getLocalKill(),
    opsSignal: signal,
    hint: kill
      ? 'Local kill ON — server fail-closes. Also toggle decisioner.live off in LD for client streaming.'
      : 'Local kill OFF. Toggle decisioner.live on in LD to restore the UI decisioner.',
  })
})

app.post('/api/authorize', async (req, res) => {
  try {
    const audienceId = req.body.audienceId as AudienceId
    const context = req.body.context as LdContextAttrs
    const auth = req.body.auth as AuthRequest
    if (!audienceId || !context || !auth?.authId) {
      res.status(400).json({ error: 'audienceId, context, and auth.authId required' })
      return
    }

    const row = await decide({
      audienceId,
      context,
      auth,
      breakPipe: Boolean(req.body.breakPipe),
      tamper: Boolean(req.body.tamper),
      shadow: Boolean(req.body.shadow),
      phase: 'authorize',
    })

    const crossTenant = row.evidence.error === 'cross_tenant_denied'
    const failClosed =
      crossTenant ||
      (row.decision === 'decline' &&
        (req.body.tamper || !row.evidence.decisionerLive))

    res.status(failClosed ? 403 : 200).json({
      decision: row.decision,
      evidence: row.evidence,
      audit: row,
      sessionSpendUsd: sessionSpendUsd(context.tenant),
      integrity: verifyChain(),
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({
      error: err instanceof Error ? err.message : String(err),
    })
  }
})

app.post('/api/capture', async (req, res) => {
  try {
    const row = await decide({
      audienceId: req.body.audienceId,
      context: req.body.context,
      auth: req.body.auth,
      phase: 'capture',
    })
    res.json({
      decision: row.decision,
      evidence: row.evidence,
      audit: row,
      sessionSpendUsd: sessionSpendUsd(req.body.context?.tenant),
    })
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : String(err),
    })
  }
})

app.post('/api/refund', async (req, res) => {
  try {
    const row = await decide({
      audienceId: req.body.audienceId,
      context: req.body.context,
      auth: req.body.auth,
      phase: 'refund',
    })
    res.json({
      decision: row.decision,
      evidence: row.evidence,
      audit: row,
      sessionSpendUsd: sessionSpendUsd(req.body.context?.tenant),
    })
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : String(err),
    })
  }
})

await initLd()
app.listen(PORT, () => {
  console.log(`[mandate] API on http://localhost:${PORT}`)
})
