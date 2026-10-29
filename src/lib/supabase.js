import { createClient } from "@supabase/supabase-js"
import {
  ApiError,
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  isLive,
  request,
} from "./config"

export { isLive }

const shared = (globalThis.__plughomeSupabase ??= { client: null, user: null })

const avatarKeyById = (uid) => (uid ? `plughome:avatar:id:${uid}` : null)
const avatarKeyByEmail = (email) =>
  email ? `plughome:avatar:email:${String(email).trim().toLowerCase()}` : null

export function saveAvatarPersistent(dataUrl, uid, email) {
  if (typeof window === "undefined") return
  const kId = avatarKeyById(uid || shared.user?.id)
  const kEm = avatarKeyByEmail(email || shared.user?.email)
  try {
    if (dataUrl) {
      if (kId) localStorage.setItem(kId, dataUrl)
      if (kEm) localStorage.setItem(kEm, dataUrl)
    } else if (dataUrl === "") {
      if (kId) localStorage.removeItem(kId)
      if (kEm) localStorage.removeItem(kEm)
    }
  } catch {}
}

export function getSavedAvatar(uid, email) {
  if (typeof window === "undefined") return ""
  const kId = avatarKeyById(uid)
  const kEm = avatarKeyByEmail(email)
  try {
    if (kId) {
      const byId = localStorage.getItem(kId)
      if (byId) return byId
    }
    if (kEm) {
      const byEm = localStorage.getItem(kEm)
      if (byEm) return byEm
    }
    return ""
  } catch {
    return ""
  }
}

if (isLive && !shared.client) {
  shared.client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: "plughome-auth",
    },
  })
  shared.client.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") {
      shared.user = null
      window.dispatchEvent(new CustomEvent("plughome:session-expired"))
    }
  })
}

export const supabase = isLive ? shared.client : null
export const getLiveUser = () => shared.user

export async function getToken() {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  const session = data?.session
  if (!session) return null

  // Only strip if someone had an old huge >7.5KB base64 photoUrl in JWT;
  // never touch avatarThumb (<1.8KB) so cloud photos always stay intact!
  if (session.access_token && session.access_token.length > 7500) {
    try {
      await supabase.auth.updateUser({ data: { photoUrl: null } })
      const refreshed = await supabase.auth.refreshSession()
      if (refreshed?.data?.session?.access_token) {
        return refreshed.data.session.access_token
      }
    } catch {}
  }

  return session.access_token ?? null
}

const PENDING_KEY = "plughome:pending_email_verify"

const profileKey = (userId, role) =>
  `plughome:onboarding:${role || "driver"}:${userId}`

export function getSavedOnboarding(userId, role) {
  if (!userId || typeof window === "undefined") return null
  try {
    const specific = localStorage.getItem(profileKey(userId, role))
    return specific ? JSON.parse(specific) : null
  } catch {
    return null
  }
}

export function saveUserOnboarding(userId, role, data) {
  if (!userId || typeof window === "undefined" || !data) return
  try {
    localStorage.setItem(profileKey(userId, role), JSON.stringify(data))
  } catch {}
}

export function savePendingVerification(payload) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(payload))
  } catch {}
}

export function getPendingVerification() {
  try {
    return JSON.parse(localStorage.getItem(PENDING_KEY) || "null")
  } catch {
    return null
  }
}

export function clearPendingVerification() {
  try {
    localStorage.removeItem(PENDING_KEY)
  } catch {}
}

async function finalizeSessionUser(session, fallback = {}, isNewSignup = false) {
  const uid = session.user.id
  const userEmail = session.user.email || fallback.email || ""
  const meta = session?.user?.user_metadata || {}
  const role = fallback.role || meta.role || "driver"
  const name =
    (isNewSignup ? fallback.name : meta.name || meta.full_name || fallback.name) ||
    "EV User"
  const phone = meta.phone || fallback.phone || ""
  const onboarding =
    (isNewSignup
      ? fallback.onboarding || meta.onboarding
      : meta.driverDetails ||
        meta.hostDetails ||
        meta.onboarding ||
        getSavedOnboarding(uid, role) ||
        fallback.onboarding) || {}

  // Resolve photo strictly for THIS user (from local high-res cache OR Supabase Cloud avatarThumb)
  const cloudPhoto = meta.avatarThumb || meta.photoUrl || ""
  const localPhoto = getSavedAvatar(uid, userEmail)
  const finalPhoto = isNewSignup ? "" : localPhoto || cloudPhoto || ""

  if (finalPhoto) {
    saveAvatarPersistent(finalPhoto, uid, userEmail)
  }

  const resolvedDriverDetails =
    meta.driverDetails ||
    (role === "driver" ? onboarding : getSavedOnboarding(uid, "driver")) ||
    null
  const resolvedHostDetails =
    meta.hostDetails ||
    (role === "host" ? onboarding : getSavedOnboarding(uid, "host")) ||
    null

  if (resolvedDriverDetails) saveUserOnboarding(uid, "driver", resolvedDriverDetails)
  if (resolvedHostDetails) saveUserOnboarding(uid, "host", resolvedHostDetails)

  const token = (await getToken()) || session.access_token
  try {
    await request("/auth/profile", {
      method: "POST",
      token,
      body: { name, role },
    })
  } catch {}

  clearPendingVerification()

  shared.user = {
    id: uid,
    name,
    role,
    phone,
    email: userEmail,
    photoUrl: finalPhoto,
    driverDetails: resolvedDriverDetails,
    hostDetails: resolvedHostDetails,
    onboarding: role === "host" ? resolvedHostDetails : resolvedDriverDetails,
  }
  return shared.user
}

