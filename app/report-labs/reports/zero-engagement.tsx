"use client"

import { useEffect, useState } from "react"
import { EyeOff, Layers, Activity } from "lucide-react"
import { useReportParams } from "../components/report-context"
import { KpiTile, ReportCard, DataTable, LoadingBlock } from "../components/ui"
import { RecordCell } from "../components/record-cell"
import { queryAnalytics, str, analyticsId } from "@/lib/report-labs/analytics"
import { countRecords, searchRecordCards, ALL_RECORDS_EXPRESSION, dateLiteral, type RecordCard } from "@/lib/report-labs/core"

interface Row extends Record<string, unknown> {
  id: string
  title: string
  contentType: string
  createdOn: string
  card: RecordCard
}

/**
 * Zero engagement = library records minus records that had any view or
 * download in the period. Computed from the Core API total and the distinct
 * record ids in the Views and Downloads cubes, so it works without the
 * dedicated ZeroViews cube.
 */
export function ZeroEngagement() {
  const p = useReportParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [total, setTotal] = useState<number | null>(null)
  const [engaged, setEngaged] = useState<number | null>(null)
  const [viewed, setViewed] = useState<number | null>(null)
  const [downloaded, setDownloaded] = useState<number | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [unused, setUnused] = useState<Row[]>([])
  const [sampleSize, setSampleSize] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const time = (dim: string) => (p.range ? [{ dimension: dim, dateRange: p.range }] : [])
        const LIMIT = 10000
        const [totalCount, viewRows, dlRows] = await Promise.all([
          countRecords(p.client, ALL_RECORDS_EXPRESSION),
          queryAnalytics(p.environment, p.authHeader, { measures: ["Views.count"], dimensions: ["Views.recordId"], timeDimensions: time("DateDimension.date"), limit: LIMIT }),
          queryAnalytics(p.environment, p.authHeader, { measures: ["Downloads.count"], dimensions: ["Downloads.recordId"], timeDimensions: time("Downloads.downloadDate"), limit: LIMIT }),
        ])
        if (cancelled) return
        const viewedIds = new Set(viewRows.map((r) => analyticsId(str(r["Views.recordId"]))).filter(Boolean))
        const dlIds = new Set(dlRows.map((r) => analyticsId(str(r["Downloads.recordId"]))).filter(Boolean))
        const engagedIds = new Set([...viewedIds, ...dlIds])
        setTotal(totalCount)
        setViewed(viewedIds.size)
        setDownloaded(dlIds.size)
        setEngaged(engagedIds.size)
        setTruncated(viewRows.length >= LIMIT || dlRows.length >= LIMIT)

        // Sample: recently created records (older than 14 days so they had a chance) with no engagement.
        const cutoff = new Date()
        cutoff.setDate(cutoff.getDate() - 14)
        const sample = await searchRecordCards(p.client, `CreatedOn < ${dateLiteral(cutoff)}`, 200)
        if (cancelled) return
        setSampleSize(sample.items.length)
        setUnused(
          sample.items
            .filter((c) => !engagedIds.has(c.key))
            .slice(0, 50)
            .map((c) => ({ id: c.id, title: c.title, contentType: c.contentType ?? "", createdOn: (c.createdOn ?? "").slice(0, 10), card: c })),
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
  }, [p.environment, p.authHeader, p.dateRangeKey, p.refreshToken])

  const zero = total != null && engaged != null ? Math.max(0, total - engaged) : null
  const zeroPct = total && zero != null ? (zero / total) * 100 : null

  return (
    <div className="flex flex-col gap-4">
      {error && <ReportCard title="Zero engagement" error={error} />}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label="Records in library" value={total} icon={<Layers className="h-4 w-4" />} colorVar="--rl-5" loading={loading} />
        <KpiTile label="Engaged in period" value={engaged} hint={engaged != null && total ? `${((engaged / total) * 100).toFixed(1)}% of library` : undefined} icon={<Activity className="h-4 w-4" />} colorVar="--rl-3" loading={loading} />
        <KpiTile label="Zero engagement" value={zero} hint={zeroPct != null ? `${zeroPct.toFixed(1)}% saw no views or downloads` : undefined} icon={<EyeOff className="h-4 w-4" />} colorVar="--rl-2" loading={loading} />
        <KpiTile label="Viewed / downloaded" value={viewed} hint={downloaded != null ? `${downloaded} downloaded` : undefined} colorVar="--rl-1" loading={loading} />
      </div>
      {truncated && (
        <p className="text-xs text-muted-foreground">
          The engaged set hit the 10,000 row cap on one of the analytics queries, so the zero-engagement figure is an upper bound.
        </p>
      )}
      <ReportCard
        title="Unused assets, recent sample"
        subtitle={`From the ${sampleSize} most recent records older than 14 days, these had no views or downloads in the period`}
        loading={loading}
      >
        {loading ? (
          <LoadingBlock />
        ) : (
          <DataTable<Row>
            rows={unused}
            rowKey={(r) => r.id}
            initialRows={20}
            exportName="zero-engagement-sample"
            emptyMessage="Every record in the sample had some engagement."
            columns={[
              { key: "title", header: "Asset", render: (r) => <RecordCell card={r.card} fallbackId={r.id} environment={p.environment} /> },
              { key: "contentType", header: "Type" },
              { key: "createdOn", header: "Created", align: "right" },
            ]}
          />
        )}
      </ReportCard>
    </div>
  )
}
