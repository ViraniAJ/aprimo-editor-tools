"use client"

import { ExternalLink, FileImage } from "lucide-react"
import type { RecordCard } from "@/lib/report-labs/core"
import { damRecordUrl } from "@/lib/report-labs/core"

/** Thumbnail + title + DAM link for a record resolved from an analytics id. */
export function RecordCell({
  card,
  fallbackId,
  environment,
}: {
  card?: RecordCard
  fallbackId: string
  environment: string
}) {
  const title = card?.title ?? `${fallbackId.slice(0, 8)}…`
  return (
    <a
      href={damRecordUrl(environment, card?.id ?? fallbackId)}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 min-w-0 group"
      title={card?.title ?? fallbackId}
    >
      <span className="h-9 w-9 rounded bg-muted overflow-hidden shrink-0 flex items-center justify-center">
        {card?.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.thumbnail} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <FileImage className="h-4 w-4 text-muted-foreground" />
        )}
      </span>
      <span className="min-w-0 flex flex-col">
        <span className={`truncate max-w-[280px] group-hover:underline ${card ? "" : "font-mono text-xs"}`}>{title}</span>
        {card?.contentType && <span className="text-[11px] text-muted-foreground truncate">{card.contentType}</span>}
      </span>
      <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0" />
    </a>
  )
}