export async function startEmailSignUp({
  name,
  role,
  phone = "",
  email,
  password,
  onboarding = {},
}) {
  if (!supabase) throw new ApiError("Live mode is not configured.")
  const cleanEmail = String(email || "")
    .trim()
    .toLowerCase()
  if (!cleanEmail) throw new ApiError("Please enter your email address.")
  if (!password || password.length < 6) {
    throw new ApiError("Password must be at least 6 characters.")
  }

  try {
    await supabase.auth.signOut({ scope: "local" })
    shared.user = null
  } catch {}

  const redirectUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}${window.location.pathname}`
      : undefined

  savePendingVerification({
    name,
    role,
    phone,
    email: cleanEmail,
    password,
    onboarding,
  })

  const { data, error } = await supabase.auth.signUp({
    email: cleanEmail,
    password,
    options: {
      emailRedirectTo: redirectUrl,
      data: {
        name,
        full_name: name,
        role,
        phone,
        avatarThumb: "",
        onboarding,
        ...(role === "host"
          ? { hostDetails: onboarding }
          : { driverDetails: onboarding }),
      },
    },
  })

  if (error) {
    throw new ApiError(error.message || "Couldn't send verification email.")
  }

  if (data?.session) {
    const user = await finalizeSessionUser(
      data.session,
      { name, role, phone, email: cleanEmail, onboarding },
      true,
    )
    return { status: "verified", user }
  }

  return {
    status: "awaiting_verification",
    email: cleanEmail,
  }
}

export async function checkEmailVerificationStatus({
  email,
  password,
  name,
  role,
  phone,
  onboarding,
}) {
  if (!supabase) throw new ApiError("Live mode is not configured.")
  const cleanEmail = String(email || "").trim().toLowerCase()

  const { data, error } = await supabase.auth.signInWithPassword({
    email: cleanEmail,
    password,
  })

  if (error) {
    const msg = (error.message || "").toLowerCase()
    if (msg.includes("not confirmed") || msg.includes("verify")) {
      return { verified: false, message: "Waiting for email verification..." }
    }
    throw new ApiError(error.message)
  }

  if (data?.session) {
    const user = await finalizeSessionUser(
      data.session,
      { name, role, phone, email: cleanEmail, onboarding },
      true,
    )
    return { verified: true, user }
  }

  return { verified: false }
}

export async function resendVerificationMail(email) {
  if (!supabase) throw new ApiError("Live mode is not configured.")
  const redirectUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}${window.location.pathname}`
      : undefined

  const { error } = await supabase.auth.resend({
    type: "signup",
    email: String(email || "")
      .trim()
      .toLowerCase(),
    options: {
      emailRedirectTo: redirectUrl,
    },
  })
  if (error) throw new ApiError(error.message)
  return true
}

export async function signInAs({
  name,
  role,
  phone = "",
  email = "",
  password = "",
  onboarding = null,
}) {
  if (!supabase) throw new ApiError("Live mode is not configured.")
  const cleanEmail = String(email || "")
    .trim()
    .toLowerCase()
  if (!cleanEmail || !password) {
    throw new ApiError("Please enter your registered email and password.")
  }

  try {
    await supabase.auth.signOut({ scope: "local" })
    shared.user = null
  } catch {}

  const { data, error } = await supabase.auth.signInWithPassword({
    email: cleanEmail,
    password,
  })

  if (error) {
    const msg = (error.message || "").toLowerCase()
    if (msg.includes("not confirmed")) {
      throw new ApiError(
        "Your email is not verified yet. Please click the verification link in your inbox.",
      )
    }
    throw new ApiError(error.message || "Invalid email or password.")
  }

  const meta = data.session.user.user_metadata || {}
  return await finalizeSessionUser(
    data.session,
    {
      name: meta.name || meta.full_name || name,
      role: role || meta.role,
      phone: meta.phone || phone,
      email: cleanEmail,
      onboarding: meta.onboarding || onboarding,
    },
    false,
  )
}

export async function checkEmailRedirectCallback() {
  if (!supabase || typeof window === "undefined") return null

  const hash = window.location.hash || ""
  const search = window.location.search || ""
  const isCallback =
    hash.includes("access_token=") ||
    hash.includes("type=signup") ||
    hash.includes("type=email") ||
    search.includes("code=")

  if (!isCallback) return null

  const { data } = await supabase.auth.getSession()
  if (!data?.session) return null

  const pending = getPendingVerification() || {}
  const user = await finalizeSessionUser(data.session, pending, true)

  try {
    window.history.replaceState({}, document.title, window.location.pathname)
  } catch {}

  return user
}

export async function signOut() {
  shared.user = null
  if (!supabase) return
  try {
    await supabase.auth.signOut({ scope: "local" })
  } catch {}
}
