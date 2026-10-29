import { ApiError, request } from "./config"
import { getToken, supabase, AVATAR_BUCKET } from "./supabase"

const HOST_PHOTO_CACHE_KEY = "plughome:host_photos"
const METER_PHOTO_CACHE_KEY = "plughome:meter_photos"

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

// Upload any meter or host photo directly to Supabase Bucket so it never disappears
export async function uploadMediaToBucket(folder, fileName, fileOrBlob) {
  if (!supabase || !fileOrBlob) return null
  const bucket = AVATAR_BUCKET || "avatars"
  const path = `${folder}/${fileName}-${Date.now()}.jpg`
  try {
    const { error } = await supabase.storage.from(bucket).upload(path, fileOrBlob, {
      upsert: true,
      contentType: fileOrBlob.type || "image/jpeg",
    })
    if (error) return null
    const { data } = supabase.storage.from(bucket).getPublicUrl(path)
    return data?.publicUrl || null
  } catch {
    return null
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
    return await request(path, { timeout: 15000, ...opts, token })
  } catch (e) {
    if (e?.status === 401) {
      expire()
      throw e
    }
    // Retry once automatically if Edge Function had a cold-start network drop
    await new Promise((r) => setTimeout(r, 700))
    return await request(path, { timeout: 18000, ...opts, token })
  }
}
const post = (path, body) => authed(path, { method: "POST", body })

// reads
export const fetchConfig = () => request("/config", { timeout: 8000 })
export const fetchHosts = () => request("/hosts", { timeout: 12000 })
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

// actions — startSoc and targetSoc must be whole integers for server validation
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
  mediaUrl,
  mediaPublicId,
  mediaType,
}) =>
  post("/hosts", {
    name,
    locality,
    rate: Math.round(Number(rate) || 12),
    socket,
    perks,
    lat: Number(lat),
    lng: Number(lng),
    ...(mediaUrl ? { mediaUrl } : {}),
    ...(mediaPublicId ? { mediaPublicId } : {}),
    ...(mediaType ? { mediaType } : {}),
  })
export const setSocketOnline = (hostId, online) =>
  post(`/hosts/${encodeURIComponent(hostId)}/online`, { online })
export const removeSocket = (hostId) =>
  authed(`/hosts/${encodeURIComponent(hostId)}`, { method: "DELETE" })

// 1. Driver rates Host -> POST /bookings/:id/review
// 2. Host rates Driver -> POST /bookings/:id/driver-review
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
export const completeUpload = (params) => {
  if (params?.bookingId && params?.stage && (params?.photoUrl || params?.secureUrl || params?.url)) {
    saveMeterPhotoCache(
      params.bookingId,
      params.stage,
      params.photoUrl || params.secureUrl || params.url,
    )
  }
  return post("/uploads/complete", params)
}
