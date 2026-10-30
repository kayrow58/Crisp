// How to stop iPhone asking for the microphone every time Crisp is reopened.
// (Crisp can't change this setting itself — Apple only lets people do it in Settings.)
import { Microphone } from '@phosphor-icons/react'
import { InfoSheet } from './InfoSheet'
import { setPref } from '../lib/prefs'

const STEPS = ['Open the iPhone Settings app', 'Tap Apps → Safari', 'Tap Microphone', 'Choose Allow']

export function MicTipCard() {
  return (
    <div className="mic-tip" role="note">
      <Microphone size={20} weight="fill" className="mic-tip-icon" aria-hidden />
      <div className="mic-tip-body">
        <strong>Tired of “Allow microphone” every time?</strong>
        <span className="muted small">One-time fix: Settings → Apps → Safari → Microphone → Allow</span>
      </div>
      <button className="link small" onClick={() => setPref('micTipDone', true)}>
        Got it
      </button>
    </div>
  )
}

export function MicTipSheet() {
  return (
    <InfoSheet title="Microphone keeps asking?">
      <p>iPhone asks again each time Crisp is reopened. You can turn that off once:</p>
      <ol className="mic-steps">
        {STEPS.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      <p className="muted">Crisp can't change this for you — Apple only allows it in Settings. It's a one-time change.</p>
    </InfoSheet>
  )
}
