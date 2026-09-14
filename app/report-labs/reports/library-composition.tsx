"use client"

import { useEffect, useState } from "react"
import { Layers, FileCheck, FileX, Shapes } from "lucide-react"
import { useReportParams } from "../components/report-context"
import { KpiTile, ReportCard, DataTable, ShareBar, LoadingBlock } from "../components/ui"
import { RankedBars } from "../components/charts"
import { countRecords, listContentTypes, runThrottled, escapeExpr, ALL_RECORDS_EXPRESSION } from "@/lib/report-labs/core"
import { formatInt } from "@/lib/report-labs/analytics"

interface TypeRow extends Record<string, unknown> {
  name: string
  count: number
  share: number
}

/** Snapshot of the library: records per content type, with and without files. Core API only. */
export function LibraryComposition() {
  const p = useReportParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [total, setTotal] = useState<number | null>(null)
  const [withFiles, setWithFiles] = useState<number | null>(null)
  const [types, setTypes] = useState<TypeRow[]>([])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [t, noFiles, cts] = await Promise.all([
          countRecords(p.client, ALL_RECORDS_EXPRESSION),
          countRecords(p.client, "FileCount = 0").catch(() => null),
          listContentTypes(p.client),
        ])
        if (cancelled) return
        setTotal(t)
        setWithFiles(noFiles == null ? null : t - noFiles)
        const results = await runThrottled(
          cts.map((ct) => () => countRecords(p.client, `ContentType = '${escapeExpr(ct.name)}'`)),
          4,
        )
        if (cancelled) return
        const rows: TypeRow[] = cts
          .map((ct, i) => ({ name: ct.name, count: results[i].status === "fulfilled" ? results[i].value : 0, share: 0 }))
          .map((r) => ({ ...r, share: t ? (r.count / t) * 100 : 0 }))
          .sort((a, b) => b.count - a.count)
        setTypes(rows)
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

  const nonEmpty = types.filter((t) => t.count > 0)
  const max = types[0]?.count ?? 0

  return (
    <div className="flex flex-col gap-4">
      {error && <ReportCard title="Library composition" error={error} />}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label="Records" value={total} icon={<Layers className="h-4 w-4" />} colorVar="--rl-5" loading={loading} />
        <KpiTile label="With files" value={withFiles} hint={withFiles != null && total ? `${((withFiles / total) * 100).toFixed(1)}%` : "FileCount filter not supported"} icon={<FileCheck className="h-4 w-4" />} colorVar="--rl-3" loading={loading} />
        <KpiTile label="Without files" value={withFiles != null && total != null ? total - withFiles : null} hint="metadata-only records" icon={<FileX className="h-4 w-4" />} colorVar="--rl-2" loading={loading} />
        <KpiTile label="Content types in use" value={loading ? null : nonEmpty.length} hint={types.length ? `of ${types.length} defined` : undefined} icon={<Shapes className="h-4 w-4" />} colorVar="--rl-1" loading={loading} />
      </div>
      <div className="grid gap-4 xl:grid-cols-5">
        <ReportCard title="Records by content type" className="xl:col-span-2" loading={loading}>
          {loading ? <LoadingBlock height={300} /> : <RankedBars data={nonEmpty.slice(0, 12).map((t) => ({ label: t.name, value: t.count }))} colorVar="--rl-5" labelWidth={140} />}
        </ReportCard>
        <ReportCard title="All content types" className="xl:col-span-3" loading={loading}>
          <DataTable<TypeRow>
            rows={types}
            rowKey={(r) => r.name}
            initialRows={15}
            exportName="library-composition"
            columns={[
              { key: "name", header: "Content type" },
              { key: "count", header: "Records", align: "right", width: "220px", render: (r) => (
                <div className="flex items-center gap-2 justify-end">
                  <span className="w-16 text-right tabular-nums">{formatInt(r.count)}</span>
                  <div className="w-28"><ShareBar value={r.count} max={max} colorVar="--rl-5" /></div>
                </div>
              ) },
              { key: "share", header: "Share", align: "right", render: (r) => `${r.share.toFixed(1)}%` },
            ]}
          />
        </ReportCard>
      </div>
    </div>
  )
}
