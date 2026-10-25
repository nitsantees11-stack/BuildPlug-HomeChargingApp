// @ts-nocheck
// Judge Mode: a local-only simulation for walkthroughs. Everything here lives
// in this browser tab — no Supabase auth, no server data, no uploads, no
// realtime. Live mode never imports these chargers, bookings or images; the
// server has no sample hosts at all.
import { PACK, round1 } from "./lib"

export const DEMO_LOC = { lat: 28.627, lng: 77.372 }
export const DEMO_AREA = "Sector 62, Noida"
export const DEMO_USERS = {
  driver: { id: "demo-driver", name: "Aarav Mehta" },
  host: { id: "demo-host", name: "Sharma Ji" },
}
export const DEMO_STATS = {
  totalEarned: 14820,
  energyShared: 1140,
  online: true,
  last7: [1640, 2120, 1880, 2460, 1990, 2700, 2030],
  cars: 42,
}

const KW = { "15A Plug": 3.3, "7.2kW Wallbox": 7.2, "11kW AC": 11 }
const initials = (s) =>
  s
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()

// sample chargers around Sector 62 — shapes match live.js rowToHost
const HOSTS = [
  ["h1", "Sharma Villa Solar Driveway", DEMO_USERS.host.id, "Sharma Ji", 28.6292, 77.3745, "Sector 62, Noida", "7.2kW Wallbox", 12, ["CCTV", "Solar", "Free Chai"], 4.8, 36, true],
  ["h2", "Gupta Residence Porch", "demo-gupta", "Neha Gupta", 28.6235, 77.368, "Sector 61, Noida", "15A Plug", 10, ["Family Verified"], 4.6, 19, true],
  ["h3", "Verma Kothi Garage", "demo-verma", "Anil Verma", 28.6331, 77.3792, "Sector 63, Noida", "11kW AC", 14, ["CCTV", "Family Verified"], 4.9, 52, true],
  ["h4", "Iyer Apartments Basement", "demo-iyer", "Lakshmi Iyer", 28.6198, 77.3803, "Sector 59, Noida", "7.2kW Wallbox", 13, ["CCTV"], 4.5, 11, true],
  ["h5", "Khanna House Driveway", "demo-khanna", "Rakesh Khanna", 28.6368, 77.3655, "Sector 71, Noida", "15A Plug", 9, ["Free Chai", "Solar"], null, 0, true],
  ["h6", "Bansal Bungalow Carport", "demo-bansal", "Meera Bansal", 28.6151, 77.3712, "Sector 58, Noida", "7.2kW Wallbox", 12, ["Solar"], 4.7, 24, false],
]

export const demoHost = ({ id, name, ownerId, ownerName, lat, lng, locality, socket, rate, perks, rating = null, reviews = 0, online = true, isNew = false }) => ({
  id,
  name,
  ownerId,
  ownerName,
  demo: true,
  ownerInitials: initials(ownerName || name),
  lat,
  lng,
  locality,
  socket,
  kw: KW[socket] ?? 3.3,
  rate,
  perks,
  rating: reviews > 0 ? rating : null,
  reviews,
  online,
  isNew,
  mediaPublicId: null,
  mediaType: null,
  // on-device object URL from a Judge Mode "upload" (never sent anywhere)
  mediaUrl: null,
  createdAt: 0,
})

export const demoHosts = () =>
  HOSTS.map(([id, name, ownerId, ownerName, lat, lng, locality, socket, rate, perks, rating, reviews, online]) =>
    demoHost({ id, name, ownerId, ownerName, lat, lng, locality, socket, rate, perks, rating, reviews, online }),
  )

// a simulated pin near Sector 62 for a socket listed in Judge Mode (no geocoding)
export const demoPin = (seed) => {
  let n = 0
  for (const c of String(seed)) n = (n * 31 + c.charCodeAt(0)) % 997
  return {
    lat: DEMO_LOC.lat + ((n % 21) - 10) * 0.0006,
    lng: DEMO_LOC.lng + (((n * 7) % 21) - 10) * 0.0006,
  }
}

// ---------- bookings: same shape as live.js rowToBooking ----------
const RAW = {
  requested: "requested",
  accepted: "accepted",
  startMeter: "start_meter",
  charging: "charging",
  endMeter: "end_meter",
  awaitingPay: "awaiting_pay",
  paid: "paid",
  cancelled: "cancelled",
  declined: "declined",
}
const estimate = (startSoc, targetSoc) =>
  round1(((targetSoc - startSoc) / 100) * PACK)

export function demoBooking({ id, host, driverId, driver, car = "Tata Nexon EV", startSoc, targetSoc, status = "requested", at = Date.now() }) {
  const estimateKwh = estimate(startSoc, targetSoc)
  return {
    id,
    hostId: host.id,
    hostName: host.name,
    hostOwnerId: host.ownerId,
    driverId,
    demoHost: true,
    driver,
    car,
    status,
    rawStatus: RAW[status],
    startSoc,
    targetSoc,
    rate: host.rate,
    estimateKwh,
    estimateAmount: Math.round(estimateKwh * host.rate),
    startKwh: null,
    endKwh: null,
    kwhUsed: 0,
    amount: 0,
    hasBill: false,
    ref: null,
    paidAt: null,
    disputeStage: null,
    createdAt: at,
    updatedAt: at,
  }
}

// stable simulated meter counter per charger
export const demoMeterStart = (hostId) => {
  let n = 0
  for (const c of String(hostId)) n += c.charCodeAt(0)
  return round1(1400 + (n % 90) + 0.6)
}

