import { useCallback, useEffect, useState } from 'react'
import TabBar from './components/TabBar'
import { Overlays } from './components/Overlays'
import { Shimmer } from './components/ui'
import { Splash } from './components/Splash'
import { nudgeViewport } from './lib/viewport'
import { boot, today, track, useStore } from './lib/store'
import { getPrefs } from './lib/prefs'
import { getUi, setHomeDate, setTab, useUi } from './lib/ui'
import { hasRecoveryToken } from './lib/auth'
import { prefersReducedMotion } from './lib/format'
import { InstallGate, isStandalone } from './screens/InstallGate'
import { AuthScreen, ResetPassword } from './screens/Auth'
import { Onboarding } from './screens/Onboarding'
import { Home } from './screens/Home'
import { Fitness } from './screens/Fitness'
import { Weight } from './screens/Weight'
import { Settings } from './screens/Settings'
import { openLog } from './screens/Log'

// The Home Screen requirement is off in development builds (npm run dev) so the app can be previewed on a computer.
const REQUIRE_HOME_SCREEN = import.meta.env.PROD

let booted = false
let opened = false

export default function App() {
  const phase = useStore((s) => s.phase)
  const onboarded = useStore((s) => !!s.profile?.onboarded)
  // The opening animation plays once per launch (not again if the page reloads).
  const [splash, setSplash] = useState(() => !prefersReducedMotion() && !splashShown())
  const endSplash = useCallback(() => {
    setSplash(false)
    markSplashShown()
    setTimeout(nudgeViewport, 50)
  }, [])

  useEffect(() => {
    if (!booted) {
      booted = true
      void boot()
    }
  }, [])

  useEffect(() => {
    if (phase === 'ready' && !opened) {
      opened = true
      const p = getPrefs()
      track('app_open', { theme: p.theme, macroDisplay: p.macroDisplay, graph: p.graph })
    }
  }, [phase])

  if (hasRecoveryToken()) return <ResetPassword />
  if (REQUIRE_HOME_SCREEN && !isStandalone()) return <InstallGate />

  let body
  if (phase === 'loading')
    body = (
      <main className="boot">
        <Shimmer h={140} r={20} />
        <Shimmer />
        <Shimmer />
      </main>
    )
  else if (phase === 'signedOut') body = <AuthScreen />
  else if (!onboarded) body = <Onboarding />
  else body = <Main />

  return (
    <>
      {body}
      <Overlays />
      {splash && <Splash onDone={endSplash} />}
    </>
  )
}

function Main() {
  const tab = useUi((s) => s.tab)
  return (
    <div className="app">
      <div className="tab-content" key={tab}>
        {tab === 'home' && <Home />}
        {tab === 'fitness' && <Fitness />}
        {tab === 'weight' && <Weight />}
        {tab === 'settings' && <Settings />}
      </div>
      <TabBar
        active={tab}
        onChange={(t) => {
          if (t === 'home' && getUi().tab === 'home') setHomeDate(null)
          setTab(t)
        }}
        onLog={() => openLog(getUi().tab === 'home' ? getUi().homeDate ?? today() : today())}
      />
    </div>
  )
}

function splashShown() {
  try {
    return sessionStorage.getItem('crisp.splashShown') === '1'
  } catch {
    return false
  }
}
function markSplashShown() {
  try {
    sessionStorage.setItem('crisp.splashShown', '1')
  } catch {
    /* private mode */
  }
}
