"use client"

import { useState, useEffect, useRef } from "react"
import { useAprimo } from "@/context/aprimo-context"
import { generatePKCE, buildAuthorizationUrl } from "@/lib/pkce"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Pencil, Trash2, Plus, ArrowLeft } from "lucide-react"
import {
  type ConnectionProfile,
  DEFAULT_PROFILE,
  LAST_PROFILE_KEY,
  allProfiles,
  lastUsedProfile,
  persistProfiles,
  profileForEnvironment,
} from "@/lib/profiles"

// Connection handling.
//
// The deployment's environment is a built-in default profile; its secret is
// held server-side and added by /api/aprimo/token. Users can add other
// environments as profiles stored in this browser, each with the client id
// and secret of a PKCE registration whose redirect URI is this site's
// /oauth/callback.
//
// The home page waits for Connect. Any other page connects on load:
//   1. to the environment named by ?env=<subdomain>, when given
//   2. to the default, when Aprimo opened the page for a record (?record= or
//      ?requestId=), since actions are configured on the default environment
//   3. otherwise to the last-used profile
// The "aprimo:open-config" event connects to the last-used profile; with
// { detail: { manage: true } } it opens the picker instead.

function startOAuth(profile: ConnectionProfile) {
  localStorage.setItem(LAST_PROFILE_KEY, profile.id)
  generatePKCE().then(({ codeVerifier, codeChallenge }) => {
    const redirectUri = `${window.location.origin}/oauth/callback`
    sessionStorage.setItem("pkce_environment", profile.environment)
    sessionStorage.setItem("pkce_client_id", profile.clientId)
    // Only browser profiles carry a secret; the default's is added server-side.
    if (profile.clientSecret) sessionStorage.setItem("pkce_client_secret", profile.clientSecret)
    else sessionStorage.removeItem("pkce_client_secret")
    sessionStorage.setItem("pkce_code_verifier", codeVerifier)
    sessionStorage.setItem("pkce_return_url", window.location.href)
    window.location.href = buildAuthorizationUrl(profile.environment, profile.clientId, codeChallenge, redirectUri)
  })
}

type View = "list" | "edit"