export function demoReading(bookingId, stage, value, confirmed = false) {
  return {
    bookingId,
    stage,
    publicId: null,
    localUrl: meterImage(value, stage === "end" ? "END" : "START"),
    simulated: true,
    ocrKwh: null,
    driverValue: confirmed ? value : null,
    hostValue: confirmed ? value : null,
    suggested: value,
    status: confirmed ? "confirmed" : "pending",
    uploadedAt: Date.now(),
    uploadedBy: null,
  }
}

// local state machine mirroring the server's transitions
export function demoStep(b, action, value, now = Date.now()) {
  const to = (status, extra = {}) => ({
    ...b,
    ...extra,
    status,
    rawStatus: RAW[status],
    updatedAt: now,
  })
  switch (`${b.status}:${action}`) {
    case "requested:accept":
      return to("accepted")
    case "requested:decline":
      return to("declined")
    case "requested:cancel":
      return to("cancelled")
    case "accepted:arrive":
      return to("startMeter")
    case "startMeter:confirm_start":
      return to("charging", { startKwh: value })
    case "charging:finish_charging":
      return to("endMeter")
    case "endMeter:confirm_end": {
      const kwhUsed = round1(Math.max(0, value - b.startKwh))
      return to("awaitingPay", {
        endKwh: value,
        kwhUsed,
        amount: Math.round(kwhUsed * b.rate),
        hasBill: true,
      })
    }
    case "awaitingPay:mark_paid":
      return to("paid", {
        paidAt: now,
        ref: `PH-DEMO-${String(now).slice(-4)}`,
      })
    default:
      return b
  }
}

export function demoState() {
  const [h1] = demoHosts()
  const now = Date.now()
  const requested = demoBooking({
    id: "demo-b1",
    host: h1,
    driverId: "demo-priya",
    driver: "Priya Kapoor",
    startSoc: 22,
    targetSoc: 80,
    at: now - 4 * 60000,
  })
  const start = demoMeterStart(h1.id)
  let paid = demoBooking({
    id: "demo-b2",
    host: h1,
    driverId: "demo-rohit",
    driver: "Rohit Verma",
    car: "MG ZS EV",
    startSoc: 30,
    targetSoc: 90,
    status: "startMeter",
    at: now - 26 * 3600000,
  })
  const end = round1(start + paid.estimateKwh)
  paid = demoStep(paid, "confirm_start", start, now - 26 * 3600000)
  paid = demoStep(paid, "finish_charging", null, now - 24 * 3600000)
  paid = demoStep(paid, "confirm_end", end, now - 24 * 3600000)
  paid = demoStep(paid, "mark_paid", null, now - 24 * 3600000 + 120000)
  return {
    bookings: [requested, paid],
    readings: {
      [paid.id]: {
        start: demoReading(paid.id, "start", start, true),
        end: demoReading(paid.id, "end", end, true),
      },
    },
  }
}

// ---------- simulated images (inline SVG, nothing fetched) ----------
const svgUrl = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
const kwh1 = (v) => (v == null ? "----.-" : Number(v).toFixed(1))
const meterSvg = (value, label, x = 0, w = 600, h = 400) => `
<g transform="translate(${x} 0)">
<rect width="${w}" height="${h}" fill="#E8EEE4"/>
<rect x="${w * 0.12}" y="${h * 0.14}" width="${w * 0.76}" height="${h * 0.62}" rx="26" fill="#F8FAFC" stroke="#94A3B8" stroke-width="4"/>
<rect x="${w * 0.19}" y="${h * 0.27}" width="${w * 0.62}" height="${h * 0.24}" rx="10" fill="#1E293B"/>
<text x="${w / 2}" y="${h * 0.45}" text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="${h * 0.13}" font-weight="700" fill="#B5F56B">${kwh1(value)}</text>
<text x="${w / 2}" y="${h * 0.62}" text-anchor="middle" font-family="Inter,sans-serif" font-size="${h * 0.05}" font-weight="700" fill="#475569">kWh · ${label}</text>
<text x="${w / 2}" y="${h * 0.9}" text-anchor="middle" font-family="Inter,sans-serif" font-size="${h * 0.045}" font-weight="700" fill="#92400E">SIMULATED METER · JUDGE DEMO</text>
</g>`
export const meterImage = (value, label) =>
  svgUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400">${meterSvg(value, label)}</svg>`,
  )
// side-by-side bill, same layout as the Cloudinary composite in live mode
export const demoBillUrl = (b) =>
  b?.hasBill
    ? svgUrl(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630">${meterSvg(b.startKwh, "START", 0, 600, 630)}${meterSvg(b.endKwh, "END", 600, 600, 630)}<rect x="300" y="540" width="600" height="64" rx="16" fill="#72D600"/><text x="600" y="583" text-anchor="middle" font-family="Inter,sans-serif" font-size="30" font-weight="800" fill="#0F172A">NET ${kwh1(b.kwhUsed)} kWh | BILL Rs ${b.amount}</text></svg>`,
      )
    : null

// ---------- on-device media for Judge Mode listings ----------
const objectUrls = new Set()
export function demoMediaUrl(file) {
  const url = URL.createObjectURL(file)
  objectUrls.add(url)
  return url
}
export function revokeDemoMedia(url) {
  const all = url ? [url] : [...objectUrls]
  all.forEach((u) => {
    if (!objectUrls.delete(u)) return
    try {
      URL.revokeObjectURL(u)
    } catch {}
  })
}
