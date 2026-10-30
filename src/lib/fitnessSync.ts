// Run the "Crisp Sync" Apple Shortcut right now, handing it this person's sync code.
// iPhone briefly switches to Shortcuts; when the person comes back, Crisp refreshes.
import { getState, track } from './store'
import { setPref } from './prefs'
import { toast } from './ui'

export const SHORTCUT_NAME = 'Crisp Sync'

export function runCrispSync(from: 'fitness' | 'connect') {
  const code = getState().profile?.fitnessCode
  if (!code) {
    toast('Sign out and back in to get your sync code', { tone: 'error' })
    return
  }
  setPref('shortcutConnected', true)
  track('fitness_sync_tapped', { from })
  window.location.href = `shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}&input=text&text=${encodeURIComponent(code)}`
}
