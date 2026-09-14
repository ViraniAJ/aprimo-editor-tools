"use client"

import { useEffect, useState } from "react"
import { TrendingUp, CalendarPlus, PencilLine } from "lucide-react"
import { useReportParams } from "../components/report-context"
import { KpiTile, ReportCard, DataTable, LoadingBlock } from "../components/ui"
import { ColumnChart, TrendChart } from "../components/charts"
import { countRecords, runThrottled, dateLiteral, ALL_RECORDS_EXPRESSION } from "@/lib/report-labs/core"
import { formatInt } from "@/lib/report-labs/analytics"

interface MonthRow extends Record<string, unknown> {
  month: string
  label: string
  created: number
  cumulative: number
}

function monthStarts(n: number): Date[] {
  const out: Date[] = []
  const now = new Date()
  for (let i = n - 1; i >= 0; i--) out.push(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)))
  out.push(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)))
  return out
}

/** Records created per month for the last 12 months, with running total. Core API only. */
export function LibraryGrowth() {
  const p = useReportParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<MonthRow[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [recent, setRecent] = useState<{ created7: number; created30: number; modified30: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const starts = monthStarts(12)
        const now = new Date()
        const d7 = new Date(now); d7.setDate(now.getDate() - 7)
        const d30 = new Date(now); d30.setDate(now.getDate() - 30)
        const firstStart = starts[0]

        const tasks: Array<() => Promise<number>> = [
          () => countRecords(p.client, ALL_RECORDS_EXPRESSION),
          () => countRecords(p.client, `CreatedOn < ${dateLiteral(firstStart)}`),
          () => countRecords(p.client, `CreatedOn >= ${dateLiteral(d7)}`),
          () => countRecords(p.client, `CreatedOn >= ${dateLiteral(d30)}`),
          () => countRecords(p.client, `ModifiedOn >= ${dateLiteral(d30)}`),
          ...starts.slice(0, -1).map((s, i) => () => countRecords(p.client, `CreatedOn >= ${dateLiteral(s)} AND CreatedOn < ${dateLiteral(starts[i + 1])}`)),
        ]
        const results = await runThrottled(tasks, 4)
        if (cancelled) return
        const val = (i: number) => (results[i].status === "fulfilled" ? (results[i] as PromiseFulfilledResult<number>).value : 0)
        const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined
        if (failed && results.every((r) => r.status === "rejected")) throw failed.reason

        setTotal(val(0))
        setRecent({ created7: val(2), created30: val(3), modified30: val(4) })
        let cumulative = val(1)
        const out: MonthRow[] = starts.slice(0, -1).map((s, i) => {
          const created = val(5 + i)
          cumulative += created
          return {
            month: s.toISOString().slice(0, 10),
            label: s.toLocaleDateString(undefined, { month: "short", year: "2-digit", timeZone: "UTC" }),
            created,
            cumulative,
          }
        })
        setRows(out)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.environment, p.refreshToken])

  const last12 = rows.reduce((s, r) => s + r.created, 0)
  const avg = rows.length ? last12 / rows.length : 0

  return (
    <div className="flex flex-col gap-4">
      {error && <ReportCard title="Library growth" error={error} />}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label="Records today" value={total} icon={<TrendingUp className="h-4 w-4" />} colorVar="--rl-5" loading={loading} />
        <KpiTile label="Added last 12 months" value={loading ? null : last12} hint={total ? `${((last12 / total) * 100).toFixed(0)}% of library, ~${formatInt(avg)}/month` : undefined} icon={<CalendarPlus className="h-4 w-4" />} colorVar="--rl-1" loading={loading} />
        <KpiTile label="Created last 30 days" value={recent?.created30} hint={recent ? `${formatInt(recent.created7)} in last 7 days` : undefined} icon={<CalendarPlus className="h-4 w-4" />} colorVar="--rl-1" loading={loading} />
        <KpiTile label="Modified last 30 days" value={recent?.modified30} hint="any metadata or file change" icon={<PencilLine className="h-4 w-4" />} colorVar="--rl-3" loading={loading} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <ReportCard title="Records created per month" loading={loading}>
          {loading ? <LoadingBlock /> : <ColumnChart data={rows.map((r) => ({ label: r.label, value: r.created }))} colorVar="--rl-1" />}
        </ReportCard>
        <ReportCard title="Library size over time" subtitle="Running total at month end" loading={loading}>
          {loading ? <LoadingBlock /> : <TrendChart data={rows.map((r) => ({ date: r.month, cumulative: r.cumulative }))} granularity="month" height={220} series={[{ key: "cumulative", label: "Records", colorVar: "--rl-5" }]} />}
        </ReportCard>
      </div>
      <ReportCard title="Monthly detail" loading={loading}>
        <DataTable<MonthRow>
          rows={[...rows].reverse()}
          rowKey={(r) => r.month}
          initialRows={12}
          exportName="library-growth"
          dense
          columns={[
            { key: "label", header: "Month" },
            { key: "created", header: "Created", align: "right", render: (r) => formatInt(r.created) },
            { key: "cumulative", header: "Library size", align: "right", render: (r) => formatInt(r.cumulative) },
          ]}
        />
      </ReportCard>
    </div>
  )
}
