"use client"

import { useEffect, useState } from "react"
import { Download, Eye, Play, Users, Zap } from "lucide-react"
import { useReportParams } from "../components/report-context"
import { KpiTile, ReportCard, DataTable, ShareBar, LoadingBlock } from "../components/ui"
import { TrendChart } from "../components/charts"
import { RecordCell } from "../components/record-cell"
import {
  queryAnalytics,
  num,
  str,
  extractDate,
  bucketKeys,
  pctChange,
  toGuid,
  type AnalyticsQuery,
  type DateRange,
} from "@/lib/report-labs/analytics"
import { fetchRecordCards, type RecordCard } from "@/lib/report-labs/core"

interface Totals {
  views: number
  downloads: number
  impressions: number
  plays: number
  activeUsers: number
}

interface TopRow extends Record<string, unknown> {
  recordId: string
  views: number
  downloads: number
  total: number
}

export function ExecutiveOverview() {
  const p = useReportParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [totals, setTotals] = useState<Totals | null>(null)
  const [prior, setPrior] = useState<Totals | null>(null)
  const [trend, setTrend] = useState<Array<Record<string, number | string>>>([])
  const [top, setTop] = useState<TopRow[]>([])
  const [cards, setCards] = useState<Map<string, RecordCard>>(new Map())

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const { environment: env, authHeader, range, priorRange, granularity, collectionId } = p
        const colGuid = collectionId ? toGuid(collectionId) : null
        const colFilter = (member: string) =>
          colGuid ? [{ member, operator: "equals", values: [colGuid] }] : []

        const time = (dim: string, r: DateRange | undefined, g?: boolean) =>
          r || g ? [{ dimension: dim, ...(g ? { granularity } : {}), ...(r ? { dateRange: r } : {}) }] : []

        const totalsFor = async (r: DateRange | undefined): Promise<Totals> => {
          const q = (query: AnalyticsQuery) => queryAnalytics(env, authHeader, query)
          const [v, d, i, pl, vu, du] = await Promise.all([
            q({ measures: ["Views.count"], filters: colFilter("Views.collectionId"), timeDimensions: time("DateDimension.date", r) }),
            colGuid ? Promise.resolve([]) : q({ measures: ["Downloads.count"], timeDimensions: time("Downloads.downloadDate", r) }),
            colGuid ? Promise.resolve([]) : q({ measures: ["Impressions.count"], timeDimensions: time("Impressions.hitDateTime", r) }),
            q({ measures: ["PreviewPlaybacks.count"], timeDimensions: time("PreviewPlaybacks.previewPlaybackDate", r) }).catch(() => []),
            q({ measures: ["Views.count"], dimensions: ["Users.loginId"], filters: colFilter("Views.collectionId"), timeDimensions: time("DateDimension.date", r), limit: 5000 }),
            colGuid ? Promise.resolve([]) : q({ measures: ["Downloads.count"], dimensions: ["Users.loginId"], timeDimensions: time("Downloads.downloadDate", r), limit: 5000 }),
          ])
          const users = new Set<string>()
          for (const row of [...vu, ...du]) if (str(row["Users.loginId"])) users.add(str(row["Users.loginId"]))
          return {
            views: num(v[0]?.["Views.count"]),
            downloads: num(d[0]?.["Downloads.count"]),
            impressions: num(i[0]?.["Impressions.count"]),
            plays: num(pl[0]?.["PreviewPlaybacks.count"]),
            activeUsers: users.size,
          }
        }

        const [cur, prev] = await Promise.all([totalsFor(range), priorRange ? totalsFor(priorRange) : Promise.resolve(null)])
        if (cancelled) return
        setTotals(cur)
        setPrior(prev)

        // Trend
        const q = (query: AnalyticsQuery) => queryAnalytics(env, authHeader, query)
        const [tv, td, ti, tp] = await Promise.all([
          q({ measures: ["Views.count"], filters: colFilter("Views.collectionId"), timeDimensions: time("DateDimension.date", range, true), order: { "DateDimension.date": "asc" }, limit: 1000 }),
          colGuid ? Promise.resolve([]) : q({ measures: ["Downloads.count"], timeDimensions: time("Downloads.downloadDate", range, true), order: { "Downloads.downloadDate": "asc" }, limit: 1000 }),
          colGuid ? Promise.resolve([]) : q({ measures: ["Impressions.count"], timeDimensions: time("Impressions.hitDateTime", range, true), order: { "Impressions.hitDateTime": "asc" }, limit: 1000 }),
          q({ measures: ["PreviewPlaybacks.count"], timeDimensions: time("PreviewPlaybacks.previewPlaybackDate", range, true), order: { "PreviewPlaybacks.previewPlaybackDate": "asc" }, limit: 1000 }).catch(() => []),
        ])
        const byDate = new Map<string, Record<string, number | string>>()
        const put = (date: string, key: string, val: number) => {
          if (!date) return
          const row = byDate.get(date) ?? { date, views: 0, downloads: 0, impressions: 0, plays: 0 }
          row[key] = num(row[key]) + val
          byDate.set(date, row)
        }
        for (const r of tv) put(extractDate(r, "DateDimension.date"), "views", num(r["Views.count"]))
        for (const r of td) put(extractDate(r, "Downloads.downloadDate"), "downloads", num(r["Downloads.count"]))
        for (const r of ti) put(extractDate(r, "Impressions.hitDateTime"), "impressions", num(r["Impressions.count"]))
        for (const r of tp) put(extractDate(r, "PreviewPlaybacks.previewPlaybackDate"), "plays", num(r["PreviewPlaybacks.count"]))
        const keys = bucketKeys(range, granularity, Array.from(byDate.keys()))
        setTrend(keys.map((k) => byDate.get(k) ?? { date: k, views: 0, downloads: 0, impressions: 0, plays: 0 }))

        // Top assets (views + downloads)
        const [topV, topD] = await Promise.all([
          q({ measures: ["Views.count"], dimensions: ["Views.recordId"], filters: colFilter("Views.collectionId"), timeDimensions: time("DateDimension.date", range), order: { "Views.count": "desc" }, limit: 15 }),
          colGuid ? Promise.resolve([]) : q({ measures: ["Downloads.count"], dimensions: ["Downloads.recordId"], timeDimensions: time("Downloads.downloadDate", range), order: { "Downloads.count": "desc" }, limit: 15 }),
        ])
        const agg = new Map<string, TopRow>()
        for (const r of topV) {
          const id = str(r["Views.recordId"])
          if (!id) continue
          const row = agg.get(id) ?? { recordId: id, views: 0, downloads: 0, total: 0 }
          row.views += num(r["Views.count"])
          agg.set(id, row)
        }
        for (const r of topD) {
          const id = str(r["Downloads.recordId"])
          if (!id) continue
          const row = agg.get(id) ?? { recordId: id, views: 0, downloads: 0, total: 0 }
          row.downloads += num(r["Downloads.count"])
          agg.set(id, row)
        }
        const rows = Array.from(agg.values())
          .map((r) => ({ ...r, total: r.views + r.downloads }))
          .sort((a, b) => b.total - a.total)
          .slice(0, 10)
        if (cancelled) return
        setTop(rows)
        setLoading(false)

        const map = await fetchRecordCards(p.client, rows.map((r) => r.recordId))
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
  }, [p.environment, p.authHeader, p.dateRangeKey, p.collectionId, p.refreshToken])

  const d = (k: keyof Totals) => (totals && prior ? pctChange(totals[k], prior[k]) : undefined)
  const hint = prior ? "vs prior period" : undefined
  const maxTotal = top[0]?.total ?? 0
  const scoped = !!p.collectionId

  return (
    <div className="flex flex-col gap-4">
      {error && <ReportCard title="Executive overview" error={error} />}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        <KpiTile label="Views" value={totals?.views} delta={d("views")} hint={hint} colorVar="--rl-1" icon={<Eye className="h-4 w-4" />} loading={loading} />
        <KpiTile label="Downloads" value={scoped ? null : totals?.downloads} delta={scoped ? undefined : d("downloads")} hint={scoped ? "not available per collection" : hint} colorVar="--rl-2" icon={<Download className="h-4 w-4" />} loading={loading} />
        <KpiTile label="Impressions" value={scoped ? null : totals?.impressions} delta={scoped ? undefined : d("impressions")} hint={scoped ? "not available per collection" : hint} colorVar="--rl-3" icon={<Zap className="h-4 w-4" />} loading={loading} />
        <KpiTile label="Plays" value={totals?.plays} delta={d("plays")} hint={hint} colorVar="--rl-4" icon={<Play className="h-4 w-4" />} loading={loading} />
        <KpiTile label="Active users" value={totals?.activeUsers} delta={d("activeUsers")} hint={hint} colorVar="--rl-5" icon={<Users className="h-4 w-4" />} loading={loading} />
      </div>

      <ReportCard title="Engagement over time" subtitle={p.range ? `${p.range[0]} to ${p.range[1]}` : "All time"} loading={loading}>
        {loading && trend.length === 0 ? (
          <LoadingBlock height={240} />
        ) : (
          <TrendChart
            data={trend}
            granularity={p.granularity}
            series={[
              { key: "views", label: "Views", colorVar: "--rl-1" },
              ...(scoped ? [] : [{ key: "downloads", label: "Downloads", colorVar: "--rl-2" }]),
              ...(scoped ? [] : [{ key: "impressions", label: "Impressions", colorVar: "--rl-3" }]),
              { key: "plays", label: "Plays", colorVar: "--rl-4" },
            ]}
          />
        )}
      </ReportCard>

      <ReportCard title="Top assets" subtitle="Ranked by views plus downloads in the period" loading={loading}>
        <DataTable<TopRow>
          rows={top}
          rowKey={(r) => r.recordId}
          exportName="top-assets"
          columns={[
            { key: "recordId", header: "Asset", render: (r) => <RecordCell card={cards.get(r.recordId)} fallbackId={r.recordId} environment={p.environment} />, exportValue: (r) => cards.get(r.recordId)?.title ?? r.recordId },
            { key: "views", header: "Views", align: "right" },
            { key: "downloads", header: "Downloads", align: "right" },
            { key: "total", header: "Total", align: "right", width: "220px", render: (r) => (
              <div className="flex items-center gap-2 justify-end">
                <span className="w-16 text-right tabular-nums">{r.total}</span>
                <div className="w-28"><ShareBar value={r.total} max={maxTotal} /></div>
              </div>
            ) },
          ]}
        />
      </ReportCard>
    </div>
  )
}
