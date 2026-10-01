"use client"

// Connection profiles, one per Aprimo environment, kept in this browser.
// The deployment's own environment (NEXT_PUBLIC_APRIMO_ENVIRONMENT and
// NEXT_PUBLIC_APRIMO_CLIENT_ID) appears as a built-in default profile whose
// client secret stays on the server (APRIMO_CLIENT_SECRET). Further
// environments are added by the user with their own PKCE registration.

export interface ConnectionProfile {
  id: string
  name: string
  environment: string
  clientId: string
  /** Empty for the built-in default; the server supplies its secret. */
  clientSecret: string
  /** The deployment's default, from env vars. Cannot be edited or deleted. */
  builtIn?: boolean
}

export const ENV_ENVIRONMENT = process.env.NEXT_PUBLIC_APRIMO_ENVIRONMENT ?? ""
export const ENV_CLIENT_ID = process.env.NEXT_PUBLIC_APRIMO_CLIENT_ID ?? ""

export const DEFAULT_PROFILE: ConnectionProfile | null =
  ENV_ENVIRONMENT && ENV_CLIENT_ID
    ? { id: "default", name: `${ENV_ENVIRONMENT} (default)`, environment: ENV_ENVIRONMENT, clientId: ENV_CLIENT_ID, clientSecret: "", builtIn: true }
    : null

export const PROFILES_KEY = "aprimo_profiles"
export const LAST_PROFILE_KEY = "aprimo_last_profile_id"

export function loadProfiles(): ConnectionProfile[] {
  try {
    // One-time migration from the single-connection keys of older versions.
    const oldEnv = localStorage.getItem("aprimo_environment")
    const oldCid = localStorage.getItem("aprimo_client_id")
    if (oldEnv && oldCid && !localStorage.getItem(PROFILES_KEY)) {
      const migrated: ConnectionProfile[] = [
        { id: crypto.randomUUID(), name: oldEnv, environment: oldEnv, clientId: oldCid, clientSecret: localStorage.getItem("aprimo_client_secret") ?? "" },
      ]
      localStorage.setItem(PROFILES_KEY, JSON.stringify(migrated))
      localStorage.removeItem("aprimo_environment")
      localStorage.removeItem("aprimo_client_id")
      localStorage.removeItem("aprimo_client_secret")
      return migrated
    }
    const raw = localStorage.getItem(PROFILES_KEY)
    return raw ? (JSON.parse(raw) as ConnectionProfile[]).filter((p) => !p.builtIn) : []
  } catch {
    return []
  }
}

export function persistProfiles(profiles: ConnectionProfile[]) {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles.filter((p) => !p.builtIn)))
}

/** Built-in default first, then the user's own. */
export function allProfiles(): ConnectionProfile[] {
  return DEFAULT_PROFILE ? [DEFAULT_PROFILE, ...loadProfiles()] : loadProfiles()
}

/** The profile to use without asking: last used, else the default, else the first saved. */
export function lastUsedProfile(): ConnectionProfile | null {
  const all = allProfiles()
  const lastId = localStorage.getItem(LAST_PROFILE_KEY)
  return (lastId ? all.find((p) => p.id === lastId) : null) ?? DEFAULT_PROFILE ?? all[0] ?? null
}

/** A profile for a named environment: the last-used one if it matches, else any that does. */
export function profileForEnvironment(environment: string): ConnectionProfile | null {
  const env = environment.toLowerCase()
  const matches = allProfiles().filter((p) => p.environment.toLowerCase() === env)
  const lastId = localStorage.getItem(LAST_PROFILE_KEY)
  return matches.find((p) => p.id === lastId) ?? matches[0] ?? null
}

/** Opens the connection picker to add or switch environments. */
export function openConnectionManager() {
  window.dispatchEvent(new CustomEvent("aprimo:open-config", { detail: { manage: true } }))
}
