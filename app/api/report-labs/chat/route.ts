import { NextRequest } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod"
import { z } from "zod"
import { createClient, Expander } from "aprimo-js"
import { analyticsBaseUrl, getAnalyticsMeta, toGuid, type AnalyticsQuery } from "@/lib/report-labs/analytics"
import { REPORTS } from "@/lib/report-labs/registry"

// Report Labs assistant. Runs the Claude tool loop server-side with read-only
// tools over the Aprimo Analytics and Core APIs, always using the signed-in
// user's own Aprimo token so their DAM permissions apply. Streams NDJSON
// events to the browser: text deltas, tool activity, and a final done/error.

export const maxDuration = 300

const MODEL = process.env.REPORT_LABS_MODEL || "claude-opus-5"
const MAX_TOOL_ITERATIONS = 12
const MAX_ROWS_TO_MODEL = 200
const MAX_HISTORY = 30

type ChatEvent =
  | { type: "text"; text: string }
  | { type: "tool_start"; id: number; name: string; input: unknown }
  | { type: "tool_end"; id: number; name: string; ms: number; summary: string; error?: boolean }
  | { type: "done"; usage?: { input: number; output: number; cacheRead: number } }
  | { type: "error"; message: string }

const STATIC_SYSTEM = `You are the Aprimo Report Labs assistant, embedded in a reporting tool that sits on top of an Aprimo DAM environment. You answer questions about DAM usage, engagement, and library contents by querying Aprimo's APIs with the tools provided, then presenting what you found clearly.

## Rules
- You are strictly read-only. You cannot change anything in Aprimo and must never imply that you can.
- Every number you report must come from a tool result in this conversation. Never estimate or invent figures. If a query fails, say so, explain what you tried, and try an alternative if one exists.
- Always state the date range a figure covers. If the user did not specify one, use the report context's date range, and say which one you used.
- Every tool call runs as the signed-in user with their permissions. If something is not visible, say that it may be a permissions limit.
- Prefer few, well-chosen queries. Aggregate with measures instead of pulling raw rows. Keep limits small (top 10 to 25) unless the user asks for more.
- Record ids from analytics are 32-character hex strings without dashes. Resolve them to titles with get_record_titles before showing them to a user. Never show a bare id when a title is available.
- Be concise. Lead with the answer, then a compact table or chart, then one or two sentences of interpretation. No preamble about what you are going to do.

## Analytics API (Cube-style queries via query_analytics)
Cubes and members verified in this app:
- Views: measure Views.count; dimensions Views.recordId, Views.collectionId; time dimension DateDimension.date
- Downloads: measure Downloads.count; dimensions Downloads.recordId; time dimension Downloads.downloadDate
- Impressions (public links): measures Impressions.count, Impressions.totalResponseSize; dimensions Impressions.recordId, Impressions.fileName; time dimension Impressions.hitDateTime; UTM breakdown via ImpressionTrackingTypes.queryStringKey and ImpressionTrackingTypeValues.value
- PreviewPlaybacks (video plays): measure PreviewPlaybacks.count; dimension PreviewPlaybacks.recordId; time dimension PreviewPlaybacks.previewPlaybackDate
- ContentEngagement: measures ContentEngagement.viewsCount, ContentEngagement.downloadsCount, ContentEngagement.previewPlaybacksCount; dimensions ContentEngagement.recordId, ContentEngagement.collectionId, RecordMetadata.title; time dimension ContentEngagement.date; filter by classification with Classifications.identifier
- Users joins to Views, Downloads, and PreviewPlaybacks: dimension Users.loginId
Call get_analytics_schema to discover further members (for example rendition or department dimensions) before guessing names.
Query shape: {"measures":[...],"dimensions":[...],"timeDimensions":[{"dimension":"Downloads.downloadDate","granularity":"month","dateRange":["2026-01-01","2026-03-31"]}],"filters":[{"member":"Views.collectionId","operator":"equals","values":["<guid>"]}],"order":{"Downloads.count":"desc"},"limit":10}
Granularity is day, week, or month. Time-bucketed rows carry the bucket in "<dimension>.<granularity>" as well as "<dimension>". Collection filters need the dashed GUID form.

## Core API search expressions (count_records, search_records)
Syntax: property comparisons joined with AND, OR, NOT. Operators: = <> > >= < <= in contains. Dates are UTC in 'MM/DD/YYYY' quotes.
System properties: Id, Title, CreatedOn, CreatedBy, ModifiedOn, ModifiedBy, ContentStatus, ContentType, FileCount, Classification, File.Version.FileName, File.Version.FileSize, File.Version.Extension. Custom fields: FieldName("Field Name") = 'value'.
Examples: ContentType = 'Video' | CreatedOn >= '01/01/2026' AND CreatedOn < '02/01/2026' | FileCount = 0 | File.Version.Extension = 'pdf' | Title contains 'summer'
Match everything with: NOT id = ''

## Presenting results
- Use GitHub-flavoured markdown tables for lists. Right-align numbers by putting them in their own column.
- For a trend or a ranking, add a chart as a fenced code block with language "chart" containing JSON:
  {"type":"line","title":"Downloads per month","x":"month","series":[{"key":"downloads","label":"Downloads"}],"data":[{"month":"Jan 26","downloads":120}]}
  or {"type":"bar","title":"Top assets by views","x":"label","series":[{"key":"value","label":"Views"}],"data":[{"label":"Hero banner","value":342}]}
  Bar charts rank horizontally; keep them to 12 rows or fewer. Line charts may carry up to 4 series.
- End with at most one short suggested follow-up question when it would genuinely help.`

