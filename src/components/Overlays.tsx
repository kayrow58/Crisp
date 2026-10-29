// Renders everything that sits above the tabs: pushed screens, sheets, menus, alerts, toasts, offline pill.
import { useEffect, useState } from 'react'
import { ArrowsClockwise, Check, WifiSlash } from '@phosphor-icons/react'
import { answerAlert, hideToast, useUi } from '../lib/ui'
import { useStore } from '../lib/store'

export function Overlays() {
  const screens = useUi((s) => s.screens)
  const sheets = useUi((s) => s.sheets)
  const overlay = useUi((s) => s.overlay)
  const covered = screens.length > 0 || sheets.length > 0 || !!overlay
  // Keep the page behind sheets and pushed screens from scrolling.
  useEffect(() => {
    document.documentElement.classList.toggle('locked', covered)
  }, [covered])
  return (
    <>
      {screens.map((s) => (
        <div key={s.id} className="screen-layer">
          {s.node}
        </div>
      ))}
      {sheets.map((s) => (
        <div key={s.id}>{s.node}</div>
      ))}
      {overlay && <div key={overlay.id}>{overlay.node}</div>}
      <AlertHost />
      <ToastHost />
      <OfflinePill />
    </>
  )
}

function AlertHost() {
  const a = useUi((s) => s.alert)
  const [text, setText] = useState('')
  useEffect(() => setText(''), [a?.id])
  if (!a) return null
  const blocked = !!a.requireText && text.trim() !== a.requireText
  return (
    <div className="alert-wrap" role="alertdialog" aria-modal="true" aria-labelledby="alert-title">
      <div className="alert">
        <h2 id="alert-title" className="alert-title">
          {a.title}
        </h2>
        {a.message && <p className="alert-msg">{a.message}</p>}
        {a.requireText && (
          <input
            className="input alert-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`Type ${a.requireText}`}
            autoCapitalize="characters"
            aria-label={`Type ${a.requireText} to confirm`}
          />
        )}
        <div className="alert-actions">
          <button className="alert-btn" onClick={() => answerAlert(false)}>
            {a.cancel ?? 'Cancel'}
          </button>
          <button className={`alert-btn alert-btn--main${a.destructive ? ' alert-btn--danger' : ''}`} disabled={blocked} onClick={() => answerAlert(true)}>
            {a.confirm}
          </button>
        </div>
      </div>
    </div>
  )
}

function ToastHost() {
  const t = useUi((s) => s.toast)
  if (!t) return null
  return (
    <div className={`toast${t.tone === 'error' ? ' toast--error' : ''}`} role="status" key={t.id}>
      {t.tone !== 'error' && <Check size={18} weight="bold" className="toast-check" aria-hidden />}
      <span className="toast-text">{t.text}</span>
      {t.undo && (
        <button
          className="toast-undo"
          onClick={() => {
            t.undo?.()
            hideToast()
          }}
        >
          Undo
        </button>
      )}
    </div>
  )
}

/** "Offline" pill; after reconnecting it spins → ✓ → slides away (spec §7). */
function OfflinePill() {
  const online = useStore((s) => s.online)
  const synced = useStore((s) => s.syncedAfterOffline)
  const [phase, setPhase] = useState<'hidden' | 'offline' | 'syncing' | 'done'>('hidden')
  useEffect(() => {
    if (!online) setPhase('offline')
    else if (phase === 'offline') setPhase('syncing')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online])
  useEffect(() => {
    if (!synced || phase === 'hidden') return
    setPhase('done')
    const t = setTimeout(() => setPhase('hidden'), 1400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [synced])
  useEffect(() => {
    if (phase !== 'syncing') return
    const t = setTimeout(() => setPhase('hidden'), 8000)
    return () => clearTimeout(t)
  }, [phase])
  if (phase === 'hidden') return null
  return (
    <div className={`pill pill--${phase}`} role="status">
      {phase === 'offline' && (
        <>
          <WifiSlash size={16} aria-hidden /> Offline
        </>
      )}
      {phase === 'syncing' && (
        <>
          <ArrowsClockwise size={16} className="spin" aria-hidden /> Syncing
        </>
      )}
      {phase === 'done' && (
        <>
          <Check size={16} weight="bold" aria-hidden /> Synced
        </>
      )}
    </div>
  )
}
