"use client"

import { useEffect, useState } from "react"
import { useReportParams } from "../components/report-context"
import { ReportCard, DataTable, LoadingBlock, EmptyNote } from "../components/ui"
import { RankedBars } from "../components/charts"
import { queryAnalytics, num, str, getAnalyticsMeta, formatInt, type CubeMeta } from "@/lib/report-labs/analytics"

interface Breakdown {
  dimension: string
  label: string
  rows: Array<{ label: string; value: number; share: number }>
}

const CANDIDATES: Array<{ label: string; pattern: RegExp }> = [
  { label: "Rendition type", pattern: /rendition/i },
  { label: "Crop", pattern: /crop/i },
  { label: "File version", pattern: /version/i },
  { label: "Download type", pattern: /^(type|downloadType|kind)$/i },
  { label: "File extension", pattern: /extension|fileType/i },
]

/**
 * Reads the Downloads cube schema and charts every dimension that describes
 * the format of what was downloaded. Adapts to whatever this environment's
 * analytics model exposes rather than hard-coding member names.
 */
export function FormatDemand() {
  const p = useReportParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [breakdowns, setBreakdowns] = useState<Breakdown[]>([])
  const [availableDims, setAvailableDims] = useState<string[]>([])
  const [metaSource, setMetaSource] = useState<"live" | "fallback">("fallback")

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const time = p.range ? [{ dimension: "Downloads.downloadDate", dateRange: p.range }] : []
        const q = (query: Parameters<typeof queryAnalytics>[2]) => queryAnalytics(p.environment, p.authHeader, query)
        const [meta, totalRows] = await Promise.all([getAnalyticsMeta(p.environment, p.authHeader), q({ measures: ["Downloads.count"], timeDimensions: time })])
        if (cancelled) return
        const t = num(totalRows[0]?.["Downloads.count"])
        setTotal(t)

        const downloads: CubeMeta | undefined = meta.find((c) => c.name === "Downloads")
        const dims = downloads?.dimensions.map((d) => d.name) ?? []
        setAvailableDims(dims)
        setMetaSource(dims.length > 2 ? "live" : "fallback")

        // Pick dimensions by pattern; fall back to common names when meta is unavailable.
        const picks: Array<{ label: string; dimension: string }> = []
        for (const c of CANDIDATES) {
          const found = dims.find((d) => c.pattern.test(d.split(".").pop() ?? d))
          if (found && !picks.some((x) => x.dimension === found)) picks.push({ label: c.label, dimension: found })
        }
        if (picks.length === 0) {
          picks.push({ label: "Rendition type", dimension: "Downloads.renditionType" }, { label: "Crop", dimension: "Downloads.cropType" })
        }

        const results = await Promise.all(
          picks.map(async (pick) => {
            try {
              const rows = await q({ measures: ["Downloads.count"], dimensions: [pick.dimension], timeDimensions: time, order: { "Downloads.count": "desc" }, limit: 25 })
              return {
                dimension: pick.dimension,
                label: pick.label,
                rows: rows.map((r) => ({ label: str(r[pick.dimension]) || "(unset)", value: num(r["Downloads.count"]), share: t ? (num(r["Downloads.count"]) / t) * 100 : 0 })),
              } as Breakdown
            } catch {
              return null
            }
          }),
        )
        if (cancelled) return
        setBreakdowns(results.filter((b): b is Breakdown => !!b && b.rows.length > 0))
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

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {loading ? "Reading the Downloads schema…" : `${formatInt(total)} downloads in the period. `}
        {!loading && metaSource === "live" && `The analytics schema exposes ${availableDims.length} download dimensions; the format-related ones are charted below.`}
        {!loading && metaSource === "fallback" && "The analytics schema endpoint is not available here, so common member names were tried directly."}
      </p>
      {error && <ReportCard title="Format demand" error={error} />}
      {loading ? (
        <ReportCard title="Format demand"><LoadingBlock /></ReportCard>
      ) : breakdowns.length === 0 ? (
        <ReportCard title="Format demand">
          <EmptyNote>
            No format dimensions were found on the Downloads cube.
            {availableDims.length > 0 && <span className="block mt-2 font-mono text-xs">{availableDims.join(", ")}</span>}
          </EmptyNote>
        </ReportCard>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {breakdowns.map((b) => (
            <ReportCard key={b.dimension} title={`Downloads by ${b.label.toLowerCase()}`} subtitle={b.dimension}>
              <RankedBars data={b.rows.slice(0, 10).map((r) => ({ label: r.label, value: r.value }))} colorVar="--rl-2" labelWidth={140} />
              <DataTable
                rows={b.rows}
                rowKey={(r) => r.label}
                initialRows={5}
                dense
                exportName={`format-demand-${b.label.toLowerCase().replace(/\s+/g, "-")}`}
                columns={[
                  { key: "label", header: b.label },
                  { key: "value", header: "Downloads", align: "right", render: (r) => formatInt(r.value) },
                  { key: "share", header: "Share", align: "right", render: (r) => `${r.share.toFixed(1)}%` },
                ]}
              />
            </ReportCard>
          ))}
        </div>
      )}
    </div>
  )
}
