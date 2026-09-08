import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  Boxes,
  CalendarRange,
  ClipboardList,
  Coins,
  Factory,
  GitCompare,
  LayoutDashboard,
  MoreHorizontal,
  Moon,
  Package,
  Plus,
  Sun,
  Users,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { GlobalFilter } from '../filters/GlobalFilter'
import { AnalysisGroupBar } from '../filters/AnalysisGroupBar'
import { ResponsiveGrid } from '../common/ResponsiveGrid'
import { useData } from '../../context/DataContext'
import { AiChatbot } from '../ai/AiChatbot'
import {
  getInitialTheme,
  saveTheme,
  type ColorTheme,
} from '../../lib/theme'

const nav = [
  { to: '/', label: '대시보드', icon: LayoutDashboard, end: true, group: 'main' },
  { to: '/quality', label: '품질 분석', icon: Activity, group: '분석' },
  { to: '/inspectors', label: '검사자 분석', icon: Users, group: '분석' },
  { to: '/products', label: '품번 분석', icon: Package, group: '분석' },
  { to: '/molds', label: '금형 분석', icon: Boxes, group: '분석' },
  { to: '/equipment', label: '설비 분석', icon: Factory, group: '분석' },
  { to: '/costs', label: '비용 분석', icon: Coins, group: '분석' },
  { to: '/compare', label: '스마트 비교', icon: GitCompare, group: '인사이트' },
  { to: '/weekly-report', label: '주간업무 보고', icon: CalendarRange, group: '인사이트' },
  { to: '/anomalies', label: '이상징후', icon: AlertTriangle, group: '인사이트' },
  { to: '/data', label: '검사 DATA', icon: ClipboardList, group: '인사이트' },
]

const hideGlobalFilters = ['/manage', '/ai', '/weekly-report']

const primaryNav = nav.filter((item) => item.group !== '인사이트')
const insightNav = nav.filter((item) => item.group === '인사이트')

function isPathActive(pathname: string, to: string) {
  return to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(`${to}/`)
}

function TopNavigation({
  anomalyCount,
}: {
  anomalyCount: number
}) {
  const { pathname } = useLocation()
  const navigationRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [visibleCount, setVisibleCount] = useState(primaryNav.length)
  const [moreOpen, setMoreOpen] = useState(false)

  useEffect(() => {
    const navigation = navigationRef.current
    const measure = measureRef.current
    if (!navigation || !measure) return

    const updateVisibleCount = () => {
      const itemWidths = Array.from(
        measure.querySelectorAll<HTMLElement>('[data-measure-nav-item]'),
      ).map((item) => item.getBoundingClientRect().width)
      const moreWidth =
        measure
          .querySelector<HTMLElement>('[data-measure-more]')
          ?.getBoundingClientRect().width ?? 52
      const gap = 8
      const available = navigation.clientWidth
      let used = moreWidth
      let nextVisibleCount = 0

      for (const itemWidth of itemWidths) {
        const nextWidth = used + gap + itemWidth
        if (nextWidth > available) break
        used = nextWidth
        nextVisibleCount += 1
      }

      setVisibleCount(nextVisibleCount)
    }

    updateVisibleCount()
    const observer = new ResizeObserver(updateVisibleCount)
    observer.observe(navigation)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    setMoreOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!moreOpen) return

    const onPointerDown = (event: PointerEvent) => {
      if (!dropdownRef.current?.contains(event.target as Node)) {
        setMoreOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMoreOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [moreOpen])

  const visibleItems = primaryNav.slice(0, visibleCount)
  const overflowItems = [...primaryNav.slice(visibleCount), ...insightNav]
  const moreIsActive = overflowItems.some((item) =>
    isPathActive(pathname, item.to),
  )

  const chipClass = (isActive: boolean) =>
    `inline-flex h-11 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold transition-all duration-200 ${
      isActive
        ? 'border-accent bg-accent text-white shadow-[0_7px_18px_rgba(59,130,246,0.3)]'
        : 'border-line bg-surface text-ink shadow-sm hover:-translate-y-0.5 hover:border-accent/40 hover:bg-accent-soft hover:text-accent'
    }`

  const renderChipContent = (
    item: (typeof nav)[number],
    iconSize = 17,
    inDropdown = false,
  ) => {
    const Icon = item.icon
    return (
      <>
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
            inDropdown
              ? 'bg-accent-soft text-accent'
              : 'bg-accent-soft text-accent'
          }`}
        >
          <Icon size={iconSize} aria-hidden="true" />
        </span>
        <span>{item.label}</span>
        {item.to === '/anomalies' && anomalyCount > 0 && (
          <span className="rounded-full bg-danger px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
            {anomalyCount}
          </span>
        )}
      </>
    )
  }

  return (
    <nav
      aria-label="주 메뉴"
      className="top-nav-shell relative min-w-0 rounded-[1.6rem] p-2"
    >
      <div ref={navigationRef} className="flex min-w-0 items-center gap-2">
        {visibleItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => chipClass(isActive)}
          >
            {renderChipContent(item)}
          </NavLink>
        ))}

        <div ref={dropdownRef} className="relative shrink-0">
          <button
            type="button"
            className={chipClass(moreIsActive)}
            aria-label="더 많은 메뉴"
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((open) => !open)}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-accent">
              <MoreHorizontal size={20} aria-hidden="true" />
            </span>
            <span className="hidden sm:inline">더보기</span>
          </button>

          {moreOpen && (
            <div
              role="menu"
              className="absolute right-0 top-[calc(100%+0.6rem)] z-50 w-56 overflow-hidden rounded-2xl border border-line bg-surface p-2 shadow-[0_18px_48px_rgba(15,23,42,0.18)]"
            >
              <p className="px-3 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                {visibleCount < primaryNav.length ? '메뉴 · Insight' : 'Insight'}
              </p>
              {overflowItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  role="menuitem"
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                      isActive
                        ? 'bg-accent-soft font-semibold text-accent'
                        : 'text-ink hover:bg-canvas'
                    }`
                  }
                >
                  {renderChipContent(item, 16, true)}
                </NavLink>
              ))}
            </div>
          )}
        </div>
      </div>

      <div
        ref={measureRef}
        aria-hidden="true"
        className="pointer-events-none fixed -left-[9999px] top-0 flex invisible items-center gap-2"
      >
        {primaryNav.map((item) => (
          <span
            key={item.to}
            data-measure-nav-item
            className={chipClass(false)}
          >
            {renderChipContent(item)}
          </span>
        ))}
        <span data-measure-more className={chipClass(false)}>
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-accent">
            <MoreHorizontal size={20} />
          </span>
          <span className="hidden sm:inline">더보기</span>
        </span>
      </div>
    </nav>
  )
}

