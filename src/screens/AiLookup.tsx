// Small pieces of the ✦ AI screen: food names, and the private note shown when someone runs out of web lookups.
import { Button } from '../components/ui'
import { showOverlay } from '../lib/ui'
import type { AiFoodItem } from '../../shared/types'

export const aiName = (it: AiFoodItem) => (it.brand && !it.name.toLowerCase().startsWith(it.brand.toLowerCase()) ? `${it.brand} ${it.name}` : it.name)

/** A private note the admin set for one person, shown when they run out of AI lookups. */
export function showSecretNote(message: string) {
  showOverlay(<SecretNote message={message} />)
}

function SecretNote({ message }: { message: string }) {
  return (
    <div className="secret-wrap" onClick={() => showOverlay(null)}>
      <div className="secret-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="A note for you">
        <div className="secret-hearts" aria-hidden>
          <span>♥</span>
          <span>♥</span>
          <span>♥</span>
        </div>
        <p className="secret-msg">{message}</p>
        <Button onClick={() => showOverlay(null)}>Close</Button>
      </div>
    </div>
  )
}
