"use client"

import { useEffect, useState } from "react"
import { Users, Eye, Download } from "lucide-react"
import { useReportParams } from "../components/report-context"
import { KpiTile, ReportCard, DataTable, ShareBar, LoadingBlock } from "../components/ui"
import { TrendChart, RankedBars } from "../components/charts"
import { queryAnalytics, num, str, extractDate, bucketKeys, getAnalyticsMeta, findDimension, formatInt } from "@/lib/report-labs/analytics"

interface UserRow extends Record<string, unknown> {
  user: string
  views: number
  downloads: number
  total: number
}

interface GroupRow extends Record<string, unknown> {
  group: string
  views: number
}

export function UserAdoption() {
  const p = useReportParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [trend, setTrend] = useState<Array<Record<string, number | string>>>([])
  const [users, setUsers] = useState<UserRow[]>([])
  const [groups, setGroups] = useState<{ label: string; rows: GroupRow[] } | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      setGroups(null)
      try {
        const time = (dim: string, g?: boolean) => [{ dimension: dim, ...(g ? { granularity: p.granularity } : {}), ...(p.range ? { dateRange: p.range } : {}) }]
        const q = (query: Parameters<typeof queryAnalytics>[2]) => queryAnalytics(p.environment, p.authHeader, query)
        const [vt, dt, vu, du] = await Promise.all([
          q({ measures: ["Views.count"], dimensions: ["Users.loginId"], timeDimensions: time("DateDimension.date", true), limit: 10000 }),
          q({ measures: ["Downloads.count"], dimensions: ["Users.loginId"], timeDimensions: time("Downloads.downloadDate", true), limit: 10000 }),
          q({ measures: ["Views.count"], dimensions: ["Users.loginId"], timeDimensions: time("DateDimension.date"), order: { "Views.count": "desc" }, limit: 500 }),
          q({ measures: ["Downloads.count"], dimensions: ["Users.loginId"], timeDimensions: time("Downloads.downloadDate"), order: { "Downloads.count": "desc" }, limit: 500 }),
        ])
        if (cancelled) return

        // Distinct users per bucket
        const viewers = new Map<string, Set<string>>()
        const downloaders = new Map<string, Set<string>>()
        for (const r of vt) {
          const d = extractDate(r, "DateDimension.date")
          const u = str(r["Users.loginId"])
          if (!d || !u) continue
          if (!viewers.has(d)) viewers.set(d, new Set())
          viewers.get(d)!.add(u)
        }
        for (const r of dt) {
          const d = extractDate(r, "Downloads.downloadDate")
          const u = str(r["Users.loginId"])
          if (!d || !u) continue
          if (!downloaders.has(d)) downloaders.set(d, new Set())
          downloaders.get(d)!.add(u)
        }
        const keys = bucketKeys(p.range, p.granularity, [...viewers.keys(), ...downloaders.keys()])
        setTrend(keys.map((k) => ({ date: k, viewers: viewers.get(k)?.size ?? 0, downloaders: downloaders.get(k)?.size ?? 0 })))

        // Per user
        const byUser = new Map<string, UserRow>()
        for (const r of vu) {
          const u = str(r["Users.loginId"])
          if (!u) continue
          const row = byUser.get(u) ?? { user: u, views: 0, downloads: 0, total: 0 }
          row.views += num(r["Views.count"])
          byUser.set(u, row)
        }
        for (const r of du) {
          const u = str(r["Users.loginId"])
          if (!u) continue
          const row = byUser.get(u) ?? { user: u, views: 0, downloads: 0, total: 0 }
          row.downloads += num(r["Downloads.count"])
          byUser.set(u, row)
        }
        setUsers(Array.from(byUser.values()).map((r) => ({ ...r, total: r.views + r.downloads })).sort((a, b) => b.total - a.total))
        setLoading(false)

        // Optional breakdown by department / company if the schema exposes it
        const meta = await getAnalyticsMeta(p.environment, p.authHeader)
        const dim = findDimension(meta, "Users", /^(department|company|division|team)$/i)
        if (dim) {
          try {
            const rows = await q({ measures: ["Views.count"], dimensions: [dim], timeDimensions: time("DateDimension.date"), order: { "Views.count": "desc" }, limit: 20 })
            if (!cancelled)
              setGroups({
                label: dim.split(".").pop() ?? dim,
                rows: rows.map((r) => ({ group: str(r[dim]) || "(unset)", views: num(r["Views.count"]) })),
              })
          } catch {
            /* optional */
          }
        }
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

  const activeUsers = users.length
  const viewersOnly = users.filter((u) => u.downloads === 0).length
  const downloaders = users.filter((u) => u.downloads > 0).length
  const top10Share = activeUsers ? (users.slice(0, 10).reduce((s, u) => s + u.total, 0) / Math.max(1, users.reduce((s, u) => s + u.total, 0))) * 100 : 0
  const max = users[0]?.total ?? 0

  return (
    <div className="flex flex-col gap-4">
      {error && <ReportCard title="User adoption" error={error} />}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label="Active users" value={activeUsers} hint="viewed or downloaded in period" icon={<Users className="h-4 w-4" />} colorVar="--rl-5" loading={loading} />
        <KpiTile label="Downloaders" value={downloaders} hint={activeUsers ? `${((downloaders / activeUsers) * 100).toFixed(0)}% of active users` : undefined} icon={<Download className="h-4 w-4" />} colorVar="--rl-2" loading={loading} />
        <KpiTile label="View only" value={viewersOnly} hint="never downloaded" icon={<Eye className="h-4 w-4" />} colorVar="--rl-1" loading={loading} />
        <KpiTile label="Top 10 share" value={top10Share} format={(n) => `${(n ?? 0).toFixed(0)}%`} hint="of all activity" loading={loading} />
      </div>

      <ReportCard title="Active users over time" subtitle="Distinct users per period who viewed or downloaded" loading={loading}>
        {loading && trend.length === 0 ? (
          <LoadingBlock height={240} />
        ) : (
          <TrendChart
            data={trend}
            granularity={p.granularity}
            series={[
              { key: "viewers", label: "Viewers", colorVar: "--rl-1" },
              { key: "downloaders", label: "Downloaders", colorVar: "--rl-2" },
            ]}
          />
        )}
      </ReportCard>

      <div className={`grid gap-4 ${groups ? "xl:grid-cols-2" : ""}`}>
        <ReportCard title="Most active users" loading={loading}>
          <DataTable<UserRow>
            rows={users}
            rowKey={(r) => r.user}
            initialRows={15}
            exportName="user-adoption"
            columns={[
              { key: "user", header: "User", render: (r) => <span className="font-mono text-xs">{r.user}</span> },
              { key: "views", header: "Views", align: "right", render: (r) => formatInt(r.views) },
              { key: "downloads", header: "Downloads", align: "right", render: (r) => formatInt(r.downloads) },
              { key: "total", header: "Total", align: "right", width: "200px", render: (r) => (
                <div className="flex items-center gap-2 justify-end">
                  <span className="w-14 text-right tabular-nums">{formatInt(r.total)}</span>
                  <div className="w-24"><ShareBar value={r.total} max={max} colorVar="--rl-5" /></div>
                </div>
              ) },
            ]}
          />
        </ReportCard>
        {groups && (
          <ReportCard title={`Views by ${groups.label}`} subtitle="From the Users dimension in this environment's analytics schema">
            <RankedBars data={groups.rows.map((g) => ({ label: g.group, value: g.views }))} colorVar="--rl-5" />
          </ReportCard>
        )}
      </div>
    </div>
  )
}
