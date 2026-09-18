import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { Icon, type IconName } from './Icon'

type BtnProps = {
  children?: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'default' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
  disabled?: boolean
  full?: boolean
  icon?: IconName
  type?: 'button' | 'submit'
  'aria-label'?: string
}

export function Button({
  children,
  onClick,
  variant = 'default',
  size = 'md',
  disabled,
  full,
  icon,
  type = 'button',
  ...rest
}: BtnProps) {
  const sizes =
    size === 'sm' ? 'h-9 px-3 text-[13px] gap-1.5 rounded-lg' : 'h-12 px-5 text-[15px] gap-2 rounded-xl'
  const variants = {
    primary: 'bg-paper text-ink hover:bg-white',
    default: 'bg-raised text-paper border border-line hover:border-line-strong',
    ghost: 'text-muted hover:text-paper',
    danger: 'text-danger border border-danger/25 hover:border-danger/50',
  }[variant]
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center font-medium transition-colors duration-150 disabled:opacity-35 disabled:pointer-events-none ${sizes} ${variants} ${full ? 'w-full' : ''}`}
      {...rest}
    >
      {icon && <Icon name={icon} size={size === 'sm' ? 15 : 17} />}
      {children}
    </button>
  )
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
  hint,
}: {
  label?: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoFocus?: boolean
  hint?: string
}) {
  return (
    <label className="block">
      {label && <span className="label mb-2 block text-muted">{label}</span>}
      <input
        value={value}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-paper transition-colors placeholder:text-muted/50 focus:border-line-strong focus:outline-none"
      />
      {hint && <span className="mt-2 block text-[13px] text-muted">{hint}</span>}
    </label>
  )
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <button aria-label="Close" className="absolute inset-0 bg-ink/80 backdrop-blur-sm" onClick={onClose} />
      <div className="safe-b relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-3xl border border-line bg-surface sm:max-w-md sm:rounded-2xl">
        <div className="flex items-center justify-between gap-4 px-5 pb-4 pt-5">
          <h2 className="display text-[22px] leading-none">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="-mr-1 p-1 text-muted transition-colors hover:text-paper">
            <Icon name="x" size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-5">{children}</div>
        {footer && <div className="border-t border-line bg-raised/40 px-5 py-4">{footer}</div>}
      </div>
    </div>
  )
}

export function Empty({
  icon,
  title,
  sub,
  action,
}: {
  icon: IconName
  title: string
  sub?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-line text-muted">
        <Icon name={icon} size={22} />
      </div>
      <div>
        <div className="display text-lg">{title}</div>
        {sub && <div className="mx-auto mt-1.5 max-w-xs text-[14px] leading-relaxed text-muted">{sub}</div>}
      </div>
      {action}
    </div>
  )
}

/** Small all-caps section heading. */
export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <span className="label text-muted">{children}</span>
      <span className="h-px flex-1 bg-line" />
      {right}
    </div>
  )
}
