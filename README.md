# Mandate

**Mandate** is an automated **agent-spend authorization** control plane.

Autonomous agents initiate card-network-style spend (amount, MCC, merchant, agent id). Mandate **approves or declines** those authorizations at volume — not a human review queue. Ops steers who gets which policy, can kill the decisioner live, and keeps a tenant-scoped, tamper-evident audit of every decision.

## What you can do

- **Audiences** — env, risk, MCC, and amount change which policy path runs (fast rules vs model) and which experiment treatment you are in, with a visible **targeting reason**
- **Live kill** — freeze the decisioner without a deploy; the server fail-closes even if a client tries to bypass the UI
- **Evidence** — decision config, prompt preview, model, provider, latency, tokens, request id, optional evaluation
- **Trust** — audit and replay scoped by tenant; hash-chained rows (`prevHash` → `rowHash`); cross-tenant replay denied
- **Ops** — experiment scoreboard, in-app signals (optional webhook), fail-closed break on the model path

## Quick start

```bash
cp .env.example .env
npm install
npm run dev
```

- UI: http://localhost:5173  
- API: http://localhost:8787  

No keys required. The console runs on **local policy fallbacks** and a labeled **inference simulator**. Setup chips in the sidebar show what is live vs local.

## How the console works

Sidebar + canvas shell. Emergency stop/resume stay in the sidebar; each view is one ops surface:

| View | Role |
|------|------|
| **Traffic** | Pick company and risk profile, fire one auth or a burst, advanced inference/demo controls |
| **Engine** | Live / frozen state, route preview (fast vs model), treatment, SLO latency |
| **Decisions** | Tenant-scoped audit feed; click a row to load evidence |
| **Experiments** | Approve/decline scoreboard by experiment group |
| **Trust** | Ledger integrity break/restore; company isolation |
| **Signals** | Ops alerts for stop/cost events |

**Kill / remediate:** flip `decisioner.live` off in LaunchDarkly (streams into the UI when a client-side ID is set), fire that flag’s **generic trigger** (turn targeting off), or click **Emergency stop** / `POST /api/remediate`. Dashboard and trigger are the same flag. Emergency stop is a local latch. All paths fail-closed without a page reload.

**Integrity:** each audit row is chained. **Break seal** mutates a stored tip so the badge shows broken; **Restore ledger** re-seals. Replay another tenant’s `request_id` returns 403.

## Architecture

```
UI (ops console)
  → POST /api/authorize
API (policy evaluation + optional live model)
  → approve | decline
  → tenant-scoped audit (hash chain) + ops signals
```

Three planes: **control** (who gets which policy / kill / experiment / decision config), **inference** (model path when routed there), **trust** (tenant isolation + tamper-evident audit). The server is authoritative — the UI cannot approve traffic the server has killed.

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

Mandate talks to a **control-plane adapter** for flags and decision config. The checked-in adapter is **LaunchDarkly**; another adapter can implement the same evaluation interface.

### Environment

See [`.env.example`](.env.example):

| Variable | Role |
|----------|------|
| `VITE_LD_CLIENT_ID` | Browser flag client — enables streaming kill when you flip flags in the dashboard |
| `LD_SDK_KEY` | Server flag + decision-config evaluation |
| `LD_AI_CONFIG_KEY` | Decision config key (default `mandate-decisioner`) |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | Live inference (server only). At least one for Live AI. |
| `INFERENCE_DEFAULT_MODEL` | Last-resort model id for local decision-config fallback |
| `OPS_WEBHOOK_URL` | Optional Slack (or similar) webhook on kill / cost spikes |

Create the flags and decision config below in **LaunchDarkly** (or your adapter). Flags choose **quick rules vs model**. The decision config chooses **prompt, model, and provider** for the model path. Live completions invoke through the adapter so duration, tokens, and success/error land on the config’s Monitoring view. Without a provider key the console uses the simulator.

### Feature flags

Create these keys in LaunchDarkly (types match the table):

| Flag key | Type | Default | Product behavior |
|----------|------|---------|------------------|
| `decisioner.live` | boolean | `true` | Release / remediate. Client listens; when `false` the Decisioner freezes. Server fail-closes. |
| `decisioner.route` | string | `fast` or `model` | Which policy path runs. Target by `env`, `risk_tier`, `mcc`, `amount_cents`. Individual: `email = qa@mandate.local`. |
| `decisioner.experiment` | string | `control` / `treatment` | Experiment treatments; scoreboard + events `auth_approved`, `auth_declined`, `auth_latency_ms`, `auth_cost_usd`. |
| `capture.live` | boolean | `true` | Optional — gates irreversible capture separately from authorize. |
| `spend.cap.cents` | number | e.g. `25000` | Optional — over-cap fast-path decline (no model). |

**Decision config:** key `mandate-decisioner`. Set provider + model on each variation. System prompt should require JSON:

```json
{"decision":"approve"|"decline","reason":"..."}
```

Optional shadow: `{LD_AI_CONFIG_KEY}-shadow`.

**Context attributes:** `key`, `email`, `env`, `risk_tier`, `tenant`, `mcc`, `amount_cents`.

Suggested targeting:

- sandbox + low risk → `decisioner.route = fast`
- `env = prod` or high risk or high amount → `model`
- MCC 7995 → decline on fast-path
- individual: context key `qa-dogfood` → `decisioner.route = model` (does not match the sandbox+low rule)

### Inference modes

| Mode | Behavior |
|------|----------|
| **Simulator** (default without a provider key) | Deterministic JSON, `sim_*` request ids, labeled hop |
| **Live** | Completions through the control-plane decision config (provider key required) |
| **Break (fail-closed)** | Skip the model call; decline |
| **Always use AI** | Skip fast-path so a cheap audience still hits inference |

Audience → path (when a model would be called):

| Audience | Path |
|----------|------|
| sandbox-low | quick rules unless Always use AI |
| prod-high / QA dogfood | model review via decision config |
| blocked MCC | fast-path decline, no completion |

Evidence shows decision config, prompt preview, served model/provider, tokens, latency, and request id. Optional judge evaluation appears when the config has a judge attached.
