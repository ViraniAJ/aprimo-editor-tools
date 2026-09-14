// Shared helpers for the Aprimo Analytics API (Cube-style query language).
// Used by every Report Labs report and by the assistant's server tools.

export type DateRangeKey = "7d" | "30d" | "90d" | "6m" | "1y" | "all"
export type Granularity = "day" | "week" | "month"

export const DATE_RANGE_OPTIONS: { key: DateRangeKey; label: string }[] = [
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
  { key: "6m", label: "6 months" },
  { key: "1y", label: "1 year" },
  { key: "all", label: "All time" },
]

export type DateRange = [string, string]

function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function getDateRange(key: DateRangeKey, now = new Date()): DateRange | undefined {
  if (key === "all") return undefined
  const start = new Date(now)
  if (key === "7d") start.setDate(now.getDate() - 7)
  else if (key === "30d") start.setDate(now.getDate() - 30)
  else if (key === "90d") start.setDate(now.getDate() - 90)
  else if (key === "6m") start.setMonth(now.getMonth() - 6)
  else if (key === "1y") start.setFullYear(now.getFullYear() - 1)
  return [iso(start), iso(now)]
}

/** The period of equal length immediately before `range`. */
export function getPriorRange(range: DateRange): DateRange {
  const start = new Date(range[0])
  const end = new Date(range[1])
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000))
  const priorEnd = new Date(start)
  priorEnd.setDate(priorEnd.getDate() - 1)
  const priorStart = new Date(priorEnd)
  priorStart.setDate(priorStart.getDate() - days)
  return [iso(priorStart), iso(priorEnd)]
}

export function getGranularity(key: DateRangeKey): Granularity {
  if (key === "7d" || key === "30d") return "day"
  if (key === "90d") return "week"
  return "month"
}

export function describeRange(key: DateRangeKey): string {
  return DATE_RANGE_OPTIONS.find((o) => o.key === key)?.label ?? key
}

// ── Query execution ──────────────────────────────────────────────────────────

export interface AnalyticsQuery {
  measures?: string[]
  dimensions?: string[]
  timeDimensions?: { dimension: string; granularity?: Granularity; dateRange?: DateRange | string }[]
  filters?: { member: string; operator: string; values?: string[] }[]
  order?: Record<string, "asc" | "desc">
  limit?: number
  offset?: number
}

export type AnalyticsRow = Record<string, string | number | null | undefined>

export class AnalyticsError extends Error {
  status: number
  body: string
  constructor(status: number, body: string) {
    super(`Analytics API ${status}: ${body.slice(0, 300)}`)
    this.status = status
    this.body = body
  }
}

export function analyticsBaseUrl(environment: string): string {
  return `https://${environment}.aprimo.com/analytics`
}

export async function queryAnalytics(
  environment: string,
  authHeader: string,
  query: AnalyticsQuery,
): Promise<AnalyticsRow[]> {
  const url = `${analyticsBaseUrl(environment)}/?query=${encodeURIComponent(JSON.stringify(query))}`
  const res = await fetch(url, { headers: { Authorization: authHeader } })
  if (!res.ok) throw new AnalyticsError(res.status, await res.text().catch(() => res.statusText))
  const json = await res.json()
  return (json.data ?? []) as AnalyticsRow[]
}

// ── Schema (meta) ─────────────────────────────────────────────────────────────

export interface CubeMember {
  name: string
  title?: string
  shortTitle?: string
  type?: string
  description?: string
}

export interface CubeMeta {
  name: string
  title?: string
  description?: string
  measures: CubeMember[]
  dimensions: CubeMember[]
  segments?: CubeMember[]
}

/**
 * Fetches the Analytics API schema. Cube-based APIs expose `/meta`; if this
 * environment does not, callers fall back to the members the dashboard already
 * uses (see KNOWN_CUBES).
 */
export async function fetchAnalyticsMeta(environment: string, authHeader: string): Promise<CubeMeta[]> {
  const res = await fetch(`${analyticsBaseUrl(environment)}/meta`, { headers: { Authorization: authHeader } })
  if (!res.ok) throw new AnalyticsError(res.status, await res.text().catch(() => res.statusText))
  const json = await res.json()
  const cubes = (json.cubes ?? json) as CubeMeta[]
  if (!Array.isArray(cubes)) throw new Error("Unexpected /meta response shape")
  return cubes.map((c) => ({
    name: c.name,
    title: c.title,
    description: c.description,
    measures: c.measures ?? [],
    dimensions: c.dimensions ?? [],
    segments: c.segments ?? [],
  }))
}

