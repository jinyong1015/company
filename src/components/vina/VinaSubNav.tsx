import { NavLink } from 'react-router-dom'

const items = [
  { to: '/vina', label: 'VINA 분석', end: true },
  { to: '/vina/quality', label: '품질 분석', end: false },
  { to: '/vina/products', label: '품번 분석', end: false },
  { to: '/vina/inspectors', label: '검사자 분석', end: false },
  { to: '/vina/equipment', label: '설비 분석', end: false },
  { to: '/vina/costs', label: '비용 분석', end: false },
  { to: '/vina/compare', label: '스마트 비교', end: false },
  { to: '/vina/data', label: '검사 DATA', end: false },
  { to: '/vina/error-data', label: '오류 DATA', end: false },
  { to: '/vina/manage', label: '데이터 업로드', end: false },
] as const

export function VinaSubNav() {
  return (
    <nav
      aria-label="VINA 하위 메뉴"
      className="flex flex-wrap gap-2 rounded-2xl border border-line bg-surface p-2 shadow-sm"
    >
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            `rounded-full px-3.5 py-2 text-sm font-semibold transition ${
              isActive
                ? 'bg-accent text-white'
                : 'text-ink hover:bg-accent-soft hover:text-accent'
            }`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}
