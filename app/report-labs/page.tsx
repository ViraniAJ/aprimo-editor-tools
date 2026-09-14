"use client"

import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { useAprimo } from "@/context/aprimo-context"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Activity, BarChart3, BookOpen, ChevronRight, FlaskConical, Library, Loader2, RefreshCw, Sparkles } from "lucide-react"
import "./report-labs.css"

import { REPORTS, REPORT_GROUPS, getReport, type ReportDef, type ReportGroup } from "@/lib/report-labs/registry"
import { DATE_RANGE_OPTIONS, getDateRange, getPriorRange, getGranularity, type DateRangeKey } from "@/lib/report-labs/analytics"
import { listCollections, type CollectionInfo } from "@/lib/report-labs/core"
import { ReportProvider, type ReportParams } from "./components/report-context"
import { AssistantPanel } from "./components/assistant-panel"

import { ExecutiveOverview } from "./reports/executive-overview"
import { AssetPerformance } from "./reports/asset-performance"
import { ZeroEngagement } from "./reports/zero-engagement"
import { UserAdoption } from "./reports/user-adoption"
import { PublicLinkTraffic } from "./reports/public-link-traffic"
import { FormatDemand } from "./reports/format-demand"
import { VideoPerformance } from "./reports/video-performance"
import { LibraryComposition } from "./reports/library-composition"
import { LibraryGrowth } from "./reports/library-growth"
import { ContentFreshness } from "./reports/content-freshness"
import { DataModel } from "./reports/data-model"

const COMPONENTS: Record<string, React.ComponentType> = {
  "executive-overview": ExecutiveOverview,
  "asset-performance": AssetPerformance,
  "zero-engagement": ZeroEngagement,
  "user-adoption": UserAdoption,
  "public-link-traffic": PublicLinkTraffic,
  "format-demand": FormatDemand,
  "video-performance": VideoPerformance,
  "library-composition": LibraryComposition,
  "library-growth": LibraryGrowth,
  "content-freshness": ContentFreshness,
  "data-model": DataModel,
}

const GROUP_ICONS: Record<ReportGroup, React.ComponentType<{ className?: string }>> = {
  Engagement: Activity,
  Library: Library,
  Reference: BookOpen,
}

