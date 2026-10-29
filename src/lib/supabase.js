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

const avatarKey = (uid) => {
  const id = uid || shared.user?.id
  return id ? `plughome:saved_avatar:${id}` : null
}

export function saveAvatarPersistent(dataUrl, uid) {
  if (typeof window === "undefined") return
  const key = avatarKey(uid)
  if (!key) return
  try {
    if (dataUrl) localStorage.setItem(key, dataUrl)
    else if (dataUrl === "") localStorage.removeItem(key)
  } catch {}
}

export function getSavedAvatar(uid) {
  if (typeof window === "undefined") return ""
  const key = avatarKey(uid)
  if (!key) return ""
  try {
    return localStorage.getItem(key) || ""
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
  shared.client.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") {
      shared.user = null
      window.dispatchEvent(new CustomEvent("plughome:session-expired"))
    } else if (session?.user && shared.user && shared.user.id !== session.user.id) {
      shared.user = { ...shared.user, id: session.user.id, email: session.user.email }
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

  if (session.access_token && session.access_token.length > 3500) {
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

// Strictly returns onboarding for this specific userId — never falls back to another user's "latest"
export function getSavedOnboarding(userId, role) {
  if (!userId || typeof window === "undefined") return null
  try {
    const specific = localStorage.getItem(profileKey(userId, role))
    return specific ? JSON.parse(specific) : null
  } catch {
    return null
  }
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
  const meta = session?.user?.user_metadata || {}
  const role = fallback.role || meta.role || "driver"
  const name =
    (isNewSignup ? fallback.name : meta.name || meta.full_name || fallback.name) ||
    "EV User"
  const phone = meta.phone || fallback.phone || ""
  const onboarding =
    (isNewSignup
      ? fallback.onboarding || meta.onboarding
      : meta.onboarding || getSavedOnboarding(uid, role) || fallback.onboarding) ||
    {}

  // Set shared.user immediately so avatarKey(uid) knows the active user ID
  shared.user = {
    id: uid,
    name,
    role,
    phone,
    email: session.user.email,
    photoUrl: "",
    onboarding,
  }

  const token = (await getToken()) || session.access_token
  let backendProfile = null

  try {
    if (isNewSignup) {
      const res = await request("/auth/profile", {
        method: "POST",
        token,
        body: {
          name,
          role,
          phone: phone || undefined,
          email: session.user.email,
          ...(role === "host"
            ? { hostDetails: Object.keys(onboarding).length ? onboarding : undefined }
            : { driverDetails: Object.keys(onboarding).length ? onboarding : undefined }),
        },
      })
      backendProfile = res?.profile || null
    } else {
      // On Sign-In: fetch this user's existing backend profile first so we don't overwrite it
      const getRes = await request("/auth/profile", { method: "GET", token }).catch(() => null)
      backendProfile = getRes?.profile || null
      if (!backendProfile) {
        const postRes = await request("/auth/profile", {
          method: "POST",
          token,
          body: { name, role, email: session.user.email },
        })
        backendProfile = postRes?.profile || null
      }
    }

    if (backendProfile?.photoUrl) {
      saveAvatarPersistent(backendProfile.photoUrl, uid)
    }
  } catch {}

  const resolvedOnboarding =
    (role === "host"
      ? backendProfile?.hostDetails
      : backendProfile?.driverDetails) ||
    meta.onboarding ||
    getSavedOnboarding(uid, role) ||
    onboarding

  try {
    localStorage.setItem(
      profileKey(uid, role),
      JSON.stringify(resolvedOnboarding),
    )
  } catch {}

  clearPendingVerification()

  shared.user = {
    id: uid,
    name: backendProfile?.name || meta.name || meta.full_name || name,
    role: backendProfile?.role || role,
    phone: backendProfile?.phone || phone,
    email: backendProfile?.email || session.user.email,
    photoUrl: backendProfile?.photoUrl || getSavedAvatar(uid) || "",
    onboarding: resolvedOnboarding,
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

  // Ensure any previous session is signed out before creating a new account
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
        onboarding,
      },
    },
  })

  if (error) {
    throw new ApiError(error.message || "Couldn't send verification email.")
  }

  if (data?.session) {
    const user = await finalizeSessionUser(
      data.session,
      { name, role, phone, onboarding },
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

  const { data, error } = await supabase.auth.signInWithPassword({
    email: String(email || "")
      .trim()
      .toLowerCase(),
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
      { name, role, phone, onboarding },
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

  // Clear any old session before signing into the new account
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

// ---------------------------------------------------------------------------
// Profile photo in Supabase Storage (public bucket "avatars").
// Har user ki apni file:  <user_id>/avatar.jpg
// ---------------------------------------------------------------------------
const AVATAR_BUCKET = "avatars"
const avatarPath = (uid) => `${uid}/avatar.jpg`

async function activeUid() {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data?.session?.user?.id || null
}

export async function uploadAvatarToBucket(userId, blob) {
  if (!supabase || !userId || !blob) return ""
  if ((await activeUid()) !== userId) return ""
  const path = avatarPath(userId)
  const { error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, blob, {
      upsert: true,
      contentType: "image/jpeg",
      cacheControl: "60",
    })
  if (error) throw error
  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path)
  return data?.publicUrl ? `${data.publicUrl}?v=${Date.now()}` : ""
}

export async function fetchAvatarFromBucket(uid) {
  if (!supabase || !uid) return ""
  if ((await activeUid()) !== uid) return ""
  try {
    const { data: files, error } = await supabase.storage
      .from(AVATAR_BUCKET)
      .list(uid, { limit: 5, search: "avatar" })
    if (error) return ""
    const f = (files || []).find((x) => x.name === "avatar.jpg")
    if (!f) return "" // is user ne photo upload hi nahi ki
    const { data } = supabase.storage
      .from(AVATAR_BUCKET)
      .getPublicUrl(avatarPath(uid))
    const v = f.updated_at ? new Date(f.updated_at).getTime() : Date.now()
    return data?.publicUrl ? `${data.publicUrl}?v=${v}` : ""
  } catch {
    return ""
  }
}

export async function removeAvatarFromBucket(userId) {
  if (!supabase || !userId) return
  if ((await activeUid()) !== userId) return
  try {
    await supabase.storage.from(AVATAR_BUCKET).remove([avatarPath(userId)])
  } catch {}
}