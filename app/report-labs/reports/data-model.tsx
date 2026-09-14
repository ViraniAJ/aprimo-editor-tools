"use client"

import { useEffect, useMemo, useState } from "react"
import { Search } from "lucide-react"
import { useReportParams } from "../components/report-context"
import { ReportCard, LoadingBlock } from "../components/ui"
import { fetchAnalyticsMeta, KNOWN_CUBES, type CubeMeta } from "@/lib/report-labs/analytics"

/** Lists every cube, measure, and dimension the Analytics API exposes. */
export function DataModel() {
  const p = useReportParams()
  const [loading, setLoading] = useState(true)
  const [cubes, setCubes] = useState<CubeMeta[]>([])
  const [source, setSource] = useState<"live" | "fallback">("live")
  const [note, setNote] = useState<string | null>(null)
  const [filter, setFilter] = useState("")

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const meta = await fetchAnalyticsMeta(p.environment, p.authHeader)
        if (cancelled) return
        setCubes(meta)
        setSource("live")
        setNote(null)
      } catch (e) {
        if (cancelled) return
        setCubes(KNOWN_CUBES)
        setSource("fallback")
        setNote(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [p.environment, p.authHeader, p.refreshToken])

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase()
    if (!f) return cubes
    return cubes
      .map((c) => ({
        ...c,
        measures: c.measures.filter((m) => m.name.toLowerCase().includes(f) || (m.title ?? "").toLowerCase().includes(f)),
        dimensions: c.dimensions.filter((d) => d.name.toLowerCase().includes(f) || (d.title ?? "").toLowerCase().includes(f)),
      }))
      .filter((c) => c.name.toLowerCase().includes(f) || c.measures.length || c.dimensions.length)
  }, [cubes, filter])

  const totalMeasures = cubes.reduce((s, c) => s + c.measures.length, 0)
  const totalDims = cubes.reduce((s, c) => s + c.dimensions.length, 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter cubes and members"
            className="h-9 w-72 rounded-md border border-border bg-background pl-8 pr-3 text-sm"
          />
        </div>
        {!loading && (
          <span className="text-xs text-muted-foreground">
            {cubes.length} cubes, {totalMeasures} measures, {totalDims} dimensions.{" "}
            {source === "live" ? "Read live from this environment's schema endpoint." : "Schema endpoint unavailable; showing the members verified by this app."}
          </span>
        )}
      </div>
      {note && source === "fallback" && <p className="text-xs text-muted-foreground">Schema endpoint response: {note}</p>}
      {loading ? (
        <ReportCard title="Analytics data model"><LoadingBlock /></ReportCard>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {filtered.map((c) => (
            <ReportCard key={c.name} title={c.title && c.title !== c.name ? `${c.name} · ${c.title}` : c.name} subtitle={c.description}>
              <div className="grid gap-3 sm:grid-cols-2 text-xs">
                <div>
                  <div className="font-medium text-muted-foreground mb-1">Measures ({c.measures.length})</div>
                  {c.measures.length === 0 ? (
                    <div className="text-muted-foreground">none</div>
                  ) : (
                    <ul className="space-y-0.5">
                      {c.measures.map((m) => (
                        <li key={m.name} className="font-mono break-all" title={m.description}>
                          {m.name}
                          {m.type && <span className="text-muted-foreground font-sans"> · {m.type}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <div className="font-medium text-muted-foreground mb-1">Dimensions ({c.dimensions.length})</div>
                  {c.dimensions.length === 0 ? (
                    <div className="text-muted-foreground">none</div>
                  ) : (
                    <ul className="space-y-0.5">
                      {c.dimensions.map((d) => (
                        <li key={d.name} className="font-mono break-all" title={d.description}>
                          {d.name}
                          {d.type && <span className="text-muted-foreground font-sans"> · {d.type}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </ReportCard>
          ))}
        </div>
      )}
    </div>
  )
}
