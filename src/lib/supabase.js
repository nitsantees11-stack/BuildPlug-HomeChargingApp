import { createClient } from "@supabase/supabase-js"
import {
  ApiError,
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  isLive,
  request,
} from "./config"

export { isLive }

export const AVATAR_BUCKET = "avatars"
const AVATAR_KEY = "plughome:saved_avatar"
const HOST_PHOTO_CACHE_KEY = "plughome:host_photos"
const METER_PHOTO_CACHE_KEY = "plughome:meter_photos"
const BOOKING_OVERRIDE_KEY = "plughome:booking_overrides"

export function saveAvatarPersistent(dataUrl) {
  if (typeof window === "undefined") return
  try {
    if (dataUrl) localStorage.setItem(AVATAR_KEY, dataUrl)
    else if (dataUrl === "") localStorage.removeItem(AVATAR_KEY)
  } catch {}
}

export function getSavedAvatar() {
  if (typeof window === "undefined") return ""
  try {
    return localStorage.getItem(AVATAR_KEY) || ""
  } catch {
    return ""
  }
}

export function saveHostPhotoCache(hostKey, photoData) {
  if (typeof window === "undefined" || !hostKey || !photoData) return
  try {
    const raw = localStorage.getItem(HOST_PHOTO_CACHE_KEY)
    const map = raw ? JSON.parse(raw) : {}
    map[hostKey] = photoData
    localStorage.setItem(HOST_PHOTO_CACHE_KEY, JSON.stringify(map))
  } catch {}
}

