import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowUpRight } from "lucide-react";
import { Panel } from "../common/Panel";
import { formatPercent } from "../../lib/format";

export type SplitTop10RowBase = {
  id: string;
  name: string;
  rank: number;
  value: number;
  sharePercent: number;
  href?: string;
};

export const SPLIT_TOP10_DEFAULT_BAR_COLOR = "#60a5fa";
const CHART_PHOTO_SIZE = 56;

function rankTone(rank: number): "gold" | "silver" | "bronze" | "muted" {
  if (rank === 1) return "gold";
  if (rank === 2) return "silver";
  if (rank === 3) return "bronze";
  return "muted";
}

function ChartAxisTick({
  x = 0,
  y = 0,
  index = 0,
  payload,
  rows,
  photoUrls,
  tiltLabels,
  xAxisAngle,
}: {
  x?: number;
  y?: number;
  index?: number;
  payload?: { value?: string | number };
  rows: SplitTop10RowBase[];
  photoUrls?: Record<string, string>;
  tiltLabels: boolean;
  xAxisAngle: number;
}) {
  const row = rows[index];
  const name = String(payload?.value ?? row?.name ?? "");
  const max = tiltLabels ? 14 : 6;
  const label = name.length > max ? `${name.slice(0, max)}…` : name;
  const url = photoUrls?.[name.trim()];

  if (tiltLabels) {
    return (
      <g transform={`translate(${x},${y})`}>
        <text
          x={0}
          y={0}
          dy={12}
          textAnchor="end"
          transform={`rotate(${xAxisAngle})`}
          fill="var(--color-muted)"
          fontSize={11}
          fontWeight={650}
        >
          {label}
        </text>
      </g>
    );
  }

  return (
    <g transform={`translate(${x},${y})`}>
      {url ? (
        <foreignObject
          x={-CHART_PHOTO_SIZE / 2}
          y={4}
          width={CHART_PHOTO_SIZE}
          height={CHART_PHOTO_SIZE}
        >
          <div className="dash-top10-axis-photo">
            <img src={url} alt="" title={name} referrerPolicy="no-referrer" />
          </div>
        </foreignObject>
      ) : null}
      <text
        x={0}
        y={url ? CHART_PHOTO_SIZE + 16 : 14}
        textAnchor="middle"
        fill="var(--color-muted)"
        fontSize={12}
        fontWeight={650}
      >
        {label}
      </text>
    </g>
  );
}

