import { ApiError, request } from "./config"
import { getToken, supabase } from "./supabase"

export const AVATAR_BUCKET = "avatars"
const HOST_PHOTO_CACHE_KEY = "plughome:host_photos"
const METER_PHOTO_CACHE_KEY = "plughome:meter_photos"
const BOOKING_OVERRIDE_KEY = "plughome:booking_overrides"
const LOCAL_REVIEW_KEY = "plughome:verified_reviews"

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

// Confirmed overrides (`plughome:booking_overrides`): the booking row the
// server returned for a successful action. It bridges the gap until the next
// list fetch / realtime push shows the same state, then it is dropped. It is
// never written for a failed action, so it cannot invent a status.
const OVERRIDE_TTL = 2 * 60 * 1000
export function saveConfirmedBooking(row) {
  if (typeof window === "undefined" || !row?.id) return
  try {
    const map = getBookingOverrides()
    map[row.id] = { row, savedAt: Date.now() }
    localStorage.setItem(BOOKING_OVERRIDE_KEY, JSON.stringify(map))
  } catch {}
}
// returns the fresher of the server row and this device's confirmed row
export function reconcileBookingRows(rows) {
  const map = getBookingOverrides()
  let dirty = false
  const now = Date.now()
  const ts = (r) => Number(r?.updatedAt) || 0
  const out = rows.map((r) => {
    const o = map[r.id]
    if (!o) return r
    const keep = o.row && now - (o.savedAt || 0) < OVERRIDE_TTL && ts(o.row) > ts(r)
    if (keep) return { ...r, ...o.row }
    delete map[r.id] // server caught up, expired, or a legacy unconfirmed patch
    dirty = true
    return r
  })
  if (dirty) {
    try {
      localStorage.setItem(BOOKING_OVERRIDE_KEY, JSON.stringify(map))
    } catch {}
  }
  return out
}

// a booking this device saw marked paid ({ ref, paidAt }), or null
export function getPaidLocalOverride(bookingId) {
  const o = bookingId ? getBookingOverrides()[bookingId] : null
  return o && (o.status === "paid" || o.rawStatus === "paid") ? o : null
}

// Driver ratings kept on this device when the deployed server has no review
// route yet; live.js merges them with the server's reviews (by bookingId).
function readLocalReviews() {
  if (typeof window === "undefined") return {}
  try {
    const map = JSON.parse(localStorage.getItem(LOCAL_REVIEW_KEY) || "{}")
    return map && typeof map === "object" ? map : {}
  } catch {
    return {}
  }
}
function saveLocalReview(review) {
  if (typeof window === "undefined" || !review?.bookingId) return
  try {
    const map = readLocalReviews()
    map[review.bookingId] = review
    localStorage.setItem(LOCAL_REVIEW_KEY, JSON.stringify(map))
  } catch {}
}
export function getLocalVerifiedReviewForBooking(bookingId) {
  return (bookingId && readLocalReviews()[bookingId]) || null
}
export function getLocalVerifiedReviewsForHost(hostId) {
  if (!hostId) return []
  return Object.values(readLocalReviews()).filter(
    (r) => r && r.hostId === hostId,
  )
}

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
    if (e?.status === 401) expire()
    throw e
  }
}
const post = (path, body) => authed(path, { method: "POST", body })

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

export const createBooking = (hostId, startSoc, targetSoc) =>
  post("/bookings", {
    hostId: String(hostId),
    startSoc: Math.round(Number(startSoc) || 0),
    targetSoc: Math.round(Number(targetSoc) || 85),
  })

const ACTION_ALIASES = {
  // Older deployed servers only know the payment action as "pay_demo".
  mark_paid: ["mark_paid", "pay_demo"],
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

// The server is the source of truth for booking state. Never record a
// transition locally when the server rejected it — that left bookings looking
// finished on this device while the server still counted them as active.
export const bookingAction = async (bookingId, action) => {
  const candidates = ACTION_ALIASES[action] || [action]
  let lastErr = null

  for (const candidate of candidates) {
    try {
      const res = await post(`/bookings/${encodeURIComponent(bookingId)}/action`, {
        action: candidate,
      })
      if (res?.booking) saveConfirmedBooking(res.booking)
      return res
    } catch (e) {
      lastErr = e
      const msg = String(e?.message || "").toLowerCase()
      // only retry an alias when the server didn't recognise the action name
      if (msg.includes("unknown booking action") || msg.includes("invalid action")) continue
      break
    }
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
  extra = {},
) => {
  const endpoint =
    byRole === "host"
      ? `/bookings/${encodeURIComponent(bookingId)}/driver-review`
      : `/bookings/${encodeURIComponent(bookingId)}/review`
  const body = {
    stars: Math.round(Number(stars) || 5),
    comment,
    tags,
    ...(extra && typeof extra === "object" ? extra : {}),
  }
  return post(endpoint, body).catch((e) => {
    // an older deployed server has no review route (404): keep the driver's
    // rating on this device instead of losing it; real errors still surface
    if (byRole === "host" || e?.status !== 404) throw e
    const review = {
      bookingId,
      hostId: body.hostId || null,
      driverName: body.driverName || "EV Driver",
      stars: body.stars,
      comment: String(comment || ""),
      tags: Array.isArray(tags) ? tags : [],
      at: Date.now(),
      local: true,
    }
    saveLocalReview(review)
    return { review, local: true }
  })
}

export const reviewDriverBooking = (
  bookingId,
  stars,
  comment = "",
  tags = [],
  extra = {},
) =>
  post(`/bookings/${encodeURIComponent(bookingId)}/driver-review`, {
    stars: Math.round(Number(stars) || 5),
    comment,
    tags,
    ...(extra && typeof extra === "object" ? extra : {}),
  })

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
