# Mandate

**Mandate** is an automated **agent-spend authorization** control plane.

Autonomous agents initiate card-network-style spend (amount, MCC, merchant, agent id). Mandate **approves or declines** those authorizations at volume — not a human review queue. Ops steers who gets which policy, can kill the decisioner live, and keeps a tenant-scoped, tamper-evident audit of every decision.

## What you can do

- **Audiences** — env, risk, MCC, and amount change which policy path runs (fast rules vs model) and which experiment treatment you are in, with a visible **targeting reason**
- **Live kill** — freeze the decisioner without a deploy; the server fail-closes even if a client tries to bypass the UI
- **Evidence** — decision config, prompt preview, model, cost, latency, request id for every model-path call
- **Trust** — audit and replay scoped by tenant; hash-chained rows (`prevHash` → `rowHash`); cross-tenant replay denied
- **Ops** — experiment scoreboard, in-app signals (optional webhook), break vs failover on the inference hop

## Quick start

```bash
cp .env.example .env
npm install
npm run dev
```

- UI: http://localhost:5173  
- API: http://localhost:8787  

No keys required. The console runs on **local policy fallbacks** and a labeled **inference simulator**. Setup chips under the title show what is live vs local.

## How the console works

| Pane | Role |
|------|------|
| **Traffic** | Pick an audience (sandbox, prod, blocked MCC, QA dogfood), fire one auth or a burst, tamper, capture, refund |
| **Decisioner** | Live / frozen state, route (fast vs model), treatment, SLO latency, experiment scoreboard |
| **Evidence** | Last decision’s evidence; inference mode; remediate kill/restore; replay by request id; integrity break/restore; ops signals |
| **Audit** | Tenant-scoped feed; click a row to load evidence |

**Kill / remediate:** flip `decisioner.live` off in your flag dashboard (streams into the UI when a client-side ID is set), or click **Remediate kill** / `POST /api/remediate`. Both paths fail-closed without a page reload.

**Integrity:** each audit row is chained. **Break integrity** mutates a stored tip so the badge shows broken; **Restore chain** re-seals. Replay another tenant’s `request_id` returns 403.

## Architecture

```
UI (ops console)
  → POST /api/authorize
API (policy evaluation + optional live model)
  → approve | decline
  → tenant-scoped audit (hash chain) + ops signals
```

Three planes: **control** (who gets which policy / kill / experiment), **inference** (model path when routed there), **trust** (tenant isolation + tamper-evident audit). The server is authoritative — the UI cannot approve traffic the server has killed.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | API + UI together |
| `npm run dev:api` | API only |
| `npm run dev:web` | UI only |
| `npm run build` | Production UI build |

## Security notes

- Keep SDK and provider keys in `.env` (gitignored). Never put provider keys in `VITE_*`.
- Demo `panDemo` fields are **redacted** before model calls; Evidence shows raw vs sent.
- Provider keys never leave the server; the client only sees evidence and audit.

---

## Configuration (optional)

Wire these when you want **live** flag evaluation and **live** model completions. Without them, local fallbacks and the simulator still exercise the full console.

### Environment

See [`.env.example`](.env.example):

| Variable | Role |
|----------|------|
| `VITE_LD_CLIENT_ID` | Browser flag client — enables streaming kill when you flip flags in the dashboard |
| `LD_SDK_KEY` | Server flag + decision-config evaluation |
| `LD_AI_CONFIG_KEY` | Decision config key (default `mandate-decisioner`) |
| `OPENROUTER_API_KEY` | Live inference (server only) |
| `OPENROUTER_MODEL` / `OPENROUTER_FALLBACK_MODEL` | Primary and failover models |
| `OPS_WEBHOOK_URL` | Optional Slack (or similar) webhook on kill / cost spikes |

**LaunchDarkly** supplies live flags and decision configs. **OpenRouter** supplies live completions. Both are optional infrastructure for this product.

### Feature flags

Create these keys (types match the table):

| Flag key | Type | Default | Product behavior |
|----------|------|---------|------------------|
| `decisioner.live` | boolean | `true` | Release / remediate. Client listens; when `false` the Decisioner freezes. Server fail-closes. |
| `decisioner.route` | string | `fast` or `model` | Which policy path runs. Target by `env`, `risk_tier`, `mcc`, `amount_cents`. Individual: `email = qa@mandate.local`. |
| `decisioner.experiment` | string | `control` / `treatment` | Experiment treatments; scoreboard + events `auth_approved`, `auth_declined`, `auth_latency_ms`, `auth_cost_usd`. |
| `capture.live` | boolean | `true` | Optional — gates irreversible capture separately from authorize. |
| `spend.cap.cents` | number | e.g. `25000` | Optional — over-cap fast-path decline (no model). |

**Decision config** (AI Config product): key `mandate-decisioner`. System prompt should require JSON:

```json
{"decision":"approve"|"decline","reason":"..."}
```

Optional shadow: `{LD_AI_CONFIG_KEY}-shadow`.

**Context attributes:** `key`, `email`, `env`, `risk_tier`, `tenant`, `mcc`, `amount_cents`.

Suggested targeting:

- sandbox + low risk → `decisioner.route = fast`
- prod + high risk or high amount → `model`
- MCC 7995 → decline on fast-path
- `email = qa@mandate.local` → `treatment` experiment variation

### Inference modes

| Mode | Behavior |
|------|----------|
| **Simulator** (default without a provider key) | Deterministic JSON, `sim_*` request ids, labeled hop |
| **Live** | Real provider calls (`OPENROUTER_API_KEY`) |
| **Break (no fallback)** | Force primary failure; surface error |
| **Failover** | Primary fails, then fallback hop (`fallback-after:…`) |