export function SplitTop10Panel<TRow extends SplitTop10RowBase>({
  title,
  description,
  actions,
  toolbar,
  rows,
  barColor = SPLIT_TOP10_DEFAULT_BAR_COLOR,
  getBarColor,
  valueLabel,
  formatValue,
  emptyMessage,
  detailKicker,
  detailMeta,
  rankMeta,
  showRankShare = true,
  metrics,
  activeId: controlledActiveId,
  onActiveChange,
  className = "",
  style,
  xAxisAngle = -38,
  photoUrls,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  toolbar?: ReactNode;
  rows: TRow[];
  barColor?: string;
  getBarColor?: (row: TRow, index: number) => string;
  valueLabel: string;
  formatValue: (value: number) => string;
  emptyMessage: string;
  detailKicker: string;
  detailMeta: (row: TRow) => string;
  rankMeta: (row: TRow) => string;
  /** 순위 목록에 전체 대비 비중을 한 번 더 붙일지 (기본 true) */
  showRankShare?: boolean;
  metrics: { label: string; value: (row: TRow) => string }[];
  activeId?: string | null;
  onActiveChange?: (id: string) => void;
  className?: string;
  style?: CSSProperties;
  /** X축 라벨 각도 (0이면 가로) */
  xAxisAngle?: number;
  /** 품번명 → 사진 URL (있을 때만 막대 아래 표시) */
  photoUrls?: Record<string, string>;
}) {
  const [internalActiveId, setInternalActiveId] = useState<string | null>(null);
  const isControlled = controlledActiveId !== undefined;
  const activeId = isControlled ? controlledActiveId : internalActiveId;

  const chartData = useMemo(
    () =>
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        rank: r.rank,
        value: r.value,
        sharePercent: r.sharePercent,
      })),
    [rows],
  );

  useEffect(() => {
    if (!rows.length) {
      if (!isControlled) setInternalActiveId(null);
      return;
    }
    if (!activeId || !rows.some((r) => r.id === activeId)) {
      const next = rows[0].id;
      if (isControlled) onActiveChange?.(next);
      else setInternalActiveId(next);
    }
  }, [rows, activeId, isControlled, onActiveChange]);

  function selectRow(id: string) {
    if (isControlled) onActiveChange?.(id);
    else setInternalActiveId(id);
  }

  const active = rows.find((r) => r.id === activeId) ?? rows[0] ?? null;
  const activeIndex = active
    ? rows.findIndex((r) => r.id === active.id)
    : -1;
  const accentColor =
    active && activeIndex >= 0 && getBarColor
      ? getBarColor(active, activeIndex)
      : barColor;
  const tiltLabels = xAxisAngle !== 0;
  const hasAnyPhoto = useMemo(
    () =>
      Boolean(
        photoUrls &&
          rows.some((r) => Boolean(photoUrls[r.name.trim()])),
      ),
    [photoUrls, rows],
  );
  const activePhotoUrl = active
    ? photoUrls?.[active.name.trim()]
    : undefined;
  const xAxisHeight = tiltLabels
    ? 62
    : hasAnyPhoto
      ? CHART_PHOTO_SIZE + 28
      : 36;
  const chartBottom = tiltLabels ? 64 : hasAnyPhoto ? 12 : 28;

  return (
    <Panel
      title={title}
      description={description}
      actions={actions}
      className={className}
      style={style}
    >
      {toolbar}

      {rows.length === 0 || !active ? (
        <div className="flex min-h-[200px] items-center justify-center text-sm text-muted">
          {emptyMessage}
        </div>
      ) : (
        <div className="dash-top10-split">
          <div
            className="dash-top10-chart dash-top10-chart--view detail-chart-frame"
            style={
              {
                ["--dash-top10-bar" as string]: accentColor,
              } as CSSProperties
            }
          >
            <ResponsiveContainer width="100%" height="100%" minHeight={520}>
              <BarChart
                data={chartData}
                margin={{
                  top: 36,
                  right: 16,
                  left: 8,
                  bottom: chartBottom,
                }}
              >
                <CartesianGrid
                  stroke="var(--color-line)"
                  vertical={false}
                  strokeDasharray="3 6"
                />
                <XAxis
                  dataKey="name"
                  interval={0}
                  angle={tiltLabels ? xAxisAngle : 0}
                  textAnchor={tiltLabels ? "end" : "middle"}
                  height={xAxisHeight}
                  tickMargin={tiltLabels ? 10 : hasAnyPhoto ? 0 : 8}
                  axisLine={false}
                  tickLine={false}
                  tick={(props) => (
                    <ChartAxisTick
                      x={typeof props.x === "number" ? props.x : Number(props.x) || 0}
                      y={typeof props.y === "number" ? props.y : Number(props.y) || 0}
                      index={typeof props.index === "number" ? props.index : 0}
                      payload={
                        props.payload
                          ? {
                              value: props.payload.value as
                                | string
                                | number
                                | undefined,
                            }
                          : undefined
                      }
                      rows={rows}
                      photoUrls={photoUrls}
                      tiltLabels={tiltLabels}
                      xAxisAngle={xAxisAngle}
                    />
                  )}
                />
                <YAxis
                  tick={{
                    fill: "var(--color-muted)",
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                  tickFormatter={(v) => formatValue(Number(v))}
                  width={72}
                  axisLine={false}
                  tickLine={false}
                />
                <Bar
                  dataKey="value"
                  name={valueLabel}
                  fill={barColor}
                  radius={[6, 6, 0, 0]}
                  maxBarSize={42}
                  isAnimationActive={false}
                  activeBar={false}
                  cursor="default"
                >
                  {rows.map((row, i) => (
                    <Cell
                      key={row.id}
                      fill={getBarColor ? getBarColor(row, i) : barColor}
                    />
                  ))}
                  <LabelList
                    dataKey="value"
                    position="top"
                    offset={8}
                    className="op-prod-top-bar-value"
                    formatter={(v) => formatValue(Number(v))}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <aside
            className="dash-top10-detail"
            aria-live="polite"
            style={
              {
                ["--dash-top10-bar" as string]: accentColor,
              } as CSSProperties
            }
          >
            <div className="dash-top10-detail-card" key={active.id}>
              <div className="dash-top10-detail-head">
                <span
                  className="op-prod-top-rank"
                  data-tone={rankTone(active.rank)}
                >
                  {active.rank}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="dash-top10-detail-kicker">{detailKicker}</p>
                  <div className="dash-top10-detail-name-row">
                    <h3 className="dash-top10-detail-name">{active.name}</h3>
                    {activePhotoUrl ? (
                      <div className="dash-top10-detail-photo">
                        <img
                          src={activePhotoUrl}
                          alt={active.name}
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    ) : null}
                  </div>
                  <p className="dash-top10-detail-meta">{detailMeta(active)}</p>
                </div>
                {active.href ? (
                  <Link
                    to={active.href}
                    className="dash-top10-detail-link dash-top10-detail-link--compact"
                    title="상세 보기"
                  >
                    상세
                    <ArrowUpRight size={14} aria-hidden />
                  </Link>
                ) : null}
              </div>

              <dl className="dash-top10-metrics dash-top10-metrics--compact">
                {metrics.map((m) => (
                  <div key={m.label}>
                    <dt>{m.label}</dt>
                    <dd className="num">{m.value(active)}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="dash-top10-rank-panel">
              <p className="dash-top10-rank-title">
                차트 순위 · {rows.length}개
              </p>
              <ul className="dash-top10-rank-list">
                {rows.map((row) => {
                  const isActive = row.id === active.id
                  return (
                    <li key={row.id}>
                      <button
                        type="button"
                        className="dash-top10-rank-item"
                        data-active={isActive ? "true" : undefined}
                        aria-pressed={isActive}
                        onClick={() => selectRow(row.id)}
                      >
                        <span
                          className="op-prod-top-rank dash-top10-rank-badge"
                          data-tone={rankTone(row.rank)}
                        >
                          {row.rank}
                        </span>
                        <span className="dash-top10-rank-label">
                          <strong>{row.name}</strong>
                          <span>
                            {rankMeta(row)}
                            {showRankShare
                              ? ` · ${formatPercent(row.sharePercent)}`
                              : null}
                          </span>
                        </span>
                        <span className="dash-top10-rank-trail">
                          {isActive ? (
                            <span className="dash-top10-rank-selected-chip">
                              선택
                            </span>
                          ) : null}
                          <span className="dash-top10-rank-value num">
                            {formatValue(row.value)}
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          </aside>
        </div>
      )}
    </Panel>
  );
}
