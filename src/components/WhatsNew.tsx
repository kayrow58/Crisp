// "What's new": one short note about the latest change. Shows until the person taps ✕,
// then never again for them — remembered on their account, so it stays gone on every device.
import { ChartBar, X } from '@phosphor-icons/react'
import { Button } from './ui'
import { updateProfile, useStore } from '../lib/store'
import { pushScreen } from '../lib/ui'
import { Balance } from '../screens/Balance'

const NEWS = {
  id: 'balance-2026-11',
  title: 'New: Balance',
  text: "See where your weight is coming from. Each day, week and month shows how far over or under maintenance you ate, next to what your scale did — plus a gentle catch-up plan if a big day puts you behind. Find it on the Weight tab.",
  action: 'Take a look',
  open: () => pushScreen(<Balance />),
}

export function WhatsNew() {
  const profile = useStore((s) => s.profile)
  if (!profile?.onboarded || profile.seenNews?.includes(NEWS.id)) return null
  const dismiss = () => updateProfile({ seenNews: [...(profile.seenNews ?? []), NEWS.id] })
  return (
    <div className="card news" role="status">
      <button className="icon-btn news-x" onClick={dismiss} aria-label="Close">
        <X size={18} weight="bold" />
      </button>
      <span className="news-tag">
        <ChartBar size={14} weight="fill" aria-hidden /> What's new
      </span>
      <h3>{NEWS.title}</h3>
      <p>{NEWS.text}</p>
      <Button
        kind="secondary"
        className="news-go"
        onClick={NEWS.open}
      >
        {NEWS.action}
      </Button>
    </div>
  )
}
