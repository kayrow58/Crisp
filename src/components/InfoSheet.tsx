// Small "ⓘ" explanation sheet, so screens can stay clean.
import type { ReactNode } from 'react'
import { Sheet } from './Sheet'
import { Button } from './ui'
import { closeSheet } from '../lib/ui'

export function InfoSheet({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Sheet title={title}>
      <div className="info-sheet">{children}</div>
      <Button kind="secondary" onClick={() => closeSheet()} className="sheet-cta">
        Got it
      </Button>
    </Sheet>
  )
}
