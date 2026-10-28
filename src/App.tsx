import { useState } from 'react'
import TabBar, { type Tab } from './components/TabBar'
import StatCardPreview from './components/StatCardPreview'
import './App.css'

// App shell only (initial commit). Real screens are built milestone by milestone —
// see GitHub Milestones M1–M13 and docs/SPEC.md §13.

const titles: Record<Tab, string> = {
  home: 'Today',
  fitness: 'Fitness',
  weight: 'Weight',
  settings: 'Settings',
}

const comingIn: Record<Tab, string> = {
  home: 'Home is built in M6.',
  fitness: 'Fitness is built in M8.',
  weight: 'Weight is built in M9.',
  settings: 'Settings is built in M10.',
}

export default function App() {
  const [tab, setTab] = useState<Tab>('home')

  return (
    <div className="app">
      <main className="screen" key={tab}>
        <header className="screen-header">
          <h1 className="large-title">{titles[tab]}</h1>
          {tab === 'home' && (
            <span className="streak" aria-label="Streak: 0 days">
              🔥 0
            </span>
          )}
        </header>

        {tab === 'home' && <StatCardPreview />}

        <p className="placeholder">{comingIn[tab]}</p>
      </main>

      <TabBar
        active={tab}
        onChange={setTab}
        onLog={() => alert('Food logging is built in M5.')}
      />
    </div>
  )
}
