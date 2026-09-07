import type { ReactNode } from 'react'

const variants = {
  /** KPI 카드: ~200px 기준 자동 열 수 */
  kpi: 'grid-kpi',
  /** 필터·짧은 카드: ~280px */
  filters: 'grid-filters',
  /** 일반 패널/차트 2열: ~420px */
  split: 'grid-split',
  /** 카드 타일: ~320px */
  cards: 'grid-cards',
  /** 밀집 카드(품번 선택 등): ~220px */
  dense: 'grid-dense',
} as const

export type ResponsiveGridVariant = keyof typeof variants

export function ResponsiveGrid({
  variant = 'kpi',
  className = '',
  children,
}: {
  variant?: ResponsiveGridVariant
  className?: string
  children: ReactNode
}) {
  return (
    <div className={`${variants[variant]}${className ? ` ${className}` : ''}`}>
      {children}
    </div>
  )
}
