// Bottom sheet with grab handle and drag-down-to-dismiss (spec §5).
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { closeSheet, confirm } from '../lib/ui'

export function Sheet({
  title,
  children,
  tall,
  dirty,
  onClose,
  left,
  right,
}: {
  title?: string
  children: ReactNode
  tall?: boolean
  /** ask before closing when the person has typed something */
  dirty?: boolean
  onClose?: () => void
  left?: ReactNode
  right?: ReactNode
}) {
  const [dy, setDy] = useState(0)
  const [closing, setClosing] = useState(false)
  const start = useRef<number | null>(null)
  const panel = useRef<HTMLDivElement>(null)

  const close = async () => {
    if (dirty && !(await confirm({ title: 'Discard changes?', message: "What you typed won't be saved.", confirm: 'Discard', cancel: 'Keep editing', destructive: true }))) {
      setDy(0)
      return
    }
    setClosing(true)
    setTimeout(() => {
      onClose?.()
      closeSheet()
    }, 220)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && void close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const onDown = (e: React.PointerEvent) => {
    start.current = e.clientY
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    if (start.current == null) return
    setDy(Math.max(0, e.clientY - start.current))
  }
  const onUp = () => {
    if (start.current == null) return
    start.current = null
    if (dy > 110) void close()
    else setDy(0)
  }

  return (
    <div className={`sheet-wrap${closing ? ' sheet-wrap--closing' : ''}`}>
      <div className="sheet-dim" onClick={() => void close()} aria-hidden />
      <div
        ref={panel}
        className={`sheet${tall ? ' sheet--tall' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ transform: dy ? `translateY(${dy}px)` : undefined, transition: dy && start.current != null ? 'none' : undefined }}
      >
        <div className="sheet-grab" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <span className="sheet-handle" aria-hidden />
          {(title || left || right) && (
            <div className="sheet-head">
              <span className="sheet-side">{left ?? <button className="link" onClick={() => void close()}>Cancel</button>}</span>
              <h2 className="sheet-title">{title}</h2>
              <span className="sheet-side sheet-side--right">{right}</span>
            </div>
          )}
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  )
}

/** Helper for sheets that close themselves after saving. */
export function finishSheet() {
  closeSheet()
}
