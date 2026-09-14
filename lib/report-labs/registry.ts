// The catalogue of Report Labs reports. The page shell, the landing grid, and
// the assistant's system prompt all read from this single list.

export type ReportGroup = "Engagement" | "Library" | "Reference"

export interface ReportDef {
  id: string
  title: string
  group: ReportGroup
  description: string
  /** Which Aprimo APIs it reads. Shown as badges and told to the assistant. */
  sources: ("Analytics" | "Core")[]
  /** Whether the global date range applies. */
  usesDateRange: boolean
  /** Whether the collection scope applies. */
  usesCollection?: boolean
}

export const REPORTS: ReportDef[] = [
  {
    id: "executive-overview",
    title: "Executive Overview",
    group: "Engagement",
    description: "Headline engagement for the period with change versus the prior period, the activity trend, and the top assets.",
    sources: ["Analytics", "Core"],
    usesDateRange: true,
    usesCollection: true,
  },
  {
    id: "asset-performance",
    title: "Asset Performance",
    group: "Engagement",
    description: "Ranked assets by views, downloads, impressions, or plays, with share of total and links into the DAM.",
    sources: ["Analytics", "Core"],
    usesDateRange: true,
    usesCollection: true,
  },
  {
    id: "zero-engagement",
    title: "Zero Engagement",
    group: "Engagement",
    description: "How much of the library saw no views or downloads in the period, and which recent assets are going unused.",
    sources: ["Analytics", "Core"],
    usesDateRange: true,
  },
  {
    id: "user-adoption",
    title: "User Adoption",
    group: "Engagement",
    description: "Active users over time, the most active people, and where usage concentrates.",
    sources: ["Analytics"],
    usesDateRange: true,
  },
  {
    id: "public-link-traffic",
    title: "Public Link Traffic",
    group: "Engagement",
    description: "Impressions and bandwidth served through public links, by file and by UTM campaign parameter.",
    sources: ["Analytics", "Core"],
    usesDateRange: true,
  },
  {
    id: "format-demand",
    title: "Format Demand",
    group: "Engagement",
    description: "Which renditions, crops, and versions people actually download. Useful for deciding what to pre-generate.",
    sources: ["Analytics"],
    usesDateRange: true,
  },
  {
    id: "video-performance",
    title: "Video Performance",
    group: "Engagement",
    description: "Preview plays over time, the most played assets, and the most engaged viewers.",
    sources: ["Analytics", "Core"],
    usesDateRange: true,
  },
  {
    id: "library-composition",
    title: "Library Composition",
    group: "Library",
    description: "Records by content type, and how many carry files. A snapshot of what the DAM holds today.",
    sources: ["Core"],
    usesDateRange: false,
  },
  {
    id: "library-growth",
    title: "Library Growth",
    group: "Library",
    description: "Records created per month over the last year with the running total, plus recent activity.",
    sources: ["Core"],
    usesDateRange: false,
  },
  {
    id: "content-freshness",
    title: "Content Freshness",
    group: "Library",
    description: "Age of the library by last modification. Finds stale content that may need review or archiving.",
    sources: ["Core"],
    usesDateRange: false,
  },
  {
    id: "data-model",
    title: "Analytics Data Model",
    group: "Reference",
    description: "Every cube, measure, and dimension the Analytics API exposes in this environment. The map the assistant navigates by.",
    sources: ["Analytics"],
    usesDateRange: false,
  },
]

export const REPORT_GROUPS: ReportGroup[] = ["Engagement", "Library", "Reference"]

export function getReport(id: string | null | undefined): ReportDef | undefined {
  return REPORTS.find((r) => r.id === id)
}
