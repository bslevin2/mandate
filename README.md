# Mandate

**Mandate** is an automated **agent-spend authorization** control plane.

Autonomous agents initiate card-network-style spend (amount, MCC, merchant, agent id). Mandate **approves or declines** those authorizations at volume — not a human review queue. Ops steers who gets which policy, can kill the decisioner live, and keeps a tenant-scoped, tamper-evident audit of every decision.

## What you can do

- **Audiences** — env, risk, MCC, and amount change which policy path runs (fast rules vs model) and which experiment treatment you are in, with a visible **targeting reason**
- **Live kill** — freeze the decisioner without a deploy; the server fail-closes even if a client tries to bypass the UI
- **Evidence** — decision config, prompt preview, requested vs served model, provider, cost, latency, request id, generation lookup
- **Trust** — audit and replay scoped by tenant; hash-chained rows (`prevHash` → `rowHash`); cross-tenant replay denied
- **Ops** — experiment scoreboard, in-app signals (optional webhook), break vs app-hop vs provider failover on the inference hop

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

**Kill / remediate:** flip `decisioner.live` off in LaunchDarkly (streams into the UI when a client-side ID is set), fire that flag’s **generic trigger** (turn targeting off), or click **Emergency stop** / `POST /api/remediate`. Dashboard and trigger are the same flag. Emergency stop is a local latch. All paths fail-closed without a page reload.

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
| `OPENROUTER_MODEL` | Last-resort default model id if a policy list is empty (`openai/gpt-4.1-nano`). Not prepended from the decision config. |
| `OPENROUTER_FALLBACK_MODEL` | Model for **Retry on backup** (Mandate’s second HTTP); default `google/gemini-2.5-flash-lite` |
| `OPENROUTER_CHEAP_MODELS` | CSV for sandbox-low (`openai/gpt-4.1-nano,google/gemini-2.5-flash-lite`, sort by price) |
| `OPENROUTER_STRONG_MODELS` | CSV for prod-high (`openai/gpt-4.1-nano,google/gemini-2.5-flash-lite`, sort by latency) |
| `OPS_WEBHOOK_URL` | Optional Slack (or similar) webhook on kill / cost spikes |

Create the flags and decision config below in **LaunchDarkly**. Model **lists** come from audience policy / `OPENROUTER_*_MODELS`. Live completions are optional OpenAI-compatible HTTP (`OPENROUTER_*`); without a key the console uses the simulator. The completion API only chooses among the ids Mandate sends.

### Feature flags

Create these keys in LaunchDarkly (types match the table):

| Flag key | Type | Default | Product behavior |
|----------|------|---------|------------------|
| `decisioner.live` | boolean | `true` | Release / remediate. Client listens; when `false` the Decisioner freezes. Server fail-closes. |
| `decisioner.route` | string | `fast` or `model` | Which policy path runs. Target by `env`, `risk_tier`, `mcc`, `amount_cents`. Individual: `email = qa@mandate.local`. |
| `decisioner.experiment` | string | `control` / `treatment` | Experiment treatments; scoreboard + events `auth_approved`, `auth_declined`, `auth_latency_ms`, `auth_cost_usd`. |
| `capture.live` | boolean | `true` | Optional — gates irreversible capture separately from authorize. |
| `spend.cap.cents` | number | e.g. `25000` | Optional — over-cap fast-path decline (no model). |

**Decision config** (LaunchDarkly AI Config): key `mandate-decisioner`. System prompt should require JSON:

```json
{"decision":"approve"|"decline","reason":"..."}
```

The config’s model field is not used for routing. Optional shadow: `{LD_AI_CONFIG_KEY}-shadow`.

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
| **Live** | Real provider calls (`OPENROUTER_API_KEY`) with `models[]`, `provider` prefs, and a stable `user` (audience/actor) |
| **Break (fail-closed)** | Force primary failure; no `models[]`, no app hop |
| **App hop** | Primary fails, then Mandate makes a **second HTTP request**. This is not provider failover |
| **Allow provider failover** | Per-request `allow_fallbacks`. Off = strict endpoint |
| **Force model path** | Skip fast-path so a cheap audience still hits inference |

Audience → inference policy (when a model is called):

| Audience | Policy | Routing |
|----------|--------|---------|
| sandbox-low, QA dogfood | cheap-price | `gpt-4.1-nano` → Gemini 2.5 Flash Lite, sort price |
| prod-high | strong-latency | `gpt-4.1-nano` → Gemini 2.5 Flash Lite, sort latency + `data_collection=deny` |
| blocked MCC | no-model | fast-path decline, no completion |

Evidence shows requested models vs served model/provider, `usage.cost`, and request id. **Look up generation** calls `GET /api/v1/generation?id=` with the same inference key. **Key usage** calls `GET /api/v1/key` (never exposes the secret).

**Retry on backup** is Mandate’s second HTTP, not same-call `models[]`. The first request uses an invalid model id; the second uses `OPENROUTER_FALLBACK_MODEL`. Success is hop `app-hop`. If the second call fails: hop `exhausted`, fail-closed.

**Allow backup model on same call** only switches if the first id on that HTTP fails (outage). A healthy primary stays `primary`. To force it in the console: **Break** + **Allow backup** (Retry off) → one request to the other listed model, hop `model-fallback`. (An invalid model id cannot be used to trigger provider `models[]` — the API rejects the whole call.)

### Attempt labels (next submit only)

These are Mandate’s hop names in **Why this decision**, not provider jargon. Starting point unless noted: Advanced → Live AI, **Allow backup model** off, **Retry on backup** off, **Break** off, **Always use AI** off. Retry wins over Break (`app-hop`). Break + Allow backup (Retry off) is `model-fallback`.

| Attempt | Console steps |
|---|---|
| `simulator` | Practice mode. Sandbox · low risk + **Always use AI** (sandbox is otherwise quick rules). |
| `strict` | Live AI. Prod · high risk (or sandbox + Always use AI). Both backup boxes **off**. |
| `primary` | Same as `strict`, but **Allow backup model on same call** **on**. The first listed model actually served the answer. |
| `model-fallback` | **Break** + **Allow backup model** (Retry off). Primary is skipped; this request uses the other listed model. |
| `app-hop` | **Retry on backup AI call** on. Mandate makes a second HTTP call. |
| `break` | **Break the AI path** on, **Retry on backup** **off**. Fail-closed. |
| `fast-path` | Sandbox · low risk, Always use AI **off**. Or profile **Blocked MCC**. |
| `spend-cap` | Prod · high risk. Submit until amount is over the cap (local default $1000). |
| `budget` | Session budget USD `0`, then a payment that would otherwise call AI. |
| `tenant-isolation` | Replay a request id from **another** company. |
