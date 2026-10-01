"use client"

import { Settings } from "lucide-react"
import { useAprimo } from "@/context/aprimo-context"
import { openConnectionManager } from "@/lib/profiles"
import { Button } from "@/components/ui/button"
import { LanguagePicker } from "@/components/language-picker"
import { useSearchParams } from "next/navigation"


export function AprimoSettingsBar() {
  const { connection, isConnected } = useAprimo()
  const searchParams = useSearchParams()

  if (searchParams.get("embed") === "1") return null

  return (
    <div className="fixed top-3 right-4 z-50 flex items-center gap-2">
      {connection?.environment && (
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-mono font-medium border ${isConnected ? "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-400 dark:border-green-800" : "bg-muted text-muted-foreground border-border"}`}>
          {connection.environment}
        </span>
      )}
      <LanguagePicker />
      {isConnected && (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          title="Switch or add environments"
          onClick={openConnectionManager}
        >
          <Settings className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}
