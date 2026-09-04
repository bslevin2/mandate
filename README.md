# Mandate

Automated **agent-spend authorization** control plane. Inbound card-network-style auth requests (amount, MCC, merchant, agent) are **approved or declined** by a steered decisioner — not a human review queue.

Use this console to:

- Target **audiences** (env, risk, MCC, amount) that change policy **and** model route — with a visible **targeting reason**
- **Kill** the decisioner live (fail-closed) without a deploy
- Run inference through **OpenRouter** (Live) or a labeled **Simulator** (no key required)
- Inspect **evidence** (AI config, prompt preview, model, cost, latency, request ID) and a **tenant-scoped audit feed**
- Verify **trust**: tenant isolation on replay/authorize, and a **hash-chained** audit (`prevHash` → `rowHash`)
- Show **experiment scoreboard**, **ops signals** (integrations), **break** vs **failover**

## Quick start

```bash
cp .env.example .env
# optional: VITE_LD_CLIENT_ID, LD_SDK_KEY, OPENROUTER_API_KEY, OPS_WEBHOOK_URL
npm install
npm run dev
```

- UI: http://localhost:5173  
- API: http://localhost:8787  

Without keys the app defaults to **local flag fallbacks** + **inference simulator**. Setup chips under the title show what is keyed vs simulated. Switch Inference to **Live** after setting `OPENROUTER_API_KEY` for real provider calls.

## Create LaunchDarkly flags

In your LD project, create:

| Flag key | Type | Default | Notes |
|----------|------|---------|-------|
| `decisioner.live` | boolean | `true` | Release / remediate. Client SDK listens; when `false` the Decisioner pane freezes. Server also fail-closes. |
| `decisioner.route` | string | `fast` or `model` | Targets the route/policy **component**. Rules by `env`, `risk_tier`, `mcc`, `amount_cents`. Individual target `email = qa@mandate.local` for QA dogfood. |
| `decisioner.experiment` | string | `control` / `treatment` | Experiment treatments. Console scoreboard + `track` events `auth_approved`, `auth_declined`, `auth_latency_ms`, `auth_cost_usd`. |
| `capture.live` | boolean | `true` | Optional — gates the irreversible capture path separately from authorize. |
| `spend.cap.cents` | number | e.g. `25000` | Optional — over-cap fast-path decline (no model). |

**AI Config:** create config key `mandate-decisioner` (override with `LD_AI_CONFIG_KEY`). System prompt should ask for JSON:

```json
{"decision":"approve"|"decline","reason":"..."}
```

Optional shadow config: `{LD_AI_CONFIG_KEY}-shadow`.

**Context attributes** used by the app: `key`, `email`, `env`, `risk_tier`, `tenant`, `mcc`, `amount_cents`.

### Suggested targeting

- **sandbox + low risk** → `decisioner.route = fast`
- **prod + high risk** or **amount high** → `model`
- **MCC 7995** → decline via fast-path
- **email `qa@mandate.local`** → always `treatment` experiment variation

## OpenRouter

Set `OPENROUTER_API_KEY` (server only — never `VITE_*`).  
Default model: `OPENROUTER_MODEL`. Fallback: `OPENROUTER_FALLBACK_MODEL`.

**Inference modes (Evidence pane):**

| Mode | Behavior |
|------|----------|
| **Simulator** (default if no key) | Deterministic JSON + `sim_*` request IDs + fake tokens/cost. Hop labeled `simulator`. |
| **Live** | Real OpenRouter calls. Requires API key. |
| **Break (no fallback)** | Invalid primary model; surface error; no fallback hop. |
| **Failover demo** | Invalid primary, then fallback hop (`fallback-after:…`). |

## Kill / remediate

1. **Preferred with LD client ID:** turn `decisioner.live` **off** in the LaunchDarkly dashboard — Decisioner freezes without reload (streaming).
2. **Always works (no reload):** click **Remediate kill** or:

```bash
curl -X POST http://localhost:8787/api/remediate -H "content-type: application/json" -d "{\"kill\":true}"
```

Setup chips explain which path you are on. Ops signals always log the event (`webhook: skipped` if no `OPS_WEBHOOK_URL`).

## Tenants and audit integrity

Audiences map to tenants (`acme`, `globex`, …). The audit feed, session spend, and replay are **scoped to the active tenant**.

- Replay another tenant’s `request_id` → **403**
- Authorize with an `authId` owned by another tenant → **decline** (fail closed)
- Each audit row stores `prevHash` + `rowHash` (SHA-256 over canonical payload + previous tip)
- Topbar badge `integrity · valid|broken`; Evidence pane can **Break integrity** (local demo) and **Restore chain**

```bash
curl http://localhost:8787/api/integrity
```

## Optional ops webhook

Set `OPS_WEBHOOK_URL` (Slack incoming webhook or similar). Fired on remediate/kill and cost spikes. Even without it, **Ops signals** is always visible in-app.

## Architecture

```
UI (Vite/React + LD client SDK)
  → POST /api/authorize
API (Express + LD server SDK + AI Configs)
  → OpenRouter live OR labeled simulator
  → tenant-scoped audit.json (hash chain) + ops signals
```

Three planes: **control** (flags), **inference** (OpenRouter / simulator), **trust** (tenant isolation + tamper-evident audit). Server evaluation is the control plane — the UI cannot approve traffic the server has killed.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | API + UI together |
| `npm run dev:api` | API only |
| `npm run dev:web` | UI only |
| `npm run build` | Production UI build |

## Security notes

- Keep `LD_SDK_KEY` and `OPENROUTER_API_KEY` in `.env` (gitignored).
- Demo `panDemo` fields are **redacted** before model calls; Evidence shows raw vs sent.
- OpenRouter key never leaves the server; client only sees evidence + audit.
