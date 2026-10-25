// Public live-mode configuration. Only public values live here: the Supabase
// URL + anon key (env first, then the Figma Make connection) and the
// Cloudinary cloud name. Privileged keys stay on the edge function.
import { projectId, publicAnonKey } from "../../utils/supabase/info"

const env = import.meta.env
export const SUPABASE_URL = String(
  env.VITE_SUPABASE_URL ||
    (projectId ? `https://${projectId}.supabase.co` : ""),
).replace(/\/+$/, "")
export const SUPABASE_ANON_KEY =
  env.VITE_SUPABASE_ANON_KEY || publicAnonKey || ""
export const ENV_CLOUD = env.VITE_CLOUDINARY_CLOUD_NAME || ""
export const isLive = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)
export const FN_URL = `${SUPABASE_URL}/functions/v1/make-server-14a63397`

export class ApiError extends Error {
  constructor(message, status = 0, data = null) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.data = data
  }
}

export async function request(
  path,
  { method = "GET", body, token, timeout = 20000 } = {},
) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeout)
  try {
    const r = await fetch(FN_URL + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token || SUPABASE_ANON_KEY}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    })
    let data = null
    try {
      data = await r.json()
    } catch {}
    if (!r.ok)
      throw new ApiError(
        data?.error || data?.message || `Request failed (${r.status})`,
        r.status,
        data,
      )
    return data
  } catch (e) {
    if (e instanceof ApiError) throw e
    if (e?.name === "AbortError")
      throw new ApiError(
        "The server took too long to respond — please try again.",
      )
    throw new ApiError(
      typeof navigator !== "undefined" && navigator.onLine === false
        ? "You're offline — check your connection and try again."
        : "Couldn't reach the PLUG-HOME server.",
    )
  } finally {
    clearTimeout(t)
  }
}
