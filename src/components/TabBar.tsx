import { House, Sneaker, Scales, GearSix, Plus } from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import './TabBar.css'

export type Tab = 'home' | 'fitness' | 'weight' | 'settings'

const left: { id: Tab; label: string; icon: Icon }[] = [
  { id: 'home', label: 'Home', icon: House },
  { id: 'fitness', label: 'Fitness', icon: Sneaker },
]
const right: { id: Tab; label: string; icon: Icon }[] = [
  { id: 'weight', label: 'Weight', icon: Scales },
  { id: 'settings', label: 'Settings', icon: GearSix },
]

type Props = {
  active: Tab
  onChange: (tab: Tab) => void
  onLog: () => void
}

// Home · Fitness · (+) · Weight · Settings (spec §4).
// Inactive = gray outline; active = solid neon (DESIGN.md · Icons).
export default function TabBar({ active, onChange, onLog }: Props) {
  const renderTab = ({ id, label, icon: IconCmp }: (typeof left)[number]) => {
    const isActive = id === active
    return (
      <button
        key={id}
        className={`tab pressable${isActive ? ' tab--active' : ''}`}
        onClick={() => onChange(id)}
        aria-current={isActive ? 'page' : undefined}
      >
        <IconCmp size={26} weight={isActive ? 'fill' : 'regular'} aria-hidden />
        <span className="tab-label">{label}</span>
      </button>
    )
  }

  return (
    <nav className="tabbar" aria-label="Main">
      {left.map(renderTab)}
      <button className="tab-plus pressable" onClick={onLog} aria-label="Log food">
        <Plus size={28} weight="bold" aria-hidden />
      </button>
      {right.map(renderTab)}
    </nav>
  )
}