function summarize(v: unknown): string {
  try {
    const s = JSON.stringify(v)
    return s.length > 160 ? s.slice(0, 157) + "…" : s
  } catch {
    return String(v)
  }
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return Response.json(
      { error: "not_configured", message: "ANTHROPIC_API_KEY is not set on the server. Add it to the Vercel project and redeploy to enable the assistant." },
      { status: 503 },
    )
  }

  let body: {
    environment?: string
    token?: string
    messages?: { role: "user" | "assistant"; content: string }[]
    context?: { reportId?: string; dateRangeKey?: string; dateRange?: [string, string] | null; collectionName?: string | null }
  }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: "bad_request", message: "Invalid JSON body" }, { status: 400 })
  }
  const { environment, token, messages, context } = body
  if (!environment || !token || !Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: "bad_request", message: "Missing environment, token, or messages" }, { status: 400 })
  }
  if (!/^[a-z0-9-]+$/i.test(environment)) {
    return Response.json({ error: "bad_request", message: "Invalid environment" }, { status: 400 })
  }

  const authHeader = `Bearer ${token}`
  const aprimo = createClient({ type: "custom", environment, tokenProvider: async () => token })
  const anthropic = new Anthropic({ apiKey })

  const encoder = new TextEncoder()
  let toolSeq = 0

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (e: ChatEvent) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"))
        } catch {
          /* client gone */
        }
      }

      const traced = <I, O>(name: string, fn: (input: I) => Promise<O>) => async (input: I): Promise<string> => {
        const id = ++toolSeq
        const started = Date.now()
        emit({ type: "tool_start", id, name, input })
        try {
          const out = await fn(input)
          const text = typeof out === "string" ? out : JSON.stringify(out)
          emit({ type: "tool_end", id, name, ms: Date.now() - started, summary: summarize(out) })
          return text
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          emit({ type: "tool_end", id, name, ms: Date.now() - started, summary: msg, error: true })
          return `ERROR: ${msg}`
        }
      }

      // ── Tools (all read-only) ─────────────────────────────────────────────
      const getAnalyticsSchema = betaZodTool({
        name: "get_analytics_schema",
        description: "Lists every cube with its measures and dimensions from the Analytics API schema. Call this before using a member name that is not in the verified list.",
        inputSchema: z.object({ cube: z.string().optional().describe("Return only this cube, e.g. Downloads") }),
        run: traced("get_analytics_schema", async ({ cube }) => {
          const meta = await getAnalyticsMeta(environment, authHeader)
          const cubes = cube ? meta.filter((c) => c.name.toLowerCase() === cube.toLowerCase()) : meta
          return cubes.map((c) => ({ cube: c.name, measures: c.measures.map((m) => m.name), dimensions: c.dimensions.map((d) => `${d.name}${d.type ? ` (${d.type})` : ""}`) }))
        }),
      })

      const queryAnalyticsTool = betaZodTool({
        name: "query_analytics",
        description: "Runs one Analytics API query. Returns up to 200 rows. Use measures for aggregates, dimensions to group, timeDimensions for date ranges and time buckets, filters to restrict, order and limit to rank.",
        inputSchema: z.object({
          measures: z.array(z.string()).optional(),
          dimensions: z.array(z.string()).optional(),
          timeDimensions: z
            .array(z.object({ dimension: z.string(), granularity: z.enum(["day", "week", "month"]).optional(), dateRange: z.array(z.string()).length(2).optional() }))
            .optional(),
          filters: z.array(z.object({ member: z.string(), operator: z.string(), values: z.array(z.string()).optional() })).optional(),
          order: z.record(z.string(), z.enum(["asc", "desc"])).optional(),
          limit: z.number().int().min(1).max(2000).optional(),
        }),
        run: traced("query_analytics", async (input) => {
          const q: AnalyticsQuery = {
            ...input,
            timeDimensions: input.timeDimensions?.map((t) => ({ ...t, dateRange: t.dateRange as [string, string] | undefined })),
            limit: Math.min(input.limit ?? 100, 2000),
          }
          const url = `${analyticsBaseUrl(environment)}/?query=${encodeURIComponent(JSON.stringify(q))}`
          const res = await fetch(url, { headers: { Authorization: authHeader } })
          if (!res.ok) throw new Error(`Analytics API ${res.status}: ${(await res.text()).slice(0, 400)}`)
          const json = await res.json()
          const rows = (json.data ?? []) as unknown[]
          return { rowCount: rows.length, truncated: rows.length > MAX_ROWS_TO_MODEL, rows: rows.slice(0, MAX_ROWS_TO_MODEL) }
        }),
      })

      const countRecords = betaZodTool({
        name: "count_records",
        description: "Counts DAM records matching an Aprimo search expression. Cheap; use it for totals and breakdowns by running several expressions.",
        inputSchema: z.object({ expression: z.string().describe("Aprimo search expression, e.g. ContentType = 'Image' AND CreatedOn >= '01/01/2026'") }),
        run: traced("count_records", async ({ expression }) => {
          const res = await aprimo.search.records({ searchExpression: { expression }, page: 1, pageSize: 1 } as never)
          if (!res.ok) throw new Error((res as { error?: { message?: string } }).error?.message ?? "Search failed")
          return { expression, totalCount: (res.data as unknown as { totalCount?: number })?.totalCount ?? 0 }
        }),
      })

      const searchRecords = betaZodTool({
        name: "search_records",
        description: "Searches DAM records by expression and returns basic details for up to 50 records: id, title, content type, status, created and modified dates, file name and size.",
        inputSchema: z.object({ expression: z.string(), pageSize: z.number().int().min(1).max(50).optional(), page: z.number().int().min(1).optional() }),
        run: traced("search_records", async ({ expression, pageSize, page }) => {
          const expander = Expander.create()
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .for<any>("Record")
            .expand("masterfilelatestversion")
          const res = await aprimo.search.records({ searchExpression: { expression }, page: page ?? 1, pageSize: pageSize ?? 20 } as never, expander as never)
          if (!res.ok) throw new Error((res as { error?: { message?: string } }).error?.message ?? "Search failed")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const data = res.data as unknown as { items?: any[]; totalCount?: number }
          return {
            totalCount: data.totalCount ?? 0,
            items: (data.items ?? []).map((r) => ({
              id: r.id,
              title: r.title,
              contentType: r.contentType,
              status: r.status,
              createdOn: r.createdOn,
              modifiedOn: r.modifiedOn,
              fileName: r._embedded?.masterfilelatestversion?.fileName,
              fileSize: r._embedded?.masterfilelatestversion?.fileSize,
            })),
          }
        }),
      })

      const getRecordTitles = betaZodTool({
        name: "get_record_titles",
        description: "Resolves analytics record ids (32-char hex, no dashes) or GUIDs to titles and content types. Up to 50 ids per call.",
        inputSchema: z.object({ ids: z.array(z.string()).min(1).max(50) }),
        run: traced("get_record_titles", async ({ ids }) => {
          const out: Array<{ id: string; title?: string; contentType?: string; error?: string }> = []
          const queue = [...ids]
          const workers = Array.from({ length: 5 }, async () => {
            while (queue.length) {
              const id = queue.shift()!
              try {
                const res = await aprimo.records.getById(toGuid(id))
                if (res.ok) {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const r = res.data as any
                  out.push({ id, title: r.title, contentType: r.contentType })
                } else out.push({ id, error: "not found or no permission" })
              } catch (e) {
                out.push({ id, error: e instanceof Error ? e.message : String(e) })
              }
            }
          })
          await Promise.all(workers)
          return out
        }),
      })

      const listContentTypes = betaZodTool({
        name: "list_content_types",
        description: "Lists the content types defined in this environment.",
        inputSchema: z.object({}),
        run: traced("list_content_types", async () => {
          const names: string[] = []
          for await (const page of aprimo.contentTypes.getPaged({ pageSize: 1000 })) {
            if (!page.ok) break
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            for (const ct of (page.data?.items ?? []) as any[]) names.push(ct.name)
          }
          return names.sort()
        }),
      })

      const listCollections = betaZodTool({
        name: "list_collections",
        description: "Lists collections with their ids (dashed GUIDs) and types. Use the id in Views.collectionId or ContentEngagement.collectionId filters.",
        inputSchema: z.object({ nameContains: z.string().optional() }),
        run: traced("list_collections", async ({ nameContains }) => {
          const out: Array<{ id: string; name: string; type?: string }> = []
          for await (const page of aprimo.collections.getPaged({ pageSize: 1000 })) {
            if (!page.ok) break
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            for (const c of (page.data?.items ?? []) as any[]) out.push({ id: c.id, name: c.name, type: c.type })
          }
          const f = nameContains?.toLowerCase()
          return (f ? out.filter((c) => c.name.toLowerCase().includes(f)) : out).slice(0, 200)
        }),
      })

      // ── Dynamic context (kept out of the cached prefix) ───────────────────
      const report = REPORTS.find((r) => r.id === context?.reportId)
      const today = new Date().toISOString().slice(0, 10)
      const dynamic = [
        `Today is ${today}. Aprimo environment: ${environment}.`,
        report ? `The user is looking at the "${report.title}" report: ${report.description}` : "The user is on the Report Labs landing page.",
        context?.dateRange ? `The report date range is ${context.dateRange[0]} to ${context.dateRange[1]} (${context.dateRangeKey}).` : "The report date range is all time.",
        context?.collectionName ? `The reports are scoped to the collection "${context.collectionName}".` : "",
        `Available standard reports: ${REPORTS.map((r) => r.title).join(", ")}. When a standard report answers the question, mention it by name.`,
      ]
        .filter(Boolean)
        .join("\n")

      const history = messages.slice(-MAX_HISTORY).map((m) => ({ role: m.role, content: m.content }))

      try {
        const runner = anthropic.beta.messages.toolRunner({
          model: MODEL,
          max_tokens: 8000,
          system: [
            { type: "text", text: STATIC_SYSTEM, cache_control: { type: "ephemeral" } },
            { type: "text", text: dynamic },
          ],
          messages: history,
          tools: [getAnalyticsSchema, queryAnalyticsTool, countRecords, searchRecords, getRecordTitles, listContentTypes, listCollections],
          max_iterations: MAX_TOOL_ITERATIONS,
          stream: true,
        })

        let usage = { input: 0, output: 0, cacheRead: 0 }
        for await (const messageStream of runner) {
          for await (const event of messageStream) {
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") emit({ type: "text", text: event.delta.text })
          }
          const msg = await messageStream.finalMessage()
          usage = {
            input: usage.input + (msg.usage.input_tokens ?? 0),
            output: usage.output + (msg.usage.output_tokens ?? 0),
            cacheRead: usage.cacheRead + (msg.usage.cache_read_input_tokens ?? 0),
          }
          if (msg.stop_reason === "pause_turn") runner.pushMessages({ role: "assistant", content: msg.content })
          if (msg.stop_reason === "refusal") emit({ type: "text", text: "\n\nI can't help with that request." })
        }
        emit({ type: "done", usage })
      } catch (e) {
        let message = e instanceof Error ? e.message : String(e)
        if (e instanceof Anthropic.AuthenticationError) message = "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY on the server."
        else if (e instanceof Anthropic.RateLimitError) message = "The Anthropic API is rate limiting requests. Try again in a moment."
        else if (e instanceof Anthropic.APIError) message = `Anthropic API error ${e.status}: ${e.message}`
        emit({ type: "error", message })
      } finally {
        try {
          controller.close()
        } catch {
          /* already closed */
        }
      }
    },
  })

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" },
  })
}
