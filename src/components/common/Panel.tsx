import type { CSSProperties, ReactNode } from 'react'

export function Panel({
  title,
  description,
  actions,
  children,
  className = '',
  bodyClassName = '',
  style,
}: {
  title?: string
  description?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
  style?: CSSProperties
}) {
  return (
    <section className={`card min-w-0 ${className}`} style={style}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
          <div className="min-w-0">
            {title ? <h2 className="text-base font-bold tracking-tight text-ink">{title}</h2> : null}
            {description ? <p className="mt-1 text-[13px] font-medium leading-snug text-muted">{description}</p> : null}
          </div>
          {actions}
        </div>
      )}
      <div className={`min-w-0 p-5 ${bodyClassName}`}>{children}</div>
    </section>
  )
}
