import { ApiError, request } from "./config"
import { getToken, supabase } from "./supabase"

const LEGACY_KEY = "plughome:host_photos" // old shared key (the bug) - removed automatically
const KEY_PREFIX = "plughome:host_photos:" // new key: one cache per signed-in user

// who is signed in right now, read from Supabase's own session in localStorage
function currentUid() {
  if (typeof window === "undefined") return null
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith("sb-") && k.endsWith("-auth-token")) {
        const id = JSON.parse(localStorage.getItem(k) || "null")?.user?.id
        if (id) return id
      }
    }
  } catch {}
  return null
}

// drop the old shared cache and any other user's cache
function purgeForeignPhotoCaches(uid) {
  try {
    const drop = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k) continue
      if (k === LEGACY_KEY) drop.push(k)
      else if (k.startsWith(KEY_PREFIX) && k !== KEY_PREFIX + uid) drop.push(k)
    }
    drop.forEach((k) => localStorage.removeItem(k))
  } catch {}
}

// call this on logout too
export function clearPhotoCaches() {
  try {
    Object.keys(localStorage)
      .filter((k) => k === LEGACY_KEY || k.startsWith(KEY_PREFIX))
      .forEach((k) => localStorage.removeItem(k))
  } catch {}
}

export function saveHostPhotoCache(hostKey, photoData) {
  const uid = currentUid()
  if (typeof window === "undefined" || !uid || !hostKey || !photoData) return
  purgeForeignPhotoCaches(uid)
  try {
    const raw = localStorage.getItem(KEY_PREFIX + uid)
    const map = raw ? JSON.parse(raw) : {}
    map[hostKey] = photoData
    localStorage.setItem(KEY_PREFIX + uid, JSON.stringify(map))
  } catch {}
}

export function getHostPhotoCache() {
  const uid = currentUid()
  if (typeof window === "undefined" || !uid) return {} // not signed in = no cache
  purgeForeignPhotoCaches(uid)
  try {
    const raw = localStorage.getItem(KEY_PREFIX + uid)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

const expire = () =>
  window.dispatchEvent(new CustomEvent("plughome:session-expired"))

async function authed(path, opts = {}) {
  const token = await getToken()
  if (!token) {
    expire()
    throw new ApiError("Your session has expired — please log in again.", 401)
  }
  try {
    return await request(path, { ...opts, token })
  } catch (e) {
    if (e?.status === 401) expire()
    throw e
  }
}
const post = (path, body) => authed(path, { method: "POST", body })

// reads
export const fetchConfig = () => request("/config", { timeout: 6000 })
export const fetchHosts = () => request("/hosts")
export const fetchBookings = () => authed("/bookings")
export const fetchReadings = (bookingId) =>
  authed(`/bookings/${encodeURIComponent(bookingId)}/readings`)
export const fetchStats = () => authed("/stats")
export const fetchReviews = (hostId) =>
  request(`/hosts/${encodeURIComponent(hostId)}/reviews`)
export const fetchDriverReviews = (driverId) =>
  request(`/drivers/${encodeURIComponent(driverId)}/reviews`)
export const fetchMyProfile = () => authed("/auth/profile")
export const saveMyProfile = (profileData) =>
  post("/auth/profile", profileData)

// actions
export const createBooking = (hostId, startSoc, targetSoc) =>
  post("/bookings", {
    hostId: String(hostId),
    startSoc: Math.round(Number(startSoc) || 0),
    targetSoc: Math.round(Number(targetSoc) || 85),
  })
export const bookingAction = (bookingId, action) =>
  post(`/bookings/${encodeURIComponent(bookingId)}/action`, { action })
export const confirmReading = (bookingId, stage, value) =>
  post(`/bookings/${encodeURIComponent(bookingId)}/readings/${stage}/confirm`, {
    value: Number(value),
  })
export const listMySocket = ({
  name,
  locality,
  rate,
  socket,
  perks,
  lat,
  lng,
}) =>
  post("/hosts", {
    name,
    locality,
    rate: Math.round(Number(rate) || 12),
    socket,
    perks,
    lat: Number(lat),
    lng: Number(lng),
  })
export const setSocketOnline = (hostId, online) =>
  post(`/hosts/${encodeURIComponent(hostId)}/online`, { online })
export const removeSocket = (hostId) =>
  authed(`/hosts/${encodeURIComponent(hostId)}`, { method: "DELETE" })

export const reviewBooking = (
  bookingId,
  stars,
  comment = "",
  byRole = "driver",
  tags = [],
) => {
  const endpoint =
    byRole === "host"
      ? `/bookings/${encodeURIComponent(bookingId)}/driver-review`
      : `/bookings/${encodeURIComponent(bookingId)}/review`
  return post(endpoint, {
    stars: Math.round(Number(stars) || 5),
    comment,
    tags,
  })
}

export const reviewDriverBooking = (bookingId, stars, comment = "", tags = []) =>
  post(`/bookings/${encodeURIComponent(bookingId)}/driver-review`, {
    stars: Math.round(Number(stars) || 5),
    comment,
    tags,
  })

// uploads
export const signUpload = (params) => post("/uploads/sign", params)
export const completeUpload = (params) => post("/uploads/complete", params)

// Uploads profile photo to Cloudinary or Supabase Storage via backend /uploads/sign -> /uploads/complete
export async function uploadAvatar(file, fallbackDataUrl = "") {
  try {
    const contentType = file.type || "image/jpeg"
    const sign = await signUpload({
      purpose: "avatar",
      resourceType: "image",
      contentType,
      size: file.size,
    })

    if (sign.provider === "cloudinary") {
      const fd = new FormData()
      Object.entries(sign.params || {}).forEach(([k, v]) =>
        fd.append(k, String(v)),
      )
      fd.append("api_key", sign.apiKey)
      fd.append("signature", sign.signature)
      fd.append("file", file)

      const up = await fetch(
        `https://api.cloudinary.com/v1_1/${sign.cloudName}/image/upload`,
        { method: "POST", body: fd },
      )
      if (!up.ok) throw new Error("Cloudinary upload failed")
    } else if (sign.provider === "supabase" && supabase) {
      const { error } = await supabase.storage
        .from(sign.bucket)
        .uploadToSignedUrl(sign.path, sign.token, file, {
          contentType,
          upsert: true,
        })
      if (error) throw error
    }

    const done = await completeUpload({ uploadId: sign.uploadId })
    if (done?.photoUrl) {
      return done.photoUrl
    }
  } catch (e) {
    console.warn("Direct media upload fallback to KV profile:", e)
  }

  // Fallback: save compressed image in backend KV store via /auth/profile
  if (fallbackDataUrl) {
    const res = await saveMyProfile({ photoUrl: fallbackDataUrl })
    return res?.profile?.photoUrl || fallbackDataUrl
  }
  throw new ApiError("Couldn't upload profile photo.")
}