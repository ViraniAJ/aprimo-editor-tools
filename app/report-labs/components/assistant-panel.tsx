"use client"

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Bot, Check, ChevronDown, ChevronRight, KeyRound, Loader2, Send, Sparkles, Square, Trash2, X, TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { RankedBars, TrendChart } from "./charts"
import type { DateRange, DateRangeKey } from "@/lib/report-labs/analytics"

interface ToolEvent {
  id: number
  name: string
  input?: unknown
  summary?: string
  ms?: number
  error?: boolean
  done: boolean
}

interface ChatMessage {
  role: "user" | "assistant"
  content: string
  tools?: ToolEvent[]
  error?: string
}

export interface AssistantContext {
  environment: string
  accessToken: string
  reportId?: string
  reportTitle?: string
  dateRangeKey: DateRangeKey
  dateRange: DateRange | undefined
  collectionName?: string | null
}

const SUGGESTIONS = [
  "Which assets were downloaded most in the last 30 days, and by whom?",
  "How many records were created this year, broken down by content type?",
  "Show me monthly downloads for the last 6 months as a chart.",
  "Which collections got the most views in the period?",
  "What share of the library has never been downloaded?",
  "Which UTM campaigns drove the most public link impressions?",
]

// ── Chart fence renderer ─────────────────────────────────────────────────────

const CHART_COLORS = ["--rl-1", "--rl-2", "--rl-3", "--rl-4"]

function ChartBlock({ source }: { source: string }) {
  let spec: { type?: string; title?: string; x?: string; series?: { key: string; label?: string }[]; data?: Record<string, unknown>[] } | null = null
  try {
    spec = JSON.parse(source)
  } catch {
    return <pre className="text-xs whitespace-pre-wrap">{source}</pre>
  }
  if (!spec || !Array.isArray(spec.data) || !spec.data.length) return null
  const x = spec.x ?? "label"
  const series = (spec.series ?? [{ key: "value", label: "Value" }]).slice(0, 4)
  return (
    <div className="my-2 rounded-md border border-border bg-card p-3">
      {spec.title && <div className="text-xs font-medium mb-2">{spec.title}</div>}
      {spec.type === "line" ? (
        <TrendChart
          data={spec.data.map((d) => ({ ...d, date: String(d[x] ?? "") })) as Array<Record<string, number | string>>}
          granularity="month"
          height={200}
          series={series.map((s, i) => ({ key: s.key, label: s.label ?? s.key, colorVar: CHART_COLORS[i] }))}
        />
      ) : (
        <RankedBars
          data={spec.data.slice(0, 12).map((d) => ({ label: String(d[x] ?? ""), value: Number(d[series[0].key] ?? 0) }))}
          colorVar="--rl-seq"
          labelWidth={130}
        />
      )}
    </div>
  )
}

function Markdown({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        code({ className, children, ...props }: any) {
          const lang = /language-(\w+)/.exec(className ?? "")?.[1]
          const raw = String(children ?? "").replace(/\n$/, "")
          if (lang === "chart") return <ChartBlock source={raw} />
          if (props.inline || !raw.includes("\n")) return <code className="rounded bg-muted px-1 py-0.5 text-[12px] font-mono">{raw}</code>
          return (
            <pre className="my-2 overflow-x-auto rounded-md bg-muted p-2 text-[12px] font-mono">
              <code>{raw}</code>
            </pre>
          )
        },
        table({ children }) {
          return (
            <div className="my-2 overflow-x-auto rounded-md border border-border">
              <table className="w-full text-xs">{children}</table>
            </div>
          )
        },
        thead({ children }) {
          return <thead className="bg-muted/50 text-muted-foreground">{children}</thead>
        },
        th({ children, style }) {
          return <th className="px-2 py-1.5 text-left font-medium" style={style}>{children}</th>
        },
        td({ children, style }) {
          return <td className="px-2 py-1.5 border-t border-border align-top" style={style}>{children}</td>
        },
        p({ children }) {
          return <p className="my-1.5 leading-relaxed">{children}</p>
        },
        ul({ children }) {
          return <ul className="my-1.5 list-disc pl-5 space-y-0.5">{children}</ul>
        },
        ol({ children }) {
          return <ol className="my-1.5 list-decimal pl-5 space-y-0.5">{children}</ol>
        },
        h1({ children }) {
          return <h3 className="mt-3 mb-1 font-semibold">{children}</h3>
        },
        h2({ children }) {
          return <h3 className="mt-3 mb-1 font-semibold">{children}</h3>
        },
        h3({ children }) {
          return <h4 className="mt-2 mb-1 font-medium">{children}</h4>
        },
        a({ children, href }) {
          return (
            <a href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
              {children}
            </a>
          )
        },
      }}
    >
      {text}
    </ReactMarkdown>
  )
}

