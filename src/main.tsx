import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { asyncWithLDProvider } from 'launchdarkly-react-client-sdk'
import App from './App'
import './index.css'

/**
 * LaunchDarkly client-side ID — set VITE_LD_CLIENT_ID in .env
 * Create a client-side ID in your LD project settings.
 * Without it, the UI still runs against server local flag fallbacks;
 * streaming kill requires a real client-side ID.
 */
const clientSideId = import.meta.env.VITE_LD_CLIENT_ID as string | undefined

async function boot() {
  const root = createRoot(document.getElementById('root')!)

  if (!clientSideId) {
    console.warn(
      '[mandate] VITE_LD_CLIENT_ID missing — client SDK disabled. Server local flag fallbacks still apply.',
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
