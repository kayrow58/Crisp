// Basic building blocks matching docs/DESIGN.md.
import { useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import type { Icon } from '@phosphor-icons/react'
import { CaretRight } from '@phosphor-icons/react'

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { kind?: 'primary' | 'secondary' | 'destructive' | 'plain'; busy?: boolean }
export function Button({ kind = 'primary', busy, className = '', children, disabled, ...rest }: BtnProps) {
  return (
    <button className={`btn btn--${kind} pressable ${className}`} disabled={disabled || busy} aria-busy={busy || undefined} {...rest}>
      {busy ? <span className="spinner" aria-hidden /> : null}
      <span>{children}</span>
    </button>
  )
}

export const Card = ({ children, className = '', ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) => (
  <div className={`card ${className}`} {...rest}>
    {children}
  </div>
)

export const Group = ({ title, children, footer }: { title?: string; children: ReactNode; footer?: ReactNode }) => (
  <section className="group">
    {title && <h2 className="group-title">{title}</h2>}
    <div className="group-body">{children}</div>
    {footer && <p className="group-footer">{footer}</p>}
  </section>
)

export function Row({
  label,
  value,
  onClick,
  icon: IconCmp,
  chevron,
  danger,
  children,
  sub,
}: {
  label: ReactNode
  value?: ReactNode
  onClick?: () => void
  icon?: Icon
  chevron?: boolean
  danger?: boolean
  children?: ReactNode
  sub?: ReactNode
}) {
  const content = (
    <>
      {IconCmp && <IconCmp size={22} className="row-icon" aria-hidden />}
      <span className="row-main">
        <span className={`row-label${danger ? ' row-label--danger' : ''}`}>{label}</span>
        {sub && <span className="row-sub">{sub}</span>}
      </span>
      {value !== undefined && <span className="row-value">{value}</span>}
      {children}
      {(chevron ?? !!onClick) && !children && <CaretRight size={16} className="row-chevron" aria-hidden />}
    </>
  )
  return onClick ? (
    <button className="row row--tap" onClick={onClick}>
      {content}
    </button>
  ) : (
    <div className="row">{content}</div>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={o.value === value}
          className={`segment${o.value === value ? ' segment--on' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={checked} aria-label={label} className={`toggle${checked ? ' toggle--on' : ''}`} onClick={() => onChange(!checked)}>
      <span className="toggle-knob" />
    </button>
  )
}

type FieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: ReactNode; suffix?: string }
export function Field({ label, hint, suffix, className = '', ...rest }: FieldProps) {
  const id = useId()
  return (
    <label className={`field ${className}`} htmlFor={id}>
      <span className="field-label">{label}</span>
      <span className="field-box">
        <input id={id} className="input" {...rest} />
        {suffix && <span className="field-suffix">{suffix}</span>}
      </span>
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

export function EmptyState({ icon: IconCmp, text, action }: { icon: Icon; text: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <IconCmp size={56} weight="duotone" className="empty-icon" aria-hidden />
      <p className="empty-text">{text}</p>
      {action}
    </div>
  )
}

export const Shimmer = ({ h = 56, r = 14 }: { h?: number; r?: number }) => <div className="shimmer" style={{ height: h, borderRadius: r }} aria-hidden />

export const Note = ({ children, tone }: { children: ReactNode; tone?: 'warn' | 'error' }) => (
  <p className={`note${tone ? ` note--${tone}` : ''}`} role={tone === 'error' ? 'alert' : undefined}>
    {children}
  </p>
)

export const Spacer = ({ h = 16 }: { h?: number }) => <div style={{ height: h }} />