export function getHostPhotoCache() {
  if (typeof window === "undefined") return {}
  try {
    const raw = localStorage.getItem(HOST_PHOTO_CACHE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function saveMeterPhotoCache(bookingId, stage, photoUrl) {
  if (typeof window === "undefined" || !bookingId || !stage || !photoUrl) return
  try {
    const raw = localStorage.getItem(METER_PHOTO_CACHE_KEY)
    const map = raw ? JSON.parse(raw) : {}
    map[`${bookingId}:${stage}`] = photoUrl
    localStorage.setItem(METER_PHOTO_CACHE_KEY, JSON.stringify(map))
  } catch {}
}

export function getMeterPhotoCache(bookingId, stage) {
  if (typeof window === "undefined" || !bookingId || !stage) return null
  try {
    const raw = localStorage.getItem(METER_PHOTO_CACHE_KEY)
    const map = raw ? JSON.parse(raw) : {}
    return map[`${bookingId}:${stage}`] || null
  } catch {
    return null
  }
}

export function saveBookingOverride(bookingId, patch) {
  if (typeof window === "undefined" || !bookingId || !patch) return
  try {
    const raw = localStorage.getItem(BOOKING_OVERRIDE_KEY)
    const map = raw ? JSON.parse(raw) : {}
    map[bookingId] = { ...(map[bookingId] || {}), ...patch }
    localStorage.setItem(BOOKING_OVERRIDE_KEY, JSON.stringify(map))
    window.dispatchEvent(
      new CustomEvent("plughome:booking-override", {
        detail: { bookingId, patch },
      }),
    )
  } catch {}
}

export function getBookingOverrides() {
  if (typeof window === "undefined") return {}
  try {
    const raw = localStorage.getItem(BOOKING_OVERRIDE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

const shared = (globalThis.__plughomeSupabase ??= { client: null, user: null })

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
    if (event !== "SIGNED_OUT" || !shared.user) return
    shared.user = null
    window.dispatchEvent(new CustomEvent("plughome:session-expired"))
  })
}

if (shared.client?.auth && !shared.client.auth.__patched) {
  const origUpdateUser = shared.client.auth.updateUser.bind(shared.client.auth)
  shared.client.auth.updateUser = async (attributes, options) => {
    if (attributes?.data && "photoUrl" in attributes.data) {
      const val = attributes.data.photoUrl
      if (val) {
        saveAvatarPersistent(val)
      } else if (val === "") {
        saveAvatarPersistent("")
      }
      const isHttpUrl =
        typeof val === "string" &&
        (val.startsWith("http://") || val.startsWith("https://"))
      attributes = {
        ...attributes,
        data: {
          ...attributes.data,
          photoUrl: isHttpUrl ? val : val === "" ? "" : null,
          avatarUrl: isHttpUrl
            ? val
            : val === ""
              ? ""
              : attributes.data.avatarUrl,
        },
      }
    }
    return origUpdateUser(attributes, options)
  }
  shared.client.auth.__patched = true
}

export const supabase = isLive ? shared.client : null
export const getLiveUser = () => shared.user

export async function uploadMediaToBucket(folder, fileName, fileOrBlob) {
  if (!supabase?.storage || !fileOrBlob) return null
  const path = `${folder}/${fileName}-${Date.now()}.jpg`
  try {
    const { error } = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(path, fileOrBlob, {
        upsert: true,
        contentType: fileOrBlob.type || "image/jpeg",
      })
    if (error) return null
    const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path)
    return data?.publicUrl || null
  } catch {
    return null
  }
}

export async function uploadAvatarToBucket(userId, blobOrFile) {
  if (!supabase?.storage || !userId || !blobOrFile) return null
  const cleanId = String(userId).trim()
  const filePath = `${cleanId}/avatar.jpg`

  try {
    await supabase.storage.createBucket(AVATAR_BUCKET, { public: true })
  } catch {}

  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(filePath, blobOrFile, {
      upsert: true,
      contentType: "image/jpeg",
      cacheControl: "0",
    })

  if (uploadError) {
    throw new ApiError(
      uploadError.message ||
        "Could not upload to 'avatars' bucket. Make sure the 'avatars' bucket is public in Supabase.",
    )
  }

  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(filePath)
  const publicUrl = data?.publicUrl
    ? `${data.publicUrl}?t=${Date.now()}`
    : null

  if (publicUrl) {
    saveAvatarPersistent(publicUrl)
    try {
      await supabase.auth.updateUser({
        data: { photoUrl: publicUrl, avatarUrl: publicUrl },
      })
    } catch {}
  }

  return publicUrl
}

export async function fetchAvatarFromBucket(userId) {
  if (!supabase || !userId) return getSavedAvatar() || ""
  const cleanId = String(userId).trim()

  try {
    const { data: userData } = await supabase.auth.getUser()
    const meta = userData?.user?.user_metadata || {}
    const metaUrl = meta.avatarUrl || meta.photoUrl
    if (
      typeof metaUrl === "string" &&
      (metaUrl.startsWith("http://") || metaUrl.startsWith("https://"))
    ) {
      saveAvatarPersistent(metaUrl)
      return metaUrl
    }

    if (supabase.storage) {
      const { data: files, error } = await supabase.storage
        .from(AVATAR_BUCKET)
        .list(cleanId, { limit: 10 })

      if (!error && Array.isArray(files)) {
        const found = files.find(
          (f) => f.name === "avatar.jpg" || f.name.startsWith("avatar"),
        )
        if (found) {
          const { data } = supabase.storage
            .from(AVATAR_BUCKET)
            .getPublicUrl(`${cleanId}/${found.name}`)
          if (data?.publicUrl) {
            const versionTag = found.updated_at
              ? new Date(found.updated_at).getTime()
              : Date.now()
            const finalUrl = `${data.publicUrl}?t=${versionTag}`
            saveAvatarPersistent(finalUrl)
            return finalUrl
          }
        }
      }
    }
  } catch {}

  return getSavedAvatar() || ""
}

export async function removeAvatarFromBucket(userId) {
  saveAvatarPersistent("")
  if (!supabase || !userId) return
  const cleanId = String(userId).trim()
  try {
    await supabase.storage
      ?.from(AVATAR_BUCKET)
      .remove([`${cleanId}/avatar.jpg`])
  } catch {}
  try {
    await supabase.auth.updateUser({
      data: { photoUrl: "", avatarUrl: "" },
    })
  } catch {}
}

export async function getToken() {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  const session = data?.session
  if (!session) return null

  const existingMetaPhoto =
    session.user?.user_metadata?.avatarUrl ||
    session.user?.user_metadata?.photoUrl
  if (existingMetaPhoto && String(existingMetaPhoto).length > 15) {
    saveAvatarPersistent(existingMetaPhoto)
  }

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
  `plughome:onboarding:${role}:${userId || "latest"}`

export function getSavedOnboarding(userId, role) {
  try {
    const specific = localStorage.getItem(profileKey(userId, role))
    if (specific) return JSON.parse(specific)
    const latest = localStorage.getItem(profileKey("latest", role))
    return latest ? JSON.parse(latest) : null
  } catch {
    return null
  }
}

// merges new onboarding/profile details into this device's saved copy
export function saveUserOnboarding(userId, role, details) {
  if (!role || !details || typeof details !== "object") return
  try {
    const next = { ...(getSavedOnboarding(userId, role) || {}), ...details }
    const json = JSON.stringify(next)
    if (userId) localStorage.setItem(profileKey(userId, role), json)
    localStorage.setItem(profileKey("latest", role), json)
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

async function finalizeSessionUser(session, fallback = {}) {
  const meta = session?.user?.user_metadata || {}
  const bucketPhoto = await fetchAvatarFromBucket(session?.user?.id)
  const resolvedPhoto =
    bucketPhoto || meta.avatarUrl || meta.photoUrl || getSavedAvatar() || ""

  if (resolvedPhoto) {
    saveAvatarPersistent(resolvedPhoto)
  }

  const name = fallback.name || meta.name || meta.full_name || "EV User"
  const role = fallback.role || meta.role || "driver"
  const phone = fallback.phone || meta.phone || ""
  const onboarding =
    fallback.onboarding ||
    meta.onboarding ||
    getSavedOnboarding(session.user.id, role) ||
    {}

  const token = (await getToken()) || session.access_token

  try {
    await request("/auth/profile", {
      method: "POST",
      token,
      body: { name, role },
    })
  } catch {}

  try {
    localStorage.setItem(
      profileKey(session.user.id, role),
      JSON.stringify(onboarding),
    )
    localStorage.setItem(
      profileKey("latest", role),
      JSON.stringify(onboarding),
    )
  } catch {}

  clearPendingVerification()

  shared.user = {
    id: session.user.id,
    name,
    role,
    phone,
    email: session.user.email,
    photoUrl: resolvedPhoto,
    onboarding,
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
    const user = await finalizeSessionUser(data.session, {
      name,
      role,
      phone,
      onboarding,
    })
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
    const user = await finalizeSessionUser(data.session, {
      name,
      role,
      phone,
      onboarding,
    })
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

  return await finalizeSessionUser(data.session, {
    name: name || data.session.user.user_metadata?.full_name,
    role: role || data.session.user.user_metadata?.role,
    phone: phone || data.session.user.user_metadata?.phone,
    onboarding: onboarding || data.session.user.user_metadata?.onboarding,
  })
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
  const user = await finalizeSessionUser(data.session, pending)

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