export function AprimoConfigDialog() {
  const { isConnected } = useAprimo()
  const [open, setOpen] = useState(false)
  const [profiles, setProfiles] = useState<ConnectionProfile[]>([])
  const [view, setView] = useState<View>("list")
  const [editing, setEditing] = useState<ConnectionProfile | null>(null)
  const [formName, setFormName] = useState("")
  const [formEnvironment, setFormEnvironment] = useState("")
  const [formClientId, setFormClientId] = useState("")
  const [formClientSecret, setFormClientSecret] = useState("")
  const hasAttempted = useRef(false)

  function showPicker() {
    const loaded = allProfiles()
    setProfiles(loaded)
    setView(loaded.length ? "list" : "edit")
    setEditing(null)
    setOpen(true)
  }

  function openDialog(e: Event) {
    const manage = !!(e as CustomEvent<{ manage?: boolean }>).detail?.manage
    if (manage) return showPicker()
    const profile = lastUsedProfile()
    if (profile) return startOAuth(profile)
    showPicker()
  }

  useEffect(() => {
    window.addEventListener("aprimo:open-config", openDialog)
    return () => window.removeEventListener("aprimo:open-config", openDialog)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (isConnected) return
    if (window.location.pathname.startsWith("/oauth")) return
    if (window.location.pathname === "/") return
    if (hasAttempted.current) return
    hasAttempted.current = true

    const params = new URLSearchParams(window.location.search)
    const env = params.get("env")
    if (env) {
      const match = profileForEnvironment(env)
      if (match) return startOAuth(match)
      // Named environment with no profile: ask for one, prefilled.
      setProfiles(allProfiles())
      setEditing(null)
      setFormName(env)
      setFormEnvironment(env)
      setFormClientId("")
      setFormClientSecret("")
      setView("edit")
      setOpen(true)
      return
    }
    const fromAprimo = params.has("record") || params.has("requestId")
    const profile = (fromAprimo ? DEFAULT_PROFILE : null) ?? lastUsedProfile()
    if (profile) startOAuth(profile)
    else showPicker()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected])

  function connectProfile(profile: ConnectionProfile) {
    setOpen(false)
    startOAuth(profile)
  }

  function openNew() {
    setEditing(null)
    setFormName("")
    setFormEnvironment("")
    setFormClientId("")
    setFormClientSecret("")
    setView("edit")
  }

  function openEdit(profile: ConnectionProfile) {
    setEditing(profile)
    setFormName(profile.name)
    setFormEnvironment(profile.environment)
    setFormClientId(profile.clientId)
    setFormClientSecret(profile.clientSecret)
    setView("edit")
  }

  function commitProfile(): ConnectionProfile {
    const profile: ConnectionProfile = {
      id: editing?.id ?? crypto.randomUUID(),
      name: formName.trim() || formEnvironment.trim(),
      environment: formEnvironment.trim().toLowerCase(),
      clientId: formClientId.trim(),
      clientSecret: formClientSecret.trim(),
    }
    const updated = editing ? profiles.map((p) => (p.id === editing.id ? profile : p)) : [...profiles, profile]
    persistProfiles(updated)
    setProfiles(updated)
    return profile
  }

  function saveProfile() {
    commitProfile()
    setView("list")
  }

  function saveAndConnect() {
    const profile = commitProfile()
    setOpen(false)
    startOAuth(profile)
  }

  function deleteProfile(id: string) {
    const updated = profiles.filter((p) => p.id !== id)
    persistProfiles(updated)
    setProfiles(updated)
    if (localStorage.getItem(LAST_PROFILE_KEY) === id) localStorage.removeItem(LAST_PROFILE_KEY)
  }

  const envTrimmed = formEnvironment.trim()
  const envValid = /^[a-z0-9-]+$/i.test(envTrimmed)
  const formValid = !!(envTrimmed && envValid && formClientId.trim())
  const callback = typeof window !== "undefined" ? `${window.location.origin}/oauth/callback` : "/oauth/callback"

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        {view === "list" ? (
          <>
            <DialogHeader>
              <DialogTitle>Connect to Aprimo</DialogTitle>
              <DialogDescription>
                {profiles.length === 0 ? "Add an environment to get started." : "Pick an environment to connect, or add another."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2 py-1 min-h-[60px]">
              {profiles.map((p) => (
                <div key={p.id} className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{p.name}</div>
                    <div className="text-xs text-muted-foreground font-mono truncate">{p.environment}.dam.aprimo.com</div>
                  </div>
                  {!p.builtIn && (
                    <>
                      <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" title="Edit" onClick={() => openEdit(p)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0 text-destructive hover:text-destructive" title="Delete" onClick={() => deleteProfile(p.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                  <Button size="sm" className="h-7 shrink-0" onClick={() => connectProfile(p)}>
                    Connect
                  </Button>
                </div>
              ))}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={openNew}>
                <Plus className="h-4 w-4" />
                Add environment
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit environment" : "Add environment"}</DialogTitle>
              <DialogDescription>
                Use a PKCE registration from that environment&apos;s Settings, Registrations, with redirect URI <span className="font-mono">{callback}</span>.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="profile-name">Name</Label>
                <Input id="profile-name" placeholder={formEnvironment || "Production"} value={formName} onChange={(e) => setFormName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="profile-environment">Environment</Label>
                <Input id="profile-environment" placeholder="acme" value={formEnvironment} onChange={(e) => setFormEnvironment(e.target.value)} />
                {envTrimmed && !envValid ? (
                  <p className="text-xs text-destructive">Use only the subdomain: letters, numbers, and dashes.</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    The subdomain: <span className="font-mono">acme</span> for acme.dam.aprimo.com
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="profile-client-id">Client ID</Label>
                <Input id="profile-client-id" placeholder="XXXXXXXX-XXXX" value={formClientId} onChange={(e) => setFormClientId(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="profile-client-secret">Client secret</Label>
                <Input id="profile-client-secret" type="password" placeholder="From the same registration" value={formClientSecret} onChange={(e) => setFormClientSecret(e.target.value)} />
                <p className="text-xs text-muted-foreground">Needed unless this deployment holds a secret for that environment. Stored only in this browser and sent only to this site&apos;s token exchange.</p>
              </div>
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2">
              {profiles.length > 0 && (
                <Button variant="outline" className="sm:mr-auto" onClick={() => setView("list")}>
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
              )}
              <Button variant="outline" disabled={!formValid} onClick={saveProfile}>
                Save
              </Button>
              <Button disabled={!formValid} onClick={saveAndConnect}>
                Save &amp; connect
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
