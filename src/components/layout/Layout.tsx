import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  Boxes,
  ClipboardList,
  Coins,
  Factory,
  GitCompare,
  LayoutDashboard,
  Package,
  Plus,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react'
import { GlobalFilter } from '../filters/GlobalFilter'
import { AnalysisGroupBar } from '../filters/AnalysisGroupBar'
import { useData } from '../../context/DataContext'

const nav = [
  { to: '/', label: '대시보드', icon: LayoutDashboard, end: true, group: 'main' },
  { to: '/quality', label: '품질 분석', icon: Activity, group: '분석' },
  { to: '/inspectors', label: '검사자 분석', icon: Users, group: '분석' },
  { to: '/products', label: '품번 분석', icon: Package, group: '분석' },
  { to: '/molds', label: '금형 분석', icon: Boxes, group: '분석' },
  { to: '/equipment', label: '설비 분석', icon: Factory, group: '분석' },
  { to: '/costs', label: '비용 분석', icon: Coins, group: '분석' },
  { to: '/compare', label: '스마트 비교', icon: GitCompare, group: '인사이트' },
  { to: '/anomalies', label: '이상징후', icon: AlertTriangle, group: '인사이트' },
  { to: '/data', label: '검사 DATA', icon: ClipboardList, group: '인사이트' },
  { to: '/quality-data', label: '데이터 품질', icon: ShieldCheck, group: '인사이트' },
]

const groups = ['main', '분석', '인사이트'] as const

const pageTitles: Record<string, string> = {
  '/': '대시보드',
  '/quality': '품질 분석',
  '/inspectors': '검사자 분석',
  '/products': '품번 분석',
  '/molds': '금형 분석',
  '/equipment': '설비 분석',
  '/costs': '비용 분석',
  '/compare': '스마트 비교',
  '/data': '검사 DATA',
  '/manage': '데이터 업로드',
  '/quality-data': '데이터 품질',
  '/anomalies': '이상징후',
  '/ai': 'AI에게 질문하기',
}

const hideGlobalFilters = ['/manage', '/ai']

export function Layout() {
  const { analytics } = useData()
  const { pathname } = useLocation()
  const showFilters = !hideGlobalFilters.includes(pathname)
  const title =
    pageTitles[pathname] ??
    pageTitles[`/${pathname.split('/')[1]}`] ??
    '대시보드'
  const anomalyCount = analytics.anomalies.length

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="flex flex-col bg-sidebar text-white lg:sticky lg:top-0 lg:h-screen">
        <div className="flex h-16 items-center gap-3 px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent">
            <BarChart3 size={18} />
          </div>
          <div>
            <p className="text-[15px] font-semibold leading-tight">Qualitics</p>
            <p className="text-[11px] text-sidebar-muted">Quality Intelligence</p>
          </div>
        </div>

        <nav className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-2">
          {groups.map((group) => (
            <div key={group}>
              {group !== 'main' && (
                <p className="mb-1.5 px-3 text-[11px] font-medium tracking-wide text-sidebar-muted">
                  {group}
                </p>
              )}
              <div className="flex flex-col gap-0.5">
                {nav
                  .filter((item) => item.group === group)
                  .map((item) => {
                    const Icon = item.icon
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.end}
                        className={({ isActive }) =>
                          `flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                            isActive
                              ? 'bg-accent font-medium text-white'
                              : 'text-sidebar-muted hover:bg-white/5 hover:text-white'
                          }`
                        }
                      >
                        <Icon size={16} />
                        <span className="flex-1">{item.label}</span>
                        {item.to === '/anomalies' && anomalyCount > 0 && (
                          <span className="rounded-full bg-danger px-1.5 text-[10px] font-semibold text-white">
                            {anomalyCount}
                          </span>
                        )}
                      </NavLink>
                    )
                  })}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-3">
          <Link
            to="/manage"
            className="flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
          >
            <Plus size={16} />
            데이터 업로드
          </Link>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 border-b border-line/80 bg-white/90 backdrop-blur">
          <div className="flex h-16 items-center justify-between gap-4 px-5 lg:px-8">
            <p className="text-sm text-muted">
              Quality Intelligence
              <span className="mx-2 text-line">/</span>
              <span className="font-medium text-ink">{title}</span>
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-full p-2 text-muted hover:bg-canvas hover:text-ink"
                aria-label="알림"
              >
                <Bell size={16} />
              </button>
              <Link
                to="/ai"
                className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-600"
              >
                <Sparkles size={14} />
                AI에게 질문
              </Link>
            </div>
          </div>
        </header>

        <main className="space-y-4 px-5 py-6 lg:px-8">
          {showFilters && (
            <div className="grid gap-3 xl:grid-cols-2">
              <div className="card px-4 py-3">
                <p className="mb-2 text-xs font-medium text-muted">분석 그룹</p>
                <AnalysisGroupBar />
              </div>
              <GlobalFilter />
            </div>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  )
}
