"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts"
import { formatBucket, formatCompact, formatInt, type Granularity } from "@/lib/report-labs/analytics"

export interface Series {
  key: string
  label: string
  /** CSS var name, e.g. "--rl-1" */
  colorVar: string
}

type TipProps = Pick<TooltipProps<number, string>, "active" | "payload" | "label"> & { valueFormat?: (n: number) => string }

function TooltipBox({ active, payload, label, valueFormat = formatInt }: TipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border border-border bg-popover text-popover-foreground shadow-md px-3 py-2 text-xs">
      <div className="font-medium mb-1">{label}</div>
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="tabular-nums">{valueFormat(Number(p.value ?? 0))}</span>
        </div>
      ))}
    </div>
  )
}

export function ChartLegend({ series }: { series: Series[] }) {
  if (series.length < 2) return null
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {series.map((s) => (
        <span key={s.key} className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: `var(${s.colorVar})` }} />
          {s.label}
        </span>
      ))}
    </div>
  )
}

/** Multi-series line chart over time buckets. `data[i].date` is an ISO date. */
export function TrendChart({
  data,
  series,
  granularity,
  height = 240,
  valueFormat,
}: {
  data: Array<Record<string, number | string>>
  series: Series[]
  granularity: Granularity
  height?: number
  valueFormat?: (n: number) => string
}) {
  const rows = data.map((d) => ({ ...d, label: formatBucket(String(d.date), granularity) }))
  return (
    <div className="flex flex-col gap-2">
      <ChartLegend series={series} />
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => formatCompact(Number(v))} allowDecimals={false} />
          <Tooltip content={(p: TooltipProps<number, string>) => <TooltipBox {...p} valueFormat={valueFormat} />} cursor={{ stroke: "var(--rl-muted)", strokeWidth: 1 }} />
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={`var(${s.colorVar})`}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Horizontal ranked bars in a single hue (magnitude). */
export function RankedBars({
  data,
  colorVar = "--rl-seq",
  height,
  valueFormat = formatInt,
  labelWidth = 160,
}: {
  data: Array<{ label: string; value: number }>
  colorVar?: string
  height?: number
  valueFormat?: (n: number) => string
  labelWidth?: number
}) {
  const h = height ?? Math.max(120, data.length * 28 + 24)
  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, left: 4, bottom: 4 }} barCategoryGap={6}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => formatCompact(Number(v))} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="label"
          width={labelWidth}
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: string) => (v.length > 26 ? v.slice(0, 25) + "…" : v)}
        />
        <Tooltip content={(p: TooltipProps<number, string>) => <TooltipBox {...p} valueFormat={valueFormat} />} cursor={{ fill: "var(--rl-seq-soft)" }} />
        <Bar dataKey="value" name="Value" fill={`var(${colorVar})`} radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Vertical columns over ordered categories (e.g. months) in a single hue. */
export function ColumnChart({
  data,
  colorVar = "--rl-seq",
  height = 220,
  valueFormat = formatInt,
}: {
  data: Array<{ label: string; value: number }>
  colorVar?: string
  height?: number
  valueFormat?: (n: number) => string
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }} barCategoryGap="20%">
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={16} />
        <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => formatCompact(Number(v))} allowDecimals={false} />
        <Tooltip content={(p: TooltipProps<number, string>) => <TooltipBox {...p} valueFormat={valueFormat} />} cursor={{ fill: "var(--rl-seq-soft)" }} />
        <Bar dataKey="value" name="Value" fill={`var(${colorVar})`} radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  )
}
