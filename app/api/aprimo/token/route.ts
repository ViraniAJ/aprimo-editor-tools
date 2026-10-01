import { NextRequest, NextResponse } from "next/server"

// Exchanges a PKCE authorization code for an Aprimo access token. The client
// secret is chosen here, per environment, so the deployment's own secret
// never reaches the browser:
//   1. APRIMO_CLIENT_SECRET for the default environment and client id
//      (NEXT_PUBLIC_APRIMO_CLIENT_SECRET is still read here, server-side only,
//      as a transition fallback until the variable is renamed)
//   2. APRIMO_CLIENT_SECRET_<ENV> for any other environment an admin has
//      configured server-side (upper-case, dashes as underscores)
//   3. otherwise the secret from the user's browser profile
function secretFor(environment: string, clientId: string, fromBrowser?: string): string | undefined {
  const isDefault =
    environment.toLowerCase() === (process.env.NEXT_PUBLIC_APRIMO_ENVIRONMENT ?? "").toLowerCase() &&
    clientId === process.env.NEXT_PUBLIC_APRIMO_CLIENT_ID
  const serverDefault = process.env.APRIMO_CLIENT_SECRET || process.env.NEXT_PUBLIC_APRIMO_CLIENT_SECRET
  const perEnv = process.env[`APRIMO_CLIENT_SECRET_${environment.toUpperCase().replace(/-/g, "_")}`]
  return (isDefault ? serverDefault : undefined) || perEnv || fromBrowser || undefined
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { environment, clientId, code, codeVerifier, redirectUri } = body

    if (!environment || !clientId || !code || !codeVerifier || !redirectUri) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }
    if (!/^[a-z0-9-]+$/i.test(String(environment))) {
      return NextResponse.json({ error: "Invalid environment" }, { status: 400 })
    }
    const clientSecret = secretFor(String(environment), String(clientId), typeof body.clientSecret === "string" ? body.clientSecret : undefined)

    const tokenUrl = `https://${environment}.aprimo.com/login/connect/token`
    const params = new URLSearchParams()
    params.append("grant_type", "authorization_code")
    params.append("client_id", clientId)
    params.append("code", code)
    params.append("code_verifier", codeVerifier)
    params.append("redirect_uri", redirectUri)
    if (clientSecret) {
      params.append("client_secret", clientSecret)
    }

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error("[aprimo] Token error:", response.status, data)
      return NextResponse.json(
        { error: data.error_description || data.error || "Token request failed" },
        { status: response.status }
      )
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error("[aprimo] Token route error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
