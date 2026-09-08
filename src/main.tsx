import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { asyncWithLDProvider } from 'launchdarkly-react-client-sdk'
import App from './App'
import './index.css'

/**
 * Set VITE_LD_CLIENT_ID for streaming flag updates (see README Configuration).
 * Without it, the UI still runs against server local policy fallbacks and
 * Emergency stop only — dashboard kill will not stream into the console.
 */
const clientSideId = import.meta.env.VITE_LD_CLIENT_ID as string | undefined

async function boot() {
  const root = createRoot(document.getElementById('root')!)

  if (!clientSideId?.trim()) {
    console.warn(
      '[mandate] VITE_LD_CLIENT_ID missing — no live flag stream. Use Emergency stop only; set VITE_LD_CLIENT_ID so decisioner.live streams from the dashboard.',
    )
    root.render(
      <StrictMode>
        <App ldEnabled={false} />
      </StrictMode>,
    )
    return
  }

  const LDProvider = await asyncWithLDProvider({
    clientSideID: clientSideId.trim(),
    context: {
      kind: 'user',
      key: 'ops-sandbox',
      email: 'ops@sandbox.mandate.local',
      env: 'sandbox',
      risk_tier: 'low',
      tenant: 'acme',
      mcc: '5411',
      amount_cents: 1200,
    },
    options: {
      // Streaming is the default; keep bootstrap for faster first paint.
      bootstrap: 'localStorage',
      streaming: true,
    },
  })

  root.render(
    <StrictMode>
      <LDProvider>
        <App ldEnabled />
      </LDProvider>
    </StrictMode>,
  )
}

void boot()
