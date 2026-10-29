// Screen layouts: tab screens with a large title that collapses on scroll + optional pull-to-refresh,
// and pushed screens with ‹ Back and a left-edge swipe that follows your finger (spec §5).
import { useRef, useState, type ReactNode } from 'react'
import { CaretLeft } from '@phosphor-icons/react'
import { popScreen } from '../lib/ui'

export function TabScreen({
  title,
  right,
  sticky,
  onRefresh,
  children,
}: {
  title: ReactNode
  right?: ReactNode
  /** shown under the small title once the large title has scrolled away */
  sticky?: ReactNode
  onRefresh?: () => Promise<void>
  children: ReactNode
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState<'no' | 'spin' | 'done'>('no')
  const startY = useRef<number | null>(null)
  const el = useRef<HTMLDivElement>(null)

  const onTouchStart = (e: React.TouchEvent) => {
    if (!onRefresh || (el.current?.scrollTop ?? 0) > 0) return
    startY.current = e.touches[0].clientY
  }
  const onTouchMove = (e: React.TouchEvent) => {
    if (startY.current == null) return
    const d = e.touches[0].clientY - startY.current
    setPull(d > 0 ? Math.min(90, d * 0.5) : 0)
  }
  const onTouchEnd = async () => {
    if (startY.current == null) return
    startY.current = null
    if (pull > 60 && onRefresh) {
      setRefreshing('spin')
      setPull(48)
      try {
        await onRefresh()
      } finally {
        setRefreshing('done')
        setTimeout(() => {
          setRefreshing('no')
          setPull(0)
        }, 700)
      }
    } else setPull(0)
  }

  return (
    <div className="tabscreen">
      <header className={`compact-head${collapsed ? ' compact-head--on' : ''}`} aria-hidden={!collapsed}>
        <span className="compact-title">{title}</span>
        {collapsed && sticky}
      </header>
      <div
        ref={el}
        className="scroll"
        onScroll={(e) => setCollapsed((e.target as HTMLElement).scrollTop > 44)}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {onRefresh && (
          <div className="ptr" style={{ height: pull }} aria-live="polite">
            {refreshing === 'spin' && <span className="spinner spinner--neon" aria-label="Refreshing" />}
            {refreshing === 'done' && <span className="ptr-done">✓ Up to date</span>}
          </div>
        )}
        <div className="large-head">
          <h1 className="large-title">{title}</h1>
          {right}
        </div>
        {children}
      </div>
    </div>
  )
}

export function PushedScreen({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  const [dx, setDx] = useState(0)
  const [leaving, setLeaving] = useState(false)
  const start = useRef<number | null>(null)

  const back = () => {
    setLeaving(true)
    setTimeout(popScreen, 220)
  }
  const onDown = (e: React.PointerEvent) => {
    if (e.clientX > 24) return
    start.current = e.clientX
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    if (start.current != null) setDx(Math.max(0, e.clientX - start.current))
  }
  const onUp = () => {
    if (start.current == null) return
    start.current = null
    if (dx > window.innerWidth * 0.33) back()
    else setDx(0)
  }

  return (
    <div
      className={`pushed${leaving ? ' pushed--leaving' : ''}`}
      style={{ transform: dx ? `translateX(${dx}px)` : undefined, transition: dx && start.current != null ? 'none' : undefined }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <header className="nav-bar">
        <button className="nav-back pressable" onClick={back} aria-label="Back">
          <CaretLeft size={22} weight="bold" aria-hidden />
          <span>Back</span>
        </button>
        <h1 className="nav-title">{title}</h1>
        <span className="nav-right">{right}</span>
      </header>
      <div className="scroll scroll--pushed">{children}</div>
    </div>
  )
}
