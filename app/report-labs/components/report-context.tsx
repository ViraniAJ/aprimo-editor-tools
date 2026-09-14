"use client"

import { createContext, useContext } from "react"
import type { AprimoClient, CollectionInfo } from "@/lib/report-labs/core"
import type { DateRange, DateRangeKey, Granularity } from "@/lib/report-labs/analytics"

export interface ReportParams {
  environment: string
  authHeader: string
  accessToken: string
  client: AprimoClient
  dateRangeKey: DateRangeKey
  range: DateRange | undefined
  priorRange: DateRange | undefined
  granularity: Granularity
  collectionId: string | null
  collections: CollectionInfo[]
  /** Increments on every refresh click so reports can re-run. */
  refreshToken: number
}

const ReportContext = createContext<ReportParams | null>(null)

export const ReportProvider = ReportContext.Provider

export function useReportParams(): ReportParams {
  const ctx = useContext(ReportContext)
  if (!ctx) throw new Error("useReportParams must be used inside ReportProvider")
  return ctx
}
