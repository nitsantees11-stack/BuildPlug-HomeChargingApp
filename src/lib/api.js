import { ApiError, request } from "./config"
import { getToken } from "./supabase"

const HOST_PHOTO_CACHE_KEY = "plughome:host_photos"

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

// actions — the server decides status, kWh and money; callers only ask
export const createBooking = (hostId, startSoc, targetSoc) =>
  post("/bookings", { hostId, startSoc, targetSoc })
// "mark_paid" = the driver confirms they paid the host directly; no silent
// retry under another action name, so a server mismatch surfaces as an error
export const bookingAction = (bookingId, action) =>
  post(`/bookings/${encodeURIComponent(bookingId)}/action`, { action })
export const confirmReading = (bookingId, stage, value) =>
  post(`/bookings/${encodeURIComponent(bookingId)}/readings/${stage}/confirm`, {
    value,
  })

// Preserves photo/photoUrl/img/image/photos when listing a socket
export const listMySocket = async (payload) => {
  const {
    name,
    locality,
    rate,
    socket,
    perks,
    lat,
    lng,
    photo,
    photoUrl,
    img,
    image,
    photos,
    ...rest
  } = payload || {}

  const resolvedPhoto =
    photo || photoUrl || img || image || (Array.isArray(photos) ? photos[0] : null)

  if (resolvedPhoto && name) {
    saveHostPhotoCache(`${name.trim().toLowerCase()}|${(locality || "").trim().toLowerCase()}`, resolvedPhoto)
    saveHostPhotoCache(name.trim().toLowerCase(), resolvedPhoto)
  }

  const res = await post("/hosts", {
    name,
    locality,
    rate,
    socket,
    perks,
    lat,
    lng,
    photo: resolvedPhoto,
    photoUrl: resolvedPhoto,
    img: resolvedPhoto,
    image: resolvedPhoto,
    photos: photos || (resolvedPhoto ? [resolvedPhoto] : undefined),
    ...rest,
  })

  if (resolvedPhoto && res?.id) {
    saveHostPhotoCache(res.id, resolvedPhoto)
  }
  return res
}

export const setSocketOnline = (hostId, online) =>
  post(`/hosts/${encodeURIComponent(hostId)}/online`, { online })
export const removeSocket = (hostId) =>
  authed(`/hosts/${encodeURIComponent(hostId)}`, { method: "DELETE" })
// the driver rates a paid session once (1-5 stars, optional comment)
export const reviewBooking = (bookingId, stars, comment = "") =>
  post(`/bookings/${encodeURIComponent(bookingId)}/review`, { stars, comment })

// uploads
export const signUpload = (params) => post("/uploads/sign", params)
export const completeUpload = (params) => post("/uploads/complete", params)
