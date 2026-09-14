"use client"

import { useState, type ReactNode } from "react"
import { ArrowDownRight, ArrowUpRight, Download, Loader2, Minus, TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatInt } from "@/lib/report-labs/analytics"
import { exportSheetsToExcel, exportCsv, type ExportColumn } from "@/lib/report-labs/export"

// ── Card ─────────────────────────────────────────────────────────────────────

export function ReportCard({
  title,
  subtitle,
  actions,
  loading,
  error,
  children,
  className = "",
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
  loading?: boolean
  error?: string | null
  children?: ReactNode
  className?: string
}) {
  return (
    <section className={`border border-border rounded-lg bg-card p-4 flex flex-col gap-3 min-w-0 ${className}`}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-medium leading-tight">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          {actions}
        </div>
      </header>
      {error ? <ErrorNote message={error} /> : children}
    </section>
  )
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
      <TriangleAlert className="h-4 w-4 mt-0.5 shrink-0" />
      <span className="break-words">{message}</span>
    </div>
  )
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground py-6 text-center">{children}</p>
}

export function LoadingBlock({ height = 200 }: { height?: number }) {
  return (
    <div className="flex items-center justify-center text-muted-foreground" style={{ height }}>
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  )
}

// ── KPI tile ─────────────────────────────────────────────────────────────────

export function KpiTile({
  label,
  value,
  delta,
  hint,
  colorVar,
  icon,
  loading,
  format = formatInt,
}: {
  label: string
  value: number | null | undefined
  /** Percentage change vs prior period. null means "prior was zero". */
  delta?: number | null
  hint?: string
  colorVar?: string
  icon?: ReactNode
  loading?: boolean
  format?: (n: number | null | undefined) => string
}) {
  const showDelta = delta !== undefined
  const dir = delta == null ? "flat" : delta > 0.5 ? "up" : delta < -0.5 ? "down" : "flat"
  return (
    <div className="border border-border rounded-lg bg-card p-4 flex flex-col gap-1 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground truncate">{label}</span>
        {icon && (
          <span className="shrink-0" style={colorVar ? { color: `var(${colorVar})` } : undefined}>
            {icon}
          </span>
        )}
      </div>
      <div className="text-2xl font-semibold leading-tight min-h-8">
        {loading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : value == null ? "–" : format(value)}
      </div>
      {showDelta && !loading && (
        <div className="flex items-center gap-1 text-xs">
          {dir === "up" && <ArrowUpRight className="h-3.5 w-3.5" style={{ color: "var(--rl-good)" }} />}
          {dir === "down" && <ArrowDownRight className="h-3.5 w-3.5" style={{ color: "var(--rl-bad)" }} />}
          {dir === "flat" && <Minus className="h-3.5 w-3.5 text-muted-foreground" />}
          <span className="text-muted-foreground">
            {delta == null ? "new" : `${delta > 0 ? "+" : ""}${delta.toFixed(delta === 0 ? 0 : 1)}%`}
            {hint ? ` ${hint}` : ""}
          </span>
        </div>
      )}
      {!showDelta && hint && !loading && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  )
}

// ── Data table ───────────────────────────────────────────────────────────────

export interface TableColumn<T> {
  key: string
  header: string
  align?: "left" | "right"
  width?: string
  render?: (row: T) => ReactNode
  /** Value used for export; defaults to row[key]. */
  exportValue?: (row: T) => unknown
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  rows,
  rowKey,
  initialRows = 10,
  exportName,
  emptyMessage = "No data for this period.",
  dense,
}: {
  columns: TableColumn<T>[]
  rows: T[]
  rowKey: (row: T, i: number) => string
  initialRows?: number
  exportName?: string
  emptyMessage?: string
  dense?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? rows : rows.slice(0, initialRows)

  const doExport = async (kind: "xlsx" | "csv") => {
    const cols: ExportColumn[] = columns.map((c) => ({ key: c.key, header: c.header }))
    const data = rows.map((r) => {
      const out: Record<string, unknown> = {}
      for (const c of columns) out[c.key] = c.exportValue ? c.exportValue(r) : r[c.key]
      return out
    })
    const name = exportName ?? "report"
    if (kind === "xlsx") await exportSheetsToExcel([{ name: name.slice(0, 31), columns: cols, rows: data }], name)
    else exportCsv({ name, columns: cols, rows: data }, name)
  }

  if (rows.length === 0) return <EmptyNote>{emptyMessage}</EmptyNote>

  const pad = dense ? "px-3 py-1.5" : "px-3 py-2"
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={`${pad} font-medium ${c.align === "right" ? "text-right" : "text-left"}`}
                  style={c.width ? { width: c.width } : undefined}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, i) => (
              <tr key={rowKey(row, i)} className="border-t border-border hover:bg-muted/30">
                {columns.map((c) => (
                  <td key={c.key} className={`${pad} ${c.align === "right" ? "text-right tabular-nums" : "text-left"} align-middle`}>
                    {c.render ? c.render(row) : String(row[c.key] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {rows.length > initialRows && (
            <button className="underline underline-offset-2 hover:text-foreground" onClick={() => setExpanded((e) => !e)}>
              {expanded ? `Show first ${initialRows}` : `Show all ${rows.length}`}
            </button>
          )}
        </span>
        {exportName && (
          <span className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => doExport("xlsx")} title="Export to Excel">
              <Download className="h-3.5 w-3.5 mr-1" /> Excel
            </Button>
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => doExport("csv")} title="Export CSV">
              CSV
            </Button>
          </span>
        )}
      </div>
    </div>
  )
}

export function ShareBar({ value, max, colorVar = "--rl-seq" }: { value: number; max: number; colorVar?: string }) {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 0
  return (
    <div className="h-2 w-full rounded-sm bg-muted overflow-hidden">
      <div className="h-full rounded-sm" style={{ width: `${pct}%`, background: `var(${colorVar})` }} />
    </div>
  )
}