/** Members verified in this codebase against real environments. */
export const KNOWN_CUBES: CubeMeta[] = [
  {
    name: "Views",
    title: "Views",
    measures: [{ name: "Views.count", type: "count" }],
    dimensions: [{ name: "Views.recordId" }, { name: "Views.collectionId" }],
  },
  {
    name: "DateDimension",
    title: "Date (for Views)",
    measures: [],
    dimensions: [{ name: "DateDimension.date", type: "time" }],
  },
  {
    name: "Downloads",
    title: "Downloads",
    measures: [{ name: "Downloads.count", type: "count" }],
    dimensions: [{ name: "Downloads.recordId" }, { name: "Downloads.downloadDate", type: "time" }],
  },
  {
    name: "Impressions",
    title: "Impressions (public links)",
    measures: [{ name: "Impressions.count", type: "count" }, { name: "Impressions.totalResponseSize", type: "sum" }],
    dimensions: [
      { name: "Impressions.recordId" },
      { name: "Impressions.fileName" },
      { name: "Impressions.hitDateTime", type: "time" },
    ],
  },
  {
    name: "ImpressionTrackingTypes",
    title: "Impression tracking (UTM keys)",
    measures: [],
    dimensions: [{ name: "ImpressionTrackingTypes.queryStringKey" }],
  },
  {
    name: "ImpressionTrackingTypeValues",
    title: "Impression tracking (UTM values)",
    measures: [],
    dimensions: [{ name: "ImpressionTrackingTypeValues.value" }],
  },
  {
    name: "PreviewPlaybacks",
    title: "Plays",
    measures: [{ name: "PreviewPlaybacks.count", type: "count" }],
    dimensions: [{ name: "PreviewPlaybacks.recordId" }, { name: "PreviewPlaybacks.previewPlaybackDate", type: "time" }],
  },
  {
    name: "ContentEngagement",
    title: "Content engagement (views + downloads + plays)",
    measures: [
      { name: "ContentEngagement.viewsCount" },
      { name: "ContentEngagement.downloadsCount" },
      { name: "ContentEngagement.previewPlaybacksCount" },
    ],
    dimensions: [
      { name: "ContentEngagement.recordId" },
      { name: "ContentEngagement.collectionId" },
      { name: "ContentEngagement.date", type: "time" },
    ],
  },
  {
    name: "Users",
    title: "Users (joins to Views, Downloads, PreviewPlaybacks)",
    measures: [],
    dimensions: [{ name: "Users.loginId" }],
  },
  {
    name: "Classifications",
    title: "Classifications (joins to ContentEngagement)",
    measures: [],
    dimensions: [{ name: "Classifications.identifier" }],
  },
  {
    name: "RecordMetadata",
    title: "Record metadata (joins to ContentEngagement)",
    measures: [],
    dimensions: [{ name: "RecordMetadata.title" }],
  },
]

const metaCache = new Map<string, Promise<CubeMeta[]>>()

/** Meta with caching per environment; falls back to KNOWN_CUBES when /meta is unavailable. */
export function getAnalyticsMeta(environment: string, authHeader: string): Promise<CubeMeta[]> {
  const key = environment
  let p = metaCache.get(key)
  if (!p) {
    p = fetchAnalyticsMeta(environment, authHeader).catch(() => KNOWN_CUBES)
    metaCache.set(key, p)
  }
  return p
}

/** First dimension on `cube` whose name matches `pattern`, or undefined. */
export function findDimension(meta: CubeMeta[], cube: string, pattern: RegExp): string | undefined {
  const c = meta.find((m) => m.name === cube)
  return c?.dimensions.find((d) => pattern.test(d.name.split(".").pop() ?? d.name))?.name
}

// ── Row helpers ──────────────────────────────────────────────────────────────

export function num(v: unknown): number {
  if (typeof v === "number") return v
  const n = parseFloat(String(v ?? "0"))
  return Number.isFinite(n) ? n : 0
}

export function str(v: unknown): string {
  return v == null ? "" : String(v)
}

/** Reads a time bucket regardless of granularity suffix (`.day`, `.week`, `.month`). */
export function extractDate(row: AnalyticsRow, dim: string): string {
  return (
    str(row[`${dim}.day`]).slice(0, 10) ||
    str(row[`${dim}.week`]).slice(0, 10) ||
    str(row[`${dim}.month`]).slice(0, 10) ||
    str(row[dim]).slice(0, 10)
  )
}

/** Converts the 32-char analytics record id to the dashed GUID the Core API uses. */
export function toGuid(id: string): string {
  const clean = id.replace(/-/g, "")
  if (clean.length !== 32) return id
  return `${clean.slice(0, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}-${clean.slice(16, 20)}-${clean.slice(20)}`
}

/** Analytics ids have no dashes; normalise any id to that form for map keys. */
export function analyticsId(id: string): string {
  return id.replace(/-/g, "").toLowerCase()
}

export function pctChange(current: number, prior: number): number | null {
  if (prior === 0) return current === 0 ? 0 : null
  return ((current - prior) / prior) * 100
}

export function formatCompact(n: number | null | undefined): string {
  if (n == null) return "–"
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(n)
}

export function formatInt(n: number | null | undefined): string {
  if (n == null) return "–"
  return new Intl.NumberFormat().format(Math.round(n))
}

export function formatBytes(n: number): string {
  if (!n) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`
}

/** Fills missing buckets so line charts don't skip dates. */
export function bucketKeys(range: DateRange | undefined, granularity: Granularity, rows: string[]): string[] {
  const set = new Set(rows.filter(Boolean))
  if (!range) return Array.from(set).sort()
  const start = new Date(range[0])
  const end = new Date(range[1])
  const cur = new Date(start)
  if (granularity === "month") cur.setDate(1)
  while (cur <= end) {
    set.add(iso(cur))
    if (granularity === "day") cur.setDate(cur.getDate() + 1)
    else if (granularity === "week") cur.setDate(cur.getDate() + 7)
    else cur.setMonth(cur.getMonth() + 1)
  }
  return Array.from(set).sort()
}

export function formatBucket(date: string, granularity: Granularity): string {
  if (!date) return ""
  const d = new Date(date + "T00:00:00Z")
  if (granularity === "month") return d.toLocaleDateString(undefined, { month: "short", year: "2-digit", timeZone: "UTC" })
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })
}
