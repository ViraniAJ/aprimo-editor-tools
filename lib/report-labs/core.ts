// Helpers over the Aprimo DAM Core API (via the aprimo-js SDK) used by
// Report Labs inventory reports and by the assistant's server tools.

import { Expander, AprimoRateLimitError, type createClient } from "aprimo-js"
import { toGuid, analyticsId } from "./analytics"

export type AprimoClient = ReturnType<typeof createClient>

/** Aprimo search expressions take UTC dates as 'MM/DD/YYYY'. */
export function dateLiteral(d: Date): string {
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(d.getUTCDate()).padStart(2, "0")
  return `'${mm}/${dd}/${d.getUTCFullYear()}'`
}

export function escapeExpr(s: string): string {
  return s.replace(/'/g, "''")
}

export const ALL_RECORDS_EXPRESSION = "NOT id = ''"

export async function countRecords(client: AprimoClient, expression: string): Promise<number> {
  const res = await client.search.records({ searchExpression: { expression }, page: 1, pageSize: 1 } as never)
  if (!res.ok) throw new Error((res as { error?: { message?: string } }).error?.message ?? "Search failed")
  const data = res.data as unknown as { totalCount?: number }
  return data?.totalCount ?? 0
}

export interface RecordCard {
  id: string // dashed GUID
  key: string // analytics-style id (no dashes)
  title: string
  contentType?: string
  status?: string
  createdOn?: string
  modifiedOn?: string
  thumbnail?: string
  fileName?: string
  fileSize?: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toCard(rec: any): RecordCard {
  const mflv = rec._embedded?.masterfilelatestversion
  return {
    id: rec.id,
    key: analyticsId(rec.id),
    title: rec.title || rec.id,
    contentType: rec.contentType,
    status: rec.status,
    createdOn: rec.createdOn,
    modifiedOn: rec.modifiedOn,
    thumbnail: mflv?._embedded?.thumbnail?.uri,
    fileName: mflv?.fileName,
    fileSize: mflv?.fileSize,
  }
}

const cardExpander = () =>
  Expander.create()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .for<any>("Record")
    .expand("masterfilelatestversion")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .for<any>("FileVersion")
    .expand("thumbnail")

export async function searchRecordCards(
  client: AprimoClient,
  expression: string,
  pageSize = 50,
  page = 1,
): Promise<{ items: RecordCard[]; totalCount: number }> {
  const res = await client.search.records(
    { searchExpression: { expression }, page, pageSize } as never,
    cardExpander() as never,
  )
  if (!res.ok) throw new Error((res as { error?: { message?: string } }).error?.message ?? "Search failed")
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = res.data as unknown as { items?: any[]; totalCount?: number }
  return { items: (data.items ?? []).map(toCard), totalCount: data.totalCount ?? 0 }
}

async function throttled<T>(tasks: Array<() => Promise<T>>, concurrency: number): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length)
  let next = 0
  async function run() {
    while (next < tasks.length) {
      const i = next++
      try {
        results[i] = { status: "fulfilled", value: await tasks[i]() }
      } catch (reason) {
        results[i] = { status: "rejected", reason }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, run))
  return results
}

/** Runs many independent async tasks with bounded concurrency. */
export const runThrottled = throttled

/**
 * Resolves titles and thumbnails for analytics record ids. Throttled to avoid
 * 429s and retried on rate limit using the server's retry-after hint.
 */
export async function fetchRecordCards(client: AprimoClient, ids: string[]): Promise<Map<string, RecordCard>> {
  const unique = Array.from(new Set(ids.map(analyticsId))).filter(Boolean)
  const results = await throttled(
    unique.map((id) => async () => {
      for (let attempt = 0; attempt < 4; attempt++) {
        const res = await client.records.getById(toGuid(id), cardExpander() as never)
        if (res.ok) return res.data
        if (!(res.error instanceof AprimoRateLimitError)) return null
        const hint = parseInt(String((res.error as AprimoRateLimitError).retryAfter ?? "0"), 10)
        await new Promise((r) => setTimeout(r, (hint > 0 ? hint : Math.pow(2, attempt)) * 1000))
      }
      return null
    }),
    5,
  )
  const map = new Map<string, RecordCard>()
  results.forEach((r, i) => {
    if (r.status === "fulfilled" && r.value) map.set(unique[i], toCard(r.value))
  })
  return map
}

export interface ContentTypeInfo {
  id: string
  name: string
}

export async function listContentTypes(client: AprimoClient): Promise<ContentTypeInfo[]> {
  const out: ContentTypeInfo[] = []
  for await (const page of client.contentTypes.getPaged({ pageSize: 1000 })) {
    if (!page.ok) break
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const ct of (page.data?.items ?? []) as any[]) out.push({ id: ct.id, name: ct.name })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

export interface CollectionInfo {
  id: string
  name: string
  type?: string
}

export async function listCollections(client: AprimoClient): Promise<CollectionInfo[]> {
  const out: CollectionInfo[] = []
  for await (const page of client.collections.getPaged({ pageSize: 1000 })) {
    if (!page.ok) break
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const c of (page.data?.items ?? []) as any[]) out.push({ id: c.id, name: c.name, type: c.type })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

export function damRecordUrl(environment: string, id: string): string {
  return `https://${environment}.dam.aprimo.com/dam/records/${toGuid(id)}`
}
