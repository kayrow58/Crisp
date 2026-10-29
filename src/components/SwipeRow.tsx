// List row with swipe actions (left = Delete, right = ★ Favorite) and press-and-hold menu (spec §5).
import { useRef, useState, type ReactNode } from 'react'
import { Star, Trash } from '@phosphor-icons/react'
import { showOverlay } from '../lib/ui'

export interface MenuAction {
  label: string
  icon?: ReactNode
  destructive?: boolean
  run: () => void
}

export function ActionMenu({ title, actions }: { title: ReactNode; actions: MenuAction[] }) {
  const close = () => showOverlay(null)
  return (
    <div className="menu-wrap" onClick={close}>
      <div className="menu-preview card">{title}</div>
      <div className="menu" role="menu" onClick={(e) => e.stopPropagation()}>
        {actions.map((a) => (
          <button
            key={a.label}
            role="menuitem"
            className={`menu-item${a.destructive ? ' menu-item--danger' : ''}`}
            onClick={() => {
              close()
              a.run()
            }}
          >
            <span>{a.label}</span>
            {a.icon}
          </button>
        ))}
      </div>
    </div>
  )
}

export function SwipeRow({
  children,
  onTap,
  onDelete,
  onFavorite,
  favorite,
  menu,
  label,
}: {
  children: ReactNode
  onTap?: () => void
  onDelete?: () => void
  onFavorite?: () => void
  favorite?: boolean
  menu?: MenuAction[]
  label: string
}) {
  const [dx, setDx] = useState(0)
  const [dragging, setDragging] = useState(false)
  const start = useRef<{ x: number; y: number } | null>(null)
  const axis = useRef<'x' | 'y' | null>(null)
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null)
  const moved = useRef(false)
  const width = useRef(320)

  const openMenu = () => menu && showOverlay(<ActionMenu title={children} actions={menu} />)

  const onDown = (e: React.PointerEvent) => {
    start.current = { x: e.clientX, y: e.clientY }
    axis.current = null
    moved.current = false
    width.current = (e.currentTarget as HTMLElement).offsetWidth
    if (menu) hold.current = setTimeout(() => {
      moved.current = true
      start.current = null
      setDx(0)
      openMenu()
    }, 500)
  }
  const onMove = (e: React.PointerEvent) => {
    if (!start.current) return
    const ddx = e.clientX - start.current.x
    const ddy = e.clientY - start.current.y
    if (!axis.current && (Math.abs(ddx) > 8 || Math.abs(ddy) > 8)) {
      axis.current = Math.abs(ddx) > Math.abs(ddy) ? 'x' : 'y'
      if (hold.current) clearTimeout(hold.current)
      if (axis.current === 'x') (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    }
    if (axis.current === 'x') {
      moved.current = true
      setDragging(true)
      const limitRight = onFavorite ? 120 : 0
      const limitLeft = onDelete ? -width.current : 0
      setDx(Math.max(limitLeft, Math.min(limitRight, ddx)))
    }
  }
  const onUp = () => {
    if (hold.current) clearTimeout(hold.current)
    const wasTap = !moved.current && start.current
    start.current = null
    setDragging(false)
    if (wasTap) {
      setDx(0)
      onTap?.()
      return
    }
    if (dx < -width.current * 0.55 && onDelete) {
      setDx(-width.current)
      setTimeout(() => {
        onDelete()
        setDx(0)
      }, 180)
    } else if (dx < -60 && onDelete) setDx(-88)
    else if (dx > 80 && onFavorite) {
      onFavorite()
      setDx(0)
    } else setDx(0)
  }

  return (
    <div className="swipe">
      {onFavorite && (
        <div className="swipe-bg swipe-bg--fav" aria-hidden style={{ opacity: dx > 0 ? 1 : 0 }}>
          <Star size={22} weight={favorite ? 'fill' : 'regular'} />
        </div>
      )}
      {onDelete && (
        <button
          className="swipe-bg swipe-bg--del"
          style={{ opacity: dx < 0 ? 1 : 0 }}
          tabIndex={-1}
          aria-hidden
          onClick={() => {
            setDx(0)
            onDelete()
          }}
        >
          <Trash size={20} />
          <span>Delete</span>
        </button>
      )}
      <div
        className={`swipe-front${dragging ? '' : ' swipe-front--anim'}`}
        style={{ transform: `translateX(${dx}px)` }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onContextMenu={(e) => {
          e.preventDefault()
          openMenu()
        }}
      >
        <button className="swipe-content" aria-label={label} onClick={(e) => e.preventDefault()}>
          {children}
        </button>
        {menu && (
          <button className="sr-only" onClick={openMenu}>
            Actions for {label}
          </button>
        )}
      </div>
    </div>
  )
}