function ReportLabsContent() {
  const { isConnected, connection, getAuthHeader, client } = useAprimo()
  const router = useRouter()
  const searchParams = useSearchParams()
  const reportId = searchParams.get("report")
  const report = getReport(reportId)

  const [dateRangeKey, setDateRangeKey] = useState<DateRangeKey>("30d")
  const [collectionId, setCollectionId] = useState<string | null>(null)
  const [collections, setCollections] = useState<CollectionInfo[]>([])
  const [refreshToken, setRefreshToken] = useState(0)
  const [assistantOpen, setAssistantOpen] = useState(false)

  useEffect(() => {
    if (!client || !isConnected) return
    let cancelled = false
    listCollections(client)
      .then((c) => !cancelled && setCollections(c))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [client, isConnected])

  const navigate = useCallback(
    (id: string | null) => {
      router.push(id ? `/report-labs?report=${id}` : "/report-labs")
    },
    [router],
  )

  const authHeader = getAuthHeader()
  const params: ReportParams | null = useMemo(() => {
    if (!connection || !authHeader || !client) return null
    const range = getDateRange(dateRangeKey)
    return {
      environment: connection.environment,
      authHeader,
      accessToken: connection.accessToken,
      client,
      dateRangeKey,
      range,
      priorRange: range ? getPriorRange(range) : undefined,
      granularity: getGranularity(dateRangeKey),
      collectionId,
      collections,
      refreshToken,
    }
  }, [connection, authHeader, client, dateRangeKey, collectionId, collections, refreshToken])

  if (!isConnected || !params) {
    return (
      <main className="flex-1 flex items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">Connect to Aprimo to open Report Labs.</p>
      </main>
    )
  }

  const Component = report ? COMPONENTS[report.id] : null
  const collectionName = collections.find((c) => c.id === collectionId)?.name ?? null

  return (
    <div className="report-labs flex-1 flex min-h-0">
      {/* Sidebar */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-border bg-card">
        <button onClick={() => navigate(null)} className="flex items-center gap-2 px-4 py-4 border-b border-border text-left hover:bg-muted/50">
          <FlaskConical className="h-5 w-5 text-primary" />
          <div>
            <div className="text-sm font-semibold leading-tight">Report Labs</div>
            <div className="text-[11px] text-muted-foreground">{connection?.environment}</div>
          </div>
        </button>
        <nav className="flex-1 overflow-y-auto py-2">
          {REPORT_GROUPS.map((g) => {
            const Icon = GROUP_ICONS[g]
            return (
              <div key={g} className="mb-2">
                <div className="px-4 py-1.5 text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                  <Icon className="h-3 w-3" /> {g}
                </div>
                {REPORTS.filter((r) => r.group === g).map((r) => (
                  <button
                    key={r.id}
                    onClick={() => navigate(r.id)}
                    className={`w-full text-left px-4 py-1.5 text-sm transition-colors ${report?.id === r.id ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted/60"}`}
                  >
                    {r.title}
                  </button>
                ))}
              </div>
            )
          })}
        </nav>
        <div className="border-t border-border p-3">
          <Button variant={assistantOpen ? "secondary" : "default"} size="sm" className="w-full" onClick={() => setAssistantOpen((o) => !o)}>
            <Sparkles className="h-4 w-4 mr-2" /> {assistantOpen ? "Hide assistant" : "Ask a question"}
          </Button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 flex flex-col">
        <div className="border-b border-border bg-background px-6 py-3 flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Link href="/" className="hover:text-foreground">Home</Link>
              <ChevronRight className="h-3 w-3" />
              <button onClick={() => navigate(null)} className="hover:text-foreground">Report Labs</button>
              {report && (
                <>
                  <ChevronRight className="h-3 w-3" />
                  <span>{report.title}</span>
                </>
              )}
            </div>
            <h1 className="text-lg font-semibold leading-tight truncate">{report ? report.title : "Aprimo Report Labs"}</h1>
            {report && <p className="text-xs text-muted-foreground truncate">{report.description}</p>}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {(!report || report.usesDateRange) && (
              <select value={dateRangeKey} onChange={(e) => setDateRangeKey(e.target.value as DateRangeKey)} className="h-8 rounded-md border border-border bg-background px-2 text-sm" title="Date range">
                {DATE_RANGE_OPTIONS.map((o) => (
                  <option key={o.key} value={o.key}>{o.label}</option>
                ))}
              </select>
            )}
            {report?.usesCollection && collections.length > 0 && (
              <select value={collectionId ?? ""} onChange={(e) => setCollectionId(e.target.value || null)} className="h-8 max-w-[220px] rounded-md border border-border bg-background px-2 text-sm" title="Collection scope">
                <option value="">All collections</option>
                {collections.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
            {report && (
              <Button variant="ghost" size="sm" className="h-8" onClick={() => setRefreshToken((t) => t + 1)} title="Refresh">
                <RefreshCw className="h-4 w-4" />
              </Button>
            )}
            <Button variant={assistantOpen ? "secondary" : "outline"} size="sm" className="h-8 lg:hidden" onClick={() => setAssistantOpen((o) => !o)}>
              <Sparkles className="h-4 w-4 mr-1" /> Ask
            </Button>
          </div>
        </div>

        <div className="flex-1 min-h-0 flex">
          <div className="flex-1 min-w-0 overflow-y-auto p-6">
            <ReportProvider value={params}>
              {Component ? (
                <Component key={`${report!.id}-${refreshToken}`} />
              ) : (
                <Landing onOpen={navigate} onAsk={() => setAssistantOpen(true)} />
              )}
            </ReportProvider>
          </div>
          {assistantOpen && (
            <div className="w-full sm:w-[420px] xl:w-[460px] shrink-0 h-[calc(100vh-5rem)] sticky top-20">
              <AssistantPanel
                context={{
                  environment: params.environment,
                  accessToken: params.accessToken,
                  reportId: report?.id,
                  reportTitle: report?.title,
                  dateRangeKey,
                  dateRange: report && !report.usesDateRange ? undefined : params.range,
                  collectionName: report?.usesCollection ? collectionName : null,
                }}
                onClose={() => setAssistantOpen(false)}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

function Landing({ onOpen, onAsk }: { onOpen: (id: string) => void; onAsk: () => void }) {
  return (
    <div className="flex flex-col gap-6 max-w-6xl">
      <div className="rounded-lg border border-border bg-card p-5 flex flex-col md:flex-row md:items-center gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold">Live reporting over the Aprimo Analytics and Core APIs</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Every figure here is queried in real time as you, with your permissions. Pick a standard report, or open the assistant and ask in plain language. Tables export to Excel.
          </p>
        </div>
        <Button onClick={onAsk}>
          <Sparkles className="h-4 w-4 mr-2" /> Ask a question
        </Button>
      </div>
      {REPORT_GROUPS.map((g) => {
        const Icon = GROUP_ICONS[g]
        return (
          <section key={g}>
            <h3 className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5 mb-2">
              <Icon className="h-3.5 w-3.5" /> {g}
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {REPORTS.filter((r) => r.group === g).map((r) => (
                <ReportTile key={r.id} report={r} onOpen={onOpen} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function ReportTile({ report, onOpen }: { report: ReportDef; onOpen: (id: string) => void }) {
  return (
    <button onClick={() => onOpen(report.id)} className="text-left rounded-lg border border-border bg-card p-4 hover:bg-muted/50 transition-colors flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{report.title}</span>
        <span className="flex gap-1">
          {report.sources.map((s) => (
            <Badge key={s} variant="outline" className="text-[10px] px-1.5 py-0">{s}</Badge>
          ))}
        </span>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{report.description}</p>
    </button>
  )
}

export default function ReportLabsPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <Suspense
        fallback={
          <main className="flex-1 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </main>
        }
      >
        <ReportLabsContent />
      </Suspense>
      <Footer />
    </div>
  )
}
