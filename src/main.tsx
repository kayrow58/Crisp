import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { watchViewport } from './lib/viewport'
import './theme/global.css'

// Silent updates (spec §10): the new version installs in the background and is used the next
// time Crisp opens. No reload while it's open (a reload replayed the opening animation and
// re-asked for the microphone).
registerSW({ immediate: true, onNeedReload: () => undefined })
watchViewport()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
