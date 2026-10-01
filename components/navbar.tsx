"use client"

import { Wifi, WifiOff, Settings } from "lucide-react"
import Link from "next/link"
import { useAprimo } from "@/context/aprimo-context"
import { openConnectionManager } from "@/lib/profiles"
import { Badge } from "@/components/ui/badge"
import { AprimoLogo } from "@/components/aprimo-logo"
import { ModeToggle } from "@/components/mode-toggle"
import { BrandToggle } from "@/components/brand-toggle"


export function Navbar() {
  const { isConnected, connection } = useAprimo()

  return (
    <nav className="bg-card sticky top-0 z-50">
      <div className="border-b border-border px-6">
        <div className="flex items-center justify-between h-20">
          <Link href="/" className="py-2">
            <AprimoLogo />
          </Link>

          <div className="flex items-center gap-6 text-sm">
            {isConnected ? (
              <button onClick={openConnectionManager} title="Switch environment">
                <Badge variant="outline" className="flex items-center gap-1.5 border-success text-success hover:bg-success/10 transition-colors cursor-pointer">
                  <Wifi className="h-3 w-3" />
                  {connection?.environment}
                </Badge>
              </button>
            ) : (
              <Badge variant="outline" className="flex items-center gap-1.5 border-muted-foreground text-muted-foreground">
                <WifiOff className="h-3 w-3" />
                Disconnected
              </Badge>
            )}
            {isConnected && (
              <button
                onClick={openConnectionManager}
                className="text-muted-foreground hover:text-foreground transition-colors"
                title="Switch or add environments"
              >
                <Settings className="h-4 w-4" />
              </button>
            )}
            <BrandToggle />
            <ModeToggle />
          </div>
        </div>
      </div>

    </nav>
  )
}