export function Layout() {
  const { analytics } = useData()
  const { pathname } = useLocation()
  const [theme, setTheme] = useState<ColorTheme>(() => getInitialTheme())
  const showFilters = !hideGlobalFilters.includes(pathname)
  const anomalyCount = analytics.anomalies.length

  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light'
    setTheme(nextTheme)
    saveTheme(nextTheme)
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 shadow-sm backdrop-blur">
        <div className="content-shell px-4 py-3 sm:px-5 lg:px-8">
          <div className="flex min-h-[68px] items-center gap-4">
            <Link to="/" className="flex shrink-0 items-center gap-2.5">
              <img
                src="/hyundai-logo.png"
                alt="Hyundai Corporation"
                className="h-10 w-28 shrink-0 object-contain"
              />
              <span className="hidden min-w-0 xl:block">
                <span className="block truncate text-[15px] font-semibold leading-tight text-ink">
                  Hyundacorp
                </span>
                <span className="block text-[11px] text-muted">
                  검사 DATA 분석
                </span>
              </span>
            </Link>

            <div className="min-w-0 flex-1">
              <TopNavigation anomalyCount={anomalyCount} />
            </div>

            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              <Link
                to="/manage"
                className="inline-flex h-11 items-center gap-2 rounded-full border border-line bg-surface px-3.5 text-sm font-medium text-ink shadow-sm transition hover:border-accent/40 hover:bg-accent-soft"
              >
                <Plus size={16} />
                <span className="hidden md:inline">데이터 업로드</span>
              </Link>
              <button
                type="button"
                onClick={toggleTheme}
                className="inline-flex h-11 items-center gap-2 rounded-full border border-line bg-surface px-3.5 text-sm font-medium text-ink shadow-sm transition hover:border-accent/40 hover:bg-accent-soft"
                aria-label={
                  theme === 'light' ? '다크 모드로 전환' : '라이트 모드로 전환'
                }
                title={
                  theme === 'light' ? '다크 모드로 전환' : '라이트 모드로 전환'
                }
              >
                {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
                <span className="hidden sm:inline">
                  {theme === 'light' ? '다크 모드' : '라이트 모드'}
                </span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="content-shell space-y-4 px-4 py-5 sm:px-5 sm:py-6 lg:px-8">
        {showFilters && (
          <ResponsiveGrid variant="filters">
            <div className="card px-4 py-3">
              <p className="mb-2 text-xs font-medium text-muted">분석 그룹</p>
              <AnalysisGroupBar />
            </div>
            <GlobalFilter />
          </ResponsiveGrid>
        )}
        <Outlet />
      </main>
      <AiChatbot />
    </div>
  )
}
