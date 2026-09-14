"use client"

import { useEffect, useState } from "react"
import { Clock, Archive } from "lucide-react"
import { useReportParams } from "../components/report-context"
import { KpiTile, ReportCard, DataTable, LoadingBlock } from "../components/ui"
import { ColumnChart } from "../components/charts"
import { RecordCell } from "../components/record-cell"
import { countRecords, runThrottled, dateLiteral, searchRecordCards, type RecordCard } from "@/lib/report-labs/core"
import { formatInt } from "@/lib/report-labs/analytics"

const BUCKETS: Array<{ label: string; fromDays: number; toDays: number | null }> = [
  { label: "< 30 days", fromDays: 0, toDays: 30 },
  { label: "30–90 days", fromDays: 30, toDays: 90 },
  { label: "3–6 months", fromDays: 90, toDays: 180 },
  { label: "6–12 months", fromDays: 180, toDays: 365 },
  { label: "1–2 years", fromDays: 365, toDays: 730 },
  { label: "2–3 years", fromDays: 730, toDays: 1095 },
  { label: "> 3 years", fromDays: 1095, toDays: null },
]

interface StaleRow extends Record<string, unknown> {
  id: string
  title: string
  contentType: string
  modifiedOn: string
  card: RecordCard
}

/** Age distribution by last modification, and the oldest untouched records. Core API only. */
export function ContentFreshness() {
  const p = useReportParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [buckets, setBuckets] = useState<Array<{ label: string; value: number }>>([])
  const [total, setTotal] = useState(0)
  const [stale, setStale] = useState<StaleRow[]>([])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const now = new Date()
        const daysAgo = (d: number) => {
          const x = new Date(now)
          x.setDate(now.getDate() - d)
          return x
        }
        const expr = (b: (typeof BUCKETS)[number]) => {
          const parts = [`ModifiedOn <= ${dateLiteral(daysAgo(b.fromDays))}`]
          if (b.toDays != null) parts.push(`ModifiedOn > ${dateLiteral(daysAgo(b.toDays))}`)
          return parts.join(" AND ")
        }
        const results = await runThrottled(BUCKETS.map((b) => () => countRecords(p.client, expr(b))), 4)
        if (cancelled) return
        if (results.every((r) => r.status === "rejected")) throw (results[0] as PromiseRejectedResult).reason
        const vals = results.map((r) => (r.status === "fulfilled" ? r.value : 0))
        setBuckets(BUCKETS.map((b, i) => ({ label: b.label, value: vals[i] })))
        setTotal(vals.reduce((s, v) => s + v, 0))

        const oldest = await searchRecordCards(p.client, `ModifiedOn <= ${dateLiteral(daysAgo(730))}`, 50)
        if (cancelled) return
        setStale(
          oldest.items
            .sort((a, b) => (a.modifiedOn ?? "").localeCompare(b.modifiedOn ?? ""))
            .map((c) => ({ id: c.id, title: c.title, contentType: c.contentType ?? "", modifiedOn: (c.modifiedOn ?? "").slice(0, 10), card: c })),
        )
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

  const over1y = buckets.slice(4).reduce((s, b) => s + b.value, 0)
  const over2y = buckets.slice(5).reduce((s, b) => s + b.value, 0)
  const under90 = buckets.slice(0, 2).reduce((s, b) => s + b.value, 0)

  return (
    <div className="flex flex-col gap-4">
      {error && <ReportCard title="Content freshness" error={error} />}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label="Touched in last 90 days" value={loading ? null : under90} hint={total ? `${((under90 / total) * 100).toFixed(0)}% of library` : undefined} icon={<Clock className="h-4 w-4" />} colorVar="--rl-3" loading={loading} />
        <KpiTile label="Untouched > 1 year" value={loading ? null : over1y} hint={total ? `${((over1y / total) * 100).toFixed(0)}% of library` : undefined} icon={<Archive className="h-4 w-4" />} colorVar="--rl-4" loading={loading} />
        <KpiTile label="Untouched > 2 years" value={loading ? null : over2y} hint="archive candidates" icon={<Archive className="h-4 w-4" />} colorVar="--rl-2" loading={loading} />
        <KpiTile label="Records counted" value={loading ? null : total} colorVar="--rl-5" loading={loading} />
      </div>
      <ReportCard title="Records by time since last modification" loading={loading}>
        {loading ? <LoadingBlock /> : <ColumnChart data={buckets} colorVar="--rl-4" />}
      </ReportCard>
      <ReportCard title="Longest untouched records" subtitle="Oldest 50 by modification date, older than two years" loading={loading}>
        <DataTable<StaleRow>
          rows={stale}
          rowKey={(r) => r.id}
          initialRows={15}
          exportName="content-freshness-stale"
          emptyMessage="Nothing older than two years."
          columns={[
            { key: "title", header: "Asset", render: (r) => <RecordCell card={r.card} fallbackId={r.id} environment={p.environment} /> },
            { key: "contentType", header: "Type" },
            { key: "modifiedOn", header: "Last modified", align: "right" },
          ]}
        />
      </ReportCard>
    </div>
  )
}