function ToolTrace({ tools }: { tools: ToolEvent[] }) {
  const [open, setOpen] = useState(false)
  if (!tools.length) return null
  const running = tools.some((t) => !t.done)
  return (
    <div className="mb-2 text-xs">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {running ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
        {tools.length} {tools.length === 1 ? "query" : "queries"}
        {running ? " running" : ""}
      </button>
      {open && (
        <ul className="mt-1 space-y-1 border-l border-border pl-2">
          {tools.map((t) => (
            <li key={t.id} className="font-mono break-all">
              <span className={t.error ? "text-destructive" : ""}>{t.name}</span>
              {t.input !== undefined && <span className="text-muted-foreground"> {JSON.stringify(t.input).slice(0, 200)}</span>}
              {t.done && (
                <span className="text-muted-foreground">
                  {" "}→ {t.summary?.slice(0, 160)} {t.ms != null ? `(${t.ms} ms)` : ""}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Panel ────────────────────────────────────────────────────────────────────

export function AssistantPanel({ context, onClose, embedded }: { context: AssistantContext; onClose?: () => void; embedded?: boolean }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const [setupRequired, setSetupRequired] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages])

  const send = useCallback(
    async (text: string) => {
      const q = text.trim()
      if (!q || busy) return
      setInput("")
      const history = [...messages, { role: "user" as const, content: q }]
      setMessages([...history, { role: "assistant", content: "", tools: [] }])
      setBusy(true)
      const ac = new AbortController()
      abortRef.current = ac
      try {
        const res = await fetch("/api/report-labs/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: ac.signal,
          body: JSON.stringify({
            environment: context.environment,
            token: context.accessToken,
            messages: history.map((m) => ({ role: m.role, content: m.content })),
            context: {
              reportId: context.reportId,
              dateRangeKey: context.dateRangeKey,
              dateRange: context.dateRange ?? null,
              collectionName: context.collectionName ?? null,
            },
          }),
        })
        if (res.status === 503) {
          const j = await res.json().catch(() => ({}))
          setSetupRequired(j.message ?? "The assistant is not configured on this deployment.")
          setMessages(history)
          return
        }
        if (!res.ok || !res.body) {
          const j = await res.json().catch(() => ({}))
          throw new Error(j.message ?? `Request failed (${res.status})`)
        }
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buf = ""
        const update = (fn: (m: ChatMessage) => ChatMessage) =>
          setMessages((prev) => {
            const next = [...prev]
            next[next.length - 1] = fn(next[next.length - 1])
            return next
          })
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          let nl: number
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl).trim()
            buf = buf.slice(nl + 1)
            if (!line) continue
            let ev: { type: string; [k: string]: unknown }
            try {
              ev = JSON.parse(line)
            } catch {
              continue
            }
            if (ev.type === "text") update((m) => ({ ...m, content: m.content + String(ev.text) }))
            else if (ev.type === "tool_start")
              update((m) => ({ ...m, tools: [...(m.tools ?? []), { id: Number(ev.id), name: String(ev.name), input: ev.input, done: false }] }))
            else if (ev.type === "tool_end")
              update((m) => ({
                ...m,
                tools: (m.tools ?? []).map((t) => (t.id === Number(ev.id) ? { ...t, done: true, summary: String(ev.summary ?? ""), ms: Number(ev.ms), error: !!ev.error } : t)),
              }))
            else if (ev.type === "error") update((m) => ({ ...m, error: String(ev.message) }))
          }
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          const msg = e instanceof Error ? e.message : String(e)
          setMessages((prev) => {
            const next = [...prev]
            next[next.length - 1] = { ...next[next.length - 1], error: msg }
            return next
          })
        }
      } finally {
        setBusy(false)
        abortRef.current = null
      }
    },
    [busy, messages, context],
  )

  const stop = () => abortRef.current?.abort()
  const clear = () => {
    stop()
    setMessages([])
  }

  const header: ReactNode = (
    <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
      <div className="flex items-center gap-2 min-w-0">
        <Sparkles className="h-4 w-4 text-primary shrink-0" />
        <div className="min-w-0">
          <div className="text-sm font-medium leading-tight">Ask Report Labs</div>
          <div className="text-[11px] text-muted-foreground truncate">
            {context.reportTitle ? `Context: ${context.reportTitle}` : "Ask anything about usage or the library"}
            {context.dateRange ? ` · ${context.dateRange[0]} to ${context.dateRange[1]}` : " · all time"}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {messages.length > 0 && (
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={clear} title="Clear conversation">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
        {onClose && (
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onClose} title="Close">
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )

  return (
    <div className={`flex flex-col bg-card ${embedded ? "h-full" : "h-full border-l border-border"}`}>
      {header}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 text-sm">
        {setupRequired && (
          <div className="rounded-md border border-border bg-muted/40 p-3 text-xs flex gap-2">
            <KeyRound className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <div className="font-medium mb-1">Assistant not configured</div>
              <p className="text-muted-foreground">{setupRequired}</p>
              <p className="text-muted-foreground mt-1">The standard reports work without it. Once the key is set, this panel answers questions with live queries against Aprimo.</p>
            </div>
          </div>
        )}
        {messages.length === 0 && !setupRequired && (
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-2 text-muted-foreground">
              <Bot className="h-4 w-4 mt-0.5 shrink-0" />
              <p className="text-xs leading-relaxed">
                I query the Aprimo Analytics and Core APIs as you, read-only, and show the numbers with tables and charts. Try one of these, or ask your own question.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)} className="text-left text-xs rounded-md border border-border px-3 py-2 hover:bg-muted transition-colors">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex flex-col gap-4">
          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="self-end max-w-[85%] rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm whitespace-pre-wrap">
                {m.content}
              </div>
            ) : (
              <div key={i} className="max-w-full min-w-0">
                {m.tools && <ToolTrace tools={m.tools} />}
                {m.content ? (
                  <div className="prose-sm max-w-none break-words">
                    <Markdown text={m.content} />
                  </div>
                ) : busy && i === messages.length - 1 && !m.error ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> Thinking…
                  </div>
                ) : null}
                {m.error && (
                  <div className="mt-2 flex items-start gap-2 text-xs text-destructive bg-destructive/10 rounded-md px-2 py-1.5">
                    <TriangleAlert className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>{m.error}</span>
                  </div>
                )}
              </div>
            ),
          )}
        </div>
      </div>
      <form
        className="border-t border-border p-3 flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          send(input)
        }}
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              send(input)
            }
          }}
          rows={2}
          placeholder={setupRequired ? "Assistant unavailable until the API key is configured" : "Ask about usage, assets, users, or the library…"}
          disabled={!!setupRequired}
          className="flex-1 resize-none rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
        />
        {busy ? (
          <Button type="button" variant="outline" size="sm" className="h-9" onClick={stop} title="Stop">
            <Square className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button type="submit" size="sm" className="h-9" disabled={!input.trim() || !!setupRequired} title="Send">
            <Send className="h-3.5 w-3.5" />
          </Button>
        )}
      </form>
    </div>
  )
}
