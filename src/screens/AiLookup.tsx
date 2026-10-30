// Pieces of the ✦ AI lookup inside "Type or say it": the result card with "Looks good",
// and the private note shown when someone runs out of AI lookups.
import { ArrowSquareOut, Sparkle } from '@phosphor-icons/react'
import { Button } from '../components/ui'
import { sourceDomain } from '../lib/ai'
import { showOverlay } from '../lib/ui'
import { fmt, r0 } from '../lib/format'
import type { AiFoodItem } from '../../shared/types'

export const aiName = (it: AiFoodItem) => (it.brand && !it.name.toLowerCase().startsWith(it.brand.toLowerCase()) ? `${it.brand} ${it.name}` : it.name)

/** One food the AI found, waiting for "Looks good". */
export function AiItemCard({
  raw,
  items,
  pick,
  onPick,
  onLooksGood,
  onDismiss,
  busy,
}: {
  raw: string
  items: AiFoodItem[]
  pick: number
  onPick: (i: number) => void
  onLooksGood: () => void
  onDismiss: () => void
  busy: boolean
}) {
  const it = items[pick]
  return (
    <div className="ai-card">
      <span className="muted small">
        <Sparkle size={12} weight="fill" className="ai-star" aria-hidden /> “{raw}”
      </span>
      <div className="ai-card-top">
        <div>
          <strong className="ai-name">{aiName(it)}</strong>
          <span className="muted small">
            {it.serving}
            {it.servingGrams ? ` (${r0(it.servingGrams)} g)` : ''}
          </span>
        </div>
        <span className="ai-cal">
          {fmt(r0(it.cal))}
          <small> cal</small>
        </span>
      </div>
      <div className="plan-macros">
        <span>
          <b style={{ color: 'var(--protein)' }}>P</b> {fmt(it.p, 1)} g
        </span>
        <span>
          <b style={{ color: 'var(--carbs)' }}>C</b> {fmt(it.c, 1)} g
        </span>
        <span>
          <b style={{ color: 'var(--fat)' }}>F</b> {fmt(it.f, 1)} g
        </span>
      </div>
      <div className="ai-source">
        {it.estimate && <span className="ai-tag">Estimate</span>}
        {it.sourceUrl ? (
          <a href={it.sourceUrl} target="_blank" rel="noreferrer" className="link small">
            From {sourceDomain(it.sourceUrl)} <ArrowSquareOut size={12} aria-hidden />
          </a>
        ) : (
          <span className="muted small">No published nutrition found — best estimate</span>
        )}
      </div>
      {items.length > 1 && (
        <div className="alt-list" role="radiogroup" aria-label="Other options">
          {items.map((o, i) => (
            <button key={i} role="radio" aria-checked={i === pick} className={`bubble pressable${i === pick ? ' bubble--on' : ''}`} onClick={() => onPick(i)}>
              {o.name} · {r0(o.cal)}
            </button>
          ))}
        </div>
      )}
      <div className="quick-row">
        <Button onClick={onLooksGood} busy={busy}>
          Looks good
        </Button>
        <Button kind="secondary" onClick={onDismiss} disabled={busy}>
          Not right
        </Button>
      </div>
    </div>
  )
}

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
