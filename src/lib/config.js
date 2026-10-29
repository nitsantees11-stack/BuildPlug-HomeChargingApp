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

async function singleFetch(path, { method, body, token, timeout }) {
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
  } finally {
    clearTimeout(t)
  }
}

export async function request(
  path,
  { method = "GET", body, token, timeout = 25000 } = {},
) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await singleFetch(path, { method, body, token, timeout })
    } catch (e) {
      if (e instanceof ApiError) {
        // Retry once on 502/503/504 gateway cold starts
        if (attempt === 0 && [502, 503, 504].includes(e.status)) {
          await new Promise((res) => setTimeout(res, 800))
          continue
        }
        throw e
      }
      if (attempt === 0) {
        await new Promise((res) => setTimeout(res, 800))
        continue
      }
      if (e?.name === "AbortError")
        throw new ApiError(
          "The server took too long to respond — please try again.",
        )
      throw new ApiError(
        typeof navigator !== "undefined" && navigator.onLine === false
          ? "You're offline — check your connection and try again."
          : "Couldn't reach the PLUG-HOME server.",
      )
    }
  }
}
