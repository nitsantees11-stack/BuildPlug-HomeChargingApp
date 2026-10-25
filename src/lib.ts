// @ts-nocheck
export const EASE = {
  out: [0.16, 1, 0.3, 1],
  inOut: [0.65, 0, 0.35, 1],
  back: [0.34, 1.56, 0.64, 1],
}
export const SPRING = {
  soft: { type: "spring", stiffness: 140, damping: 20 },
  snap: { type: "spring", stiffness: 320, damping: 26 },
  bouncy: { type: "spring", stiffness: 420, damping: 16 },
}

// ---- calc ----
export const PACK = 26
export const rangeKm = (soc) => Math.round(soc * 2.7)
export const kwhNeeded = (t, s) => Math.max(0, ((t - s) / 100) * PACK)
export const round1 = (n) => Math.round(n * 10) / 10
export const hoursFor = (kwh, kw) => kwh / Math.min(kw, 7.2)
export const fmtHours = (h) => {
  const m = Math.round(h * 60)
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`
}
export const co2 = (kwh) => kwh * 0.8
// a usable map point: both coordinates finite and in range (null/NaN/missing → false)
export const hasLoc = (p) =>
  Boolean(p) &&
  Number.isFinite(p.lat) &&
  Number.isFinite(p.lng) &&
  Math.abs(p.lat) <= 90 &&
  Math.abs(p.lng) <= 180
export const haversine = (a, b) => {
  if (!hasLoc(a) || !hasLoc(b)) return NaN
  const R = 6371,
    r = Math.PI / 180
  const dLat = (b.lat - a.lat) * r,
    dLng = (b.lng - a.lng) * r
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(x))
}
export const etaMins = (km) => Math.max(1, Math.ceil(((km * 1.3) / 22) * 60))
// Google Maps URL uses lat,lng order. No destination → null; without a known
// origin Maps starts from the phone's own location.
export const gmaps = (u, h) =>
  hasLoc(h)
    ? `https://www.google.com/maps/dir/?api=1${
        hasLoc(u) ? `&origin=${u.lat},${u.lng}` : ""
      }&destination=${h.lat},${h.lng}&travelmode=driving`
    : null

// ---- leaflet loader (CDN, no npm) ----
let leafletP = null
export function loadLeaflet() {
  if (typeof window === "undefined") return Promise.reject(new Error("ssr"))
  if (window.L) return Promise.resolve(window.L)
  if (leafletP) return leafletP
  leafletP = new Promise((resolve, reject) => {
    const css = document.createElement("link")
    css.rel = "stylesheet"
    css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
    document.head.appendChild(css)
    const s = document.createElement("script")
    s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
    const t = setTimeout(() => reject(new Error("timeout")), 8000)
    s.onload = () => {
      clearTimeout(t)
      resolve(window.L)
    }
    s.onerror = () => {
      clearTimeout(t)
      reject(new Error("load"))
    }
    document.body.appendChild(s)
  }).catch((e) => {
    leafletP = null
    throw e
  })
  return leafletP
}

// ---- routing (OSRM: lng,lat in URL; GeoJSON back as [lng,lat] -> flip) ----
// null when either end has no real coordinates — never a made-up route
export async function fetchRoute(u, h) {
  if (!hasLoc(u) || !hasLoc(h)) return null
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 6000)
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${u.lng},${u.lat};${h.lng},${h.lat}?overview=full&geometries=geojson&steps=true`
    const r = await fetch(url, { signal: ctrl.signal })
    const j = await r.json()
    const route = j.routes[0]
    const coords = route.geometry.coordinates.map(([lng, lat]) => [lat, lng])
    const raw = route.legs[0].steps
    const pick = raw.length > 3 ? [raw[0], raw[1], raw[raw.length - 1]] : raw
    const steps = pick.map((s) => {
      const name = s.name || "local road"
      const m = Math.round(s.distance)
      if (s.maneuver.type === "depart") return `Head out on ${name} · ${m} m`
      if (s.maneuver.type === "arrive")
        return "Arrive at host · gate on the left"
      return `Turn ${s.maneuver.modifier || ""} onto ${name} · ${m} m`.replace(
        "  ",
        " ",
      )
    })
    const via = raw.find((s) => s.name)?.name
    return {
      coords,
      km: route.distance / 1000,
      mins: Math.max(1, Math.round(route.duration / 60)),
      steps,
      via,
      real: true,
    }
  } catch {
    const km = haversine(u, h) * 1.3
    return {
      coords: [
        [u.lat, u.lng],
        [h.lat, h.lng],
      ],
      km,
      mins: Math.max(1, Math.round((km / 22) * 60)),
      steps: null,
      via: null,
      real: false,
    }
  } finally {
    clearTimeout(t)
  }
}
export async function reverseGeocode(lat, lng) {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&zoom=16&lat=${lat}&lon=${lng}`,
    )
    const j = await r.json()
    const a = j.address || {}
    return (
      [
        a.suburb || a.neighbourhood || a.road,
        a.city || a.town || a.state_district,
      ]
        .filter(Boolean)
        .join(", ") || ""
    )
  } catch {
    return ""
  }
}
export async function geocode(q) {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q + ", India")}`,
    )
    const j = await r.json()
    if (j[0]) return { lat: +j[0].lat, lng: +j[0].lon }
  } catch {}
  return null
}

// ---- ProofEngine showcase recipes ----
// These run on Cloudinary's public sample cloud to demonstrate the transforms;
// they are labelled as samples in the UI and never stand in for booking data.
const SAMPLE = "https://res.cloudinary.com/demo"
export const privacyBefore = () =>
  `${SAMPLE}/image/upload/c_fill,w_900,h_600/docs/models.jpg`
export const privacyAfter = () =>
  `${SAMPLE}/image/upload/e_improve:indoor/e_blur_faces:600/e_blur_region:900,x_620,y_430,w_220,h_90/fl_strip_profile/c_fill,w_900,h_600/co_rgb:0F172A,b_rgb:72D600,l_text:Arial_30_bold:VERIFIED%20HOST%20PASS,g_south_west,x_24,y_24/f_auto,q_auto:eco/docs/models.jpg`
export const videoOrig = () => `${SAMPLE}/video/upload/elephants.mp4`
export const videoOpt = () =>
  `${SAMPLE}/video/upload/f_auto,q_auto:eco,w_640,so_0,du_6/elephants.mp4`
export const videoPoster = () =>
  `${SAMPLE}/video/upload/so_0,f_jpg,w_640/elephants.jpg`
