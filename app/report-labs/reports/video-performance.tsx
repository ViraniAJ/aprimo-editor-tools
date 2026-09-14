"use client"

import { useEffect, useState } from "react"
import { Play, Film, Users } from "lucide-react"
import { useReportParams } from "../components/report-context"
import { KpiTile, ReportCard, DataTable, ShareBar, LoadingBlock } from "../components/ui"
import { TrendChart } from "../components/charts"
import { RecordCell } from "../components/record-cell"
import { queryAnalytics, num, str, extractDate, bucketKeys, formatInt } from "@/lib/report-labs/analytics"
import { fetchRecordCards, type RecordCard } from "@/lib/report-labs/core"

interface AssetRow extends Record<string, unknown> {
  recordId: string
  plays: number
}
interface UserRow extends Record<string, unknown> {
  user: string
  plays: number
}

export function VideoPerformance() {
  const p = useReportParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [total, setTotal] = useState<number | null>(null)
  const [trend, setTrend] = useState<Array<Record<string, number | string>>>([])
  const [assets, setAssets] = useState<AssetRow[]>([])
  const [users, setUsers] = useState<UserRow[]>([])
  const [cards, setCards] = useState<Map<string, RecordCard>>(new Map())

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const DIM = "PreviewPlaybacks.previewPlaybackDate"
        const time = (g?: boolean) => [{ dimension: DIM, ...(g ? { granularity: p.granularity } : {}), ...(p.range ? { dateRange: p.range } : {}) }]
        const q = (query: Parameters<typeof queryAnalytics>[2]) => queryAnalytics(p.environment, p.authHeader, query)
        const [t, tr, ar, ur] = await Promise.all([
          q({ measures: ["PreviewPlaybacks.count"], timeDimensions: time() }),
          q({ measures: ["PreviewPlaybacks.count"], timeDimensions: time(true), order: { [DIM]: "asc" }, limit: 1000 }),
          q({ measures: ["PreviewPlaybacks.count"], dimensions: ["PreviewPlaybacks.recordId"], timeDimensions: time(), order: { "PreviewPlaybacks.count": "desc" }, limit: 25 }),
          q({ measures: ["PreviewPlaybacks.count"], dimensions: ["Users.loginId"], timeDimensions: time(), order: { "PreviewPlaybacks.count": "desc" }, limit: 25 }).catch(() => []),
        ])
        if (cancelled) return
        setTotal(num(t[0]?.["PreviewPlaybacks.count"]))
        const byDate = new Map<string, number>()
        for (const r of tr) {
          const d = extractDate(r, DIM)
          if (d) byDate.set(d, (byDate.get(d) ?? 0) + num(r["PreviewPlaybacks.count"]))
        }
        const keys = bucketKeys(p.range, p.granularity, Array.from(byDate.keys()))
        setTrend(keys.map((k) => ({ date: k, plays: byDate.get(k) ?? 0 })))
        const a = ar.map((r) => ({ recordId: str(r["PreviewPlaybacks.recordId"]), plays: num(r["PreviewPlaybacks.count"]) })).filter((r) => r.recordId)
        setAssets(a)
        setUsers(ur.map((r) => ({ user: str(r["Users.loginId"]), plays: num(r["PreviewPlaybacks.count"]) })).filter((r) => r.user))
        setLoading(false)
        const map = await fetchRecordCards(p.client, a.map((r) => r.recordId))
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
  }, [p.environment, p.authHeader, p.dateRangeKey, p.refreshToken])

  const maxA = assets[0]?.plays ?? 0
  const maxU = users[0]?.plays ?? 0

  return (
    <div className="flex flex-col gap-4">
      {error && <ReportCard title="Video performance" error={error} />}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiTile label="Plays" value={total} hint="preview playbacks in period" icon={<Play className="h-4 w-4" />} colorVar="--rl-4" loading={loading} />
        <KpiTile label="Assets played" value={assets.length} hint="in top 25" icon={<Film className="h-4 w-4" />} colorVar="--rl-4" loading={loading} />
        <KpiTile label="Viewers" value={users.length} hint="distinct users in top 25" icon={<Users className="h-4 w-4" />} colorVar="--rl-5" loading={loading} />
      </div>
      <ReportCard title="Plays over time" loading={loading}>
        {loading && trend.length === 0 ? <LoadingBlock height={220} /> : <TrendChart data={trend} granularity={p.granularity} height={220} series={[{ key: "plays", label: "Plays", colorVar: "--rl-4" }]} />}
      </ReportCard>
      <div className="grid gap-4 xl:grid-cols-5">
        <ReportCard title="Most played assets" className="xl:col-span-3" loading={loading}>
          <DataTable<AssetRow>
            rows={assets}
            rowKey={(r) => r.recordId}
            initialRows={10}
            exportName="video-top-assets"
            columns={[
              { key: "recordId", header: "Asset", render: (r) => <RecordCell card={cards.get(r.recordId)} fallbackId={r.recordId} environment={p.environment} />, exportValue: (r) => cards.get(r.recordId)?.title ?? r.recordId },
              { key: "plays", header: "Plays", align: "right", width: "200px", render: (r) => (
                <div className="flex items-center gap-2 justify-end">
                  <span className="w-14 text-right tabular-nums">{formatInt(r.plays)}</span>
                  <div className="w-24"><ShareBar value={r.plays} max={maxA} colorVar="--rl-4" /></div>
                </div>
              ) },
            ]}
          />
        </ReportCard>
        <ReportCard title="Most engaged viewers" className="xl:col-span-2" loading={loading}>
          <DataTable<UserRow>
            rows={users}
            rowKey={(r) => r.user}
            initialRows={10}
            exportName="video-top-viewers"
            dense
            columns={[
              { key: "user", header: "User", render: (r) => <span className="font-mono text-xs">{r.user}</span> },
              { key: "plays", header: "Plays", align: "right", width: "160px", render: (r) => (
                <div className="flex items-center gap-2 justify-end">
                  <span className="w-10 text-right tabular-nums">{formatInt(r.plays)}</span>
                  <div className="w-16"><ShareBar value={r.plays} max={maxU} colorVar="--rl-5" /></div>
                </div>
              ) },
            ]}
          />
        </ReportCard>
      </div>
    </div>
  )
}
