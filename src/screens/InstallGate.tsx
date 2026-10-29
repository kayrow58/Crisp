// Shown when Crisp is opened in Safari instead of from the Home Screen (spec §3.1). No skip link.
import { Export, PlusSquare } from '@phosphor-icons/react'

export const isStandalone = () =>
  (navigator as Navigator & { standalone?: boolean }).standalone === true || matchMedia('(display-mode: standalone)').matches

export function InstallGate() {
  return (
    <main className="gate">
      <img src="/icons/icon-192.png" alt="" className="gate-logo" width={96} height={96} />
      <h1 className="gate-title">Add Crisp to your Home Screen</h1>
      <ol className="gate-steps">
        <li>
          <span className="gate-num">1</span>
          <span>
            Tap <Export size={22} className="gate-icon" aria-label="Share" /> <strong>Share</strong> in Safari's toolbar
          </span>
        </li>
        <li>
          <span className="gate-num">2</span>
          <span>
            Tap <PlusSquare size={22} className="gate-icon" aria-hidden /> <strong>Add to Home Screen</strong>
          </span>
        </li>
        <li>
          <span className="gate-num">3</span>
          <span>
            Tap <strong>Add</strong>
          </span>
        </li>
      </ol>
      <p className="gate-foot">Then open Crisp from your Home Screen.</p>
      <div className="gate-arrow" aria-hidden>
        ↓
      </div>
    </main>
  )
}
