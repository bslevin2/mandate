import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { asyncWithLDProvider } from 'launchdarkly-react-client-sdk'
import App from './App'
import './index.css'

/**
 * Set VITE_LD_CLIENT_ID for streaming flag updates (see README Configuration).
 * Without it, the UI still runs against server local policy fallbacks.
 */
const clientSideId = import.meta.env.VITE_LD_CLIENT_ID as string | undefined

async function boot() {
  const root = createRoot(document.getElementById('root')!)

  if (!clientSideId) {
    console.warn(
      '[mandate] VITE_LD_CLIENT_ID missing — streaming flags off. Server local policy fallbacks still apply.',
    )
    root.render(
      <StrictMode>
        <App ldEnabled={false} />
      </StrictMode>,
    )
    return
  }

  const LDProvider = await asyncWithLDProvider({
    clientSideID: clientSideId,
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
      bootstrap: 'localStorage',
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
