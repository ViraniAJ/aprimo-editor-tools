"use client"

import { useEffect, useState } from "react"
import { Zap, HardDrive, Link2, Tag } from "lucide-react"
import { useReportParams } from "../components/report-context"
import { KpiTile, ReportCard, DataTable, ShareBar, LoadingBlock } from "../components/ui"
import { TrendChart, RankedBars } from "../components/charts"
import { RecordCell } from "../components/record-cell"
import { queryAnalytics, num, str, extractDate, bucketKeys, formatBytes, formatInt } from "@/lib/report-labs/analytics"
import { fetchRecordCards, type RecordCard } from "@/lib/report-labs/core"

interface FileRow extends Record<string, unknown> {
  recordId: string
  fileName: string
  impressions: number
  bytes: number
}

interface UtmRow extends Record<string, unknown> {
  key: string
  value: string
  impressions: number
}

export function PublicLinkTraffic() {
  const p = useReportParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [total, setTotal] = useState<number | null>(null)
  const [bytes, setBytes] = useState<number | null>(null)
  const [trend, setTrend] = useState<Array<Record<string, number | string>>>([])
  const [files, setFiles] = useState<FileRow[]>([])
  const [utm, setUtm] = useState<UtmRow[]>([])
  const [cards, setCards] = useState<Map<string, RecordCard>>(new Map())
  const [bytesSupported, setBytesSupported] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const time = (g?: boolean) => [{ dimension: "Impressions.hitDateTime", ...(g ? { granularity: p.granularity } : {}), ...(p.range ? { dateRange: p.range } : {}) }]
        const q = (query: Parameters<typeof queryAnalytics>[2]) => queryAnalytics(p.environment, p.authHeader, query)

        // Total impressions and bytes; bytes measure is optional in some schemas.
        let totalRows = await q({ measures: ["Impressions.count", "Impressions.totalResponseSize"], timeDimensions: time() }).catch(() => null)
        let withBytes = true
        if (!totalRows) {
          withBytes = false
          totalRows = await q({ measures: ["Impressions.count"], timeDimensions: time() })
        }
        if (cancelled) return
        setBytesSupported(withBytes)
        setTotal(num(totalRows[0]?.["Impressions.count"]))
        setBytes(withBytes ? num(totalRows[0]?.["Impressions.totalResponseSize"]) : null)

        const [tr, fr, ur] = await Promise.all([
          q({ measures: ["Impressions.count"], timeDimensions: time(true), order: { "Impressions.hitDateTime": "asc" }, limit: 1000 }),
          q({
            measures: withBytes ? ["Impressions.count", "Impressions.totalResponseSize"] : ["Impressions.count"],
            dimensions: ["Impressions.recordId", "Impressions.fileName"],
            timeDimensions: time(),
            order: { "Impressions.count": "desc" },
            limit: 50,
          }).catch(() =>
            q({ measures: ["Impressions.count"], dimensions: ["Impressions.recordId"], timeDimensions: time(), order: { "Impressions.count": "desc" }, limit: 50 }),
          ),
          q({
            measures: ["Impressions.count"],
            dimensions: ["ImpressionTrackingTypes.queryStringKey", "ImpressionTrackingTypeValues.value"],
            timeDimensions: time(),
            order: { "Impressions.count": "desc" },
            limit: 100,
          }).catch(() => []),
        ])
        if (cancelled) return

        const byDate = new Map<string, number>()
        for (const r of tr) {
          const d = extractDate(r, "Impressions.hitDateTime")
          if (d) byDate.set(d, (byDate.get(d) ?? 0) + num(r["Impressions.count"]))
        }
        const keys = bucketKeys(p.range, p.granularity, Array.from(byDate.keys()))
        setTrend(keys.map((k) => ({ date: k, impressions: byDate.get(k) ?? 0 })))

        const fileRows: FileRow[] = fr
          .map((r) => ({
            recordId: str(r["Impressions.recordId"]),
            fileName: str(r["Impressions.fileName"]),
            impressions: num(r["Impressions.count"]),
            bytes: num(r["Impressions.totalResponseSize"]),
          }))
          .filter((r) => r.recordId)
        setFiles(fileRows)

        setUtm(
          ur
            .map((r) => ({ key: str(r["ImpressionTrackingTypes.queryStringKey"]), value: str(r["ImpressionTrackingTypeValues.value"]), impressions: num(r["Impressions.count"]) }))
            .filter((r) => r.key || r.value),
        )
        setLoading(false)

        const map = await fetchRecordCards(p.client, fileRows.slice(0, 50).map((r) => r.recordId))
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

  const distinctFiles = files.length
  const utmKeys = new Set(utm.map((u) => u.key)).size
  const maxImp = files[0]?.impressions ?? 0
  const utmByKey = Array.from(
    utm.reduce((m, r) => m.set(r.key || "(none)", (m.get(r.key || "(none)") ?? 0) + r.impressions), new Map<string, number>()),
  )
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10)

  return (
    <div className="flex flex-col gap-4">
      {error && <ReportCard title="Public link traffic" error={error} />}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label="Impressions" value={total} hint="requests to public links" icon={<Zap className="h-4 w-4" />} colorVar="--rl-3" loading={loading} />
        <KpiTile label="Bandwidth served" value={bytes} format={(n) => (n == null ? "–" : formatBytes(n))} hint={bytesSupported ? "total response size" : "not exposed in this schema"} icon={<HardDrive className="h-4 w-4" />} colorVar="--rl-3" loading={loading} />
        <KpiTile label="Files with traffic" value={distinctFiles} hint="in top 50" icon={<Link2 className="h-4 w-4" />} colorVar="--rl-3" loading={loading} />
        <KpiTile label="UTM keys seen" value={utmKeys} hint="tracking parameters" icon={<Tag className="h-4 w-4" />} colorVar="--rl-3" loading={loading} />
      </div>

      <ReportCard title="Impressions over time" loading={loading}>
        {loading && trend.length === 0 ? <LoadingBlock height={220} /> : <TrendChart data={trend} granularity={p.granularity} height={220} series={[{ key: "impressions", label: "Impressions", colorVar: "--rl-3" }]} />}
      </ReportCard>

      <div className="grid gap-4 xl:grid-cols-5">
        <ReportCard title="Most requested files" className="xl:col-span-3" loading={loading}>
          <DataTable<FileRow>
            rows={files}
            rowKey={(r, i) => `${r.recordId}-${r.fileName}-${i}`}
            initialRows={15}
            exportName="public-link-files"
            columns={[
              { key: "recordId", header: "Asset", render: (r) => <RecordCell card={cards.get(r.recordId)} fallbackId={r.recordId} environment={p.environment} />, exportValue: (r) => cards.get(r.recordId)?.title ?? r.recordId },
              { key: "fileName", header: "File", render: (r) => <span className="font-mono text-xs truncate block max-w-[220px]" title={r.fileName}>{r.fileName || "–"}</span> },
              { key: "impressions", header: "Impressions", align: "right", width: "180px", render: (r) => (
                <div className="flex items-center gap-2 justify-end">
                  <span className="w-14 text-right tabular-nums">{formatInt(r.impressions)}</span>
                  <div className="w-20"><ShareBar value={r.impressions} max={maxImp} colorVar="--rl-3" /></div>
                </div>
              ) },
              ...(bytesSupported ? [{ key: "bytes", header: "Bytes", align: "right" as const, render: (r: FileRow) => formatBytes(r.bytes) }] : []),
            ]}
          />
        </ReportCard>
        <ReportCard title="Impressions by UTM key" subtitle="Which tracking parameters carry the traffic" className="xl:col-span-2" loading={loading}>
          {loading ? <LoadingBlock /> : utmByKey.length ? <RankedBars data={utmByKey} colorVar="--rl-3" labelWidth={120} /> : <p className="text-sm text-muted-foreground py-6 text-center">No UTM parameters recorded in this period.</p>}
        </ReportCard>
      </div>

      <ReportCard title="UTM parameter values" subtitle="Campaign, source, and medium values seen on public link requests" loading={loading}>
        <DataTable<UtmRow>
          rows={utm}
          rowKey={(r, i) => `${r.key}-${r.value}-${i}`}
          initialRows={15}
          exportName="public-link-utm"
          emptyMessage="No UTM parameters recorded in this period."
          dense
          columns={[
            { key: "key", header: "Key", render: (r) => <span className="font-mono text-xs">{r.key || "–"}</span> },
            { key: "value", header: "Value", render: (r) => <span className="font-mono text-xs">{r.value || "–"}</span> },
            { key: "impressions", header: "Impressions", align: "right", render: (r) => formatInt(r.impressions) },
          ]}
        />
      </ReportCard>
    </div>
  )
}
