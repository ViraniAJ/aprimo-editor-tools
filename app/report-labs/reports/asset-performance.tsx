"use client"

import { useEffect, useState } from "react"
import { useReportParams } from "../components/report-context"
import { ReportCard, DataTable, ShareBar, LoadingBlock } from "../components/ui"
import { RankedBars } from "../components/charts"
import { RecordCell } from "../components/record-cell"
import { queryAnalytics, num, str, toGuid, formatInt } from "@/lib/report-labs/analytics"
import { fetchRecordCards, type RecordCard } from "@/lib/report-labs/core"

type Metric = "views" | "downloads" | "impressions" | "plays"

const METRICS: Record<Metric, { label: string; measure: string; recordDim: string; timeDim: string; colorVar: string; collectionDim?: string }> = {
  views: { label: "Views", measure: "Views.count", recordDim: "Views.recordId", timeDim: "DateDimension.date", colorVar: "--rl-1", collectionDim: "Views.collectionId" },
  downloads: { label: "Downloads", measure: "Downloads.count", recordDim: "Downloads.recordId", timeDim: "Downloads.downloadDate", colorVar: "--rl-2" },
  impressions: { label: "Impressions", measure: "Impressions.count", recordDim: "Impressions.recordId", timeDim: "Impressions.hitDateTime", colorVar: "--rl-3" },
  plays: { label: "Plays", measure: "PreviewPlaybacks.count", recordDim: "PreviewPlaybacks.recordId", timeDim: "PreviewPlaybacks.previewPlaybackDate", colorVar: "--rl-4" },
}

interface Row extends Record<string, unknown> {
  recordId: string
  count: number
  share: number
}

export function AssetPerformance() {
  const p = useReportParams()
  const [metric, setMetric] = useState<Metric>("views")
  const [limit, setLimit] = useState(25)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [total, setTotal] = useState(0)
  const [cards, setCards] = useState<Map<string, RecordCard>>(new Map())

  const m = METRICS[metric]
  const scoped = !!p.collectionId && !m.collectionDim

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      setRows([])
      try {
        if (scoped) {
          setError(`${m.label} cannot be scoped to a collection. Clear the collection filter or pick Views.`)
          setLoading(false)
          return
        }
        const filters = p.collectionId && m.collectionDim ? [{ member: m.collectionDim, operator: "equals", values: [toGuid(p.collectionId)] }] : []
        const timeDimensions = p.range ? [{ dimension: m.timeDim, dateRange: p.range }] : []
        const [totalRows, topRows] = await Promise.all([
          queryAnalytics(p.environment, p.authHeader, { measures: [m.measure], filters, timeDimensions }),
          queryAnalytics(p.environment, p.authHeader, { measures: [m.measure], dimensions: [m.recordDim], filters, timeDimensions, order: { [m.measure]: "desc" }, limit }),
        ])
        if (cancelled) return
        const t = num(totalRows[0]?.[m.measure])
        setTotal(t)
        const out: Row[] = topRows
          .map((r) => ({ recordId: str(r[m.recordDim]), count: num(r[m.measure]), share: 0 }))
          .filter((r) => r.recordId)
          .map((r) => ({ ...r, share: t > 0 ? (r.count / t) * 100 : 0 }))
        setRows(out)
        setLoading(false)
        const map = await fetchRecordCards(p.client, out.map((r) => r.recordId))
        if (!cancelled) setCards(map)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e))
          setLoading(false)
        }
      }
    }
    load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.environment, p.authHeader, p.dateRangeKey, p.collectionId, p.refreshToken, metric, limit])

  const top10 = rows.slice(0, 10).map((r) => ({ label: cards.get(r.recordId)?.title ?? `${r.recordId.slice(0, 8)}…`, value: r.count }))
  const topShare = rows.slice(0, 10).reduce((s, r) => s + r.share, 0)
  const max = rows[0]?.count ?? 0

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border border-border overflow-hidden text-sm">
          {(Object.keys(METRICS) as Metric[]).map((k) => (
            <button
              key={k}
              onClick={() => setMetric(k)}
              className={`px-3 py-1.5 transition-colors ${metric === k ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              {METRICS[k].label}
            </button>
          ))}
        </div>
        <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="h-8 rounded-md border border-border bg-background px-2 text-sm">
          {[10, 25, 50, 100].map((n) => (
            <option key={n} value={n}>Top {n}</option>
          ))}
        </select>
        {!loading && !error && (
          <span className="text-xs text-muted-foreground ml-auto">
            {formatInt(total)} {m.label.toLowerCase()} in period. Top 10 assets account for {topShare.toFixed(1)}%.
          </span>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        <ReportCard title={`Top 10 by ${m.label.toLowerCase()}`} className="xl:col-span-2" loading={loading} error={error}>
          {loading ? <LoadingBlock height={300} /> : <RankedBars data={top10} colorVar={m.colorVar} labelWidth={150} />}
        </ReportCard>
        <ReportCard title={`Top ${limit} assets`} subtitle="Click an asset to open it in the DAM" className="xl:col-span-3" loading={loading} error={error}>
          <DataTable<Row>
            rows={rows}
            rowKey={(r) => r.recordId}
            initialRows={25}
            exportName={`asset-performance-${metric}`}
            columns={[
              { key: "rank", header: "#", width: "40px", render: (r) => <span className="text-muted-foreground">{rows.indexOf(r) + 1}</span>, exportValue: (r) => rows.indexOf(r) + 1 },
              { key: "recordId", header: "Asset", render: (r) => <RecordCell card={cards.get(r.recordId)} fallbackId={r.recordId} environment={p.environment} />, exportValue: (r) => cards.get(r.recordId)?.title ?? r.recordId },
              { key: "contentType", header: "Type", render: (r) => <span className="text-xs text-muted-foreground">{cards.get(r.recordId)?.contentType ?? ""}</span>, exportValue: (r) => cards.get(r.recordId)?.contentType ?? "" },
              { key: "count", header: m.label, align: "right", render: (r) => (
                <div className="flex items-center gap-2 justify-end">
                  <span className="w-14 text-right tabular-nums">{formatInt(r.count)}</span>
                  <div className="w-24"><ShareBar value={r.count} max={max} colorVar={m.colorVar} /></div>
                </div>
              ) },
              { key: "share", header: "Share", align: "right", render: (r) => `${r.share.toFixed(1)}%`, exportValue: (r) => r.share.toFixed(2) },
            ]}
          />
        </ReportCard>
      </div>
    </div>
  )
}
