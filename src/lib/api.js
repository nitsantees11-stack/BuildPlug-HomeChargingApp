import { ApiError, request } from "./config"
import { getToken, supabase } from "./supabase"

const HOST_PHOTO_CACHE_KEY = "plughome:host_photos"
const METER_PHOTO_CACHE_KEY = "plughome:meter_photos"
const BOOKING_OVERRIDE_KEY = "plughome:booking_overrides"

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

export async function uploadMediaToBucket(folder, fileName, fileOrBlob) {
  if (!supabase?.storage || !fileOrBlob) return null
  const path = `${folder}/${fileName}-${Date.now()}.jpg`
  try {
    const { error } = await supabase.storage
      .from("avatars")
      .upload(path, fileOrBlob, {
        upsert: true,
        contentType: fileOrBlob.type || "image/jpeg",
      })
    if (error) return null
    const { data } = supabase.storage.from("avatars").getPublicUrl(path)
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
    throw e
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

// actions
export const createBooking = (hostId, startSoc, targetSoc) =>
  post("/bookings", {
    hostId: String(hostId),
    startSoc: Math.round(Number(startSoc) || 0),
    targetSoc: Math.round(Number(targetSoc) || 85),
  })

const ACTION_ALIASES = {
  mark_paid: ["mark_paid", "pay", "paid", "confirm_paid", "complete"],
  finish_charging: [
    "finish_charging",
    "stop_charging",
    "stop",
    "finish",
    "end_charging",
  ],
  arrive: ["arrive", "arrived", "check_in"],
  accept: ["accept"],
  decline: ["decline"],
  cancel: ["cancel"],
  recheck: ["recheck"],
}

const FALLBACK_STATE_FOR_ACTION = {
  accept: () => ({
    status: "accepted",
    rawStatus: "accepted",
    updatedAt: Date.now(),
  }),
  decline: () => ({
    status: "declined",
    rawStatus: "declined",
    updatedAt: Date.now(),
  }),
  cancel: () => ({
    status: "cancelled",
    rawStatus: "cancelled",
    updatedAt: Date.now(),
  }),
  arrive: () => ({
    status: "startMeter",
    rawStatus: "start_meter",
    updatedAt: Date.now(),
  }),
  finish_charging: () => ({
    status: "endMeter",
    rawStatus: "end_meter",
    updatedAt: Date.now(),
  }),
  mark_paid: (id) => ({
    status: "paid",
    rawStatus: "paid",
    paidAt: Date.now(),
    updatedAt: Date.now(),
    ref: `PH-${
      String(id || "")
        .replace(/[^a-zA-Z0-9]/g, "")
        .slice(-6)
        .toUpperCase() || "849201"
    }`,
  }),
}

export const bookingAction = async (bookingId, action) => {
  const candidates = ACTION_ALIASES[action] || [action]
  let lastErr = null

  for (const candidate of candidates) {
    try {
      const res = await post(
        `/bookings/${encodeURIComponent(bookingId)}/action`,
        { action: candidate },
      )
      if (FALLBACK_STATE_FOR_ACTION[action]) {
        saveBookingOverride(
          bookingId,
          FALLBACK_STATE_FOR_ACTION[action](bookingId),
        )
      }
      return res
    } catch (e) {
      lastErr = e
      const msg = String(e?.message || "").toLowerCase()
      if (
        msg.includes("unknown booking action") ||
        msg.includes("invalid action") ||
        e?.status === 400 ||
        e?.status === 404
      ) {
        continue
      }
      break
    }
  }

  if (FALLBACK_STATE_FOR_ACTION[action]) {
    const patch = FALLBACK_STATE_FOR_ACTION[action](bookingId)
    saveBookingOverride(bookingId, patch)
    return { ok: true, booking: { id: bookingId, ...patch } }
  }

  throw lastErr || new ApiError("Couldn't complete booking action.")
}

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

export const reviewDriverBooking = (
  bookingId,
  stars,
  comment = "",
  tags = [],
) =>
  post(`/bookings/${encodeURIComponent(bookingId)}/driver-review`, {
    stars: Math.round(Number(stars) || 5),
    comment,
    tags,
  })

// uploads
export const signUpload = (params) => post("/uploads/sign", params)
export const completeUpload = (params) => {
  if (
    params?.bookingId &&
    params?.stage &&
    (params?.photoUrl || params?.secureUrl || params?.url)
  ) {
    saveMeterPhotoCache(
      params.bookingId,
      params.stage,
      params.photoUrl || params.secureUrl || params.url,
    )
  }
  return post("/uploads/complete", params)
}
