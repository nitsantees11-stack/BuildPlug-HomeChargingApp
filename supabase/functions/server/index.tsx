// PLUG-HOME edge function.
import { Hono } from "npm:hono"
import { cors } from "npm:hono/cors"
import { logger } from "npm:hono/logger"
import { createClient } from "jsr:@supabase/supabase-js@2.49.8"
import * as kv from "./kv_store.tsx"

const app = new Hono()
const P = "/make-server-14a63397"

app.use("*", logger(console.log))

app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization", "apikey"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
)

const env = (k: string) => (Deno.env.get(k) ?? "").trim()
const SUPABASE_URL = env("SUPABASE_URL")
const SERVICE_KEY = env("SUPABASE_SERVICE_ROLE_KEY")
const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const cld = () => ({
  cloud: env("CLOUDINARY_CLOUD_NAME") || "kegek3qo",
  key: env("CLOUDINARY_API_KEY") || "147459677335848",
  secret: env("CLOUDINARY_API_SECRET"),
})
const cldReady = () => {
  const c = cld()
  return Boolean(c.cloud && c.key && c.secret)
}
const ocrOn = () => /^(1|true|yes|adv_ocr)$/i.test(env("CLOUDINARY_OCR"))
const storageMode = () =>
  env("MEDIA_STORAGE").toLowerCase() === "supabase" || !cldReady()
    ? "supabase"
    : "cloudinary"

const PACK = 26
const DAY = 86400000
const IST = 19800000
const MB = 1024 * 1024

interface Socket {
  label: string
  kw: number
}
interface Message {
  topic: string
  event: string
  payload: unknown
}
interface DbResult {
  data: any
  error: any
}
interface Bucket {
  id: string
  maxBytes: number
  types: string[]
  ttl: number
}
interface Signed {
  url: string
  exp: number
  ttl: number
}
const SOCKETS: Record<string, Socket> = {
  "15A Plug": { label: "15A Plug", kw: 3.3 },
  "7.2kW Wallbox": { label: "7.2kW Type-2", kw: 7.2 },
  "7.2kW Fast": { label: "7.2kW Type-2", kw: 7.2 },
  "11kW AC": { label: "11kW AC", kw: 7.2 },
}
const PERKS = ["CCTV", "Family Verified", "Free Chai", "Solar"]
const ACTIONS = [
  "accept",
  "decline",
  "cancel",
  "arrive",
  "finish_charging",
  "mark_paid",
  "pay_demo",
  "recheck",
]
const STAGE_STATUS: Record<string, string> = {
  start: "start_meter",
  end: "end_meter",
}
const IN_FLIGHT = [
  "requested",
  "accepted",
  "start_meter",
  "charging",
  "end_meter",
  "awaiting_pay",
  "disputed",
]
const IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]
const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"]
const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
}
const BUCKETS: Record<string, Bucket> = {
  host_media: {
    id: "make-14a63397-host-media",
    maxBytes: 50 * MB,
    types: [...IMAGE_TYPES, ...VIDEO_TYPES],
    ttl: 7 * 86400,
  },
  meter: {
    id: "make-14a63397-meter-photos",
    maxBytes: 10 * MB,
    types: IMAGE_TYPES,
    ttl: 86400,
  },
  avatar: {
    id: "make-14a63397-avatars",
    maxBytes: 10 * MB,
    types: IMAGE_TYPES,
    ttl: 30 * 86400,
  },
}
const HUMAN: Record<string, string> = {
  requested: "waiting for the host",
  accepted: "accepted",
  start_meter: "at the start meter",
  charging: "charging",
  end_meter: "at the end meter",
  awaiting_pay: "waiting for payment",
  paid: "paid",
  cancelled: "cancelled",
  declined: "declined",
  disputed: "disputed",
}

class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}
const fail = (status: number, message: string): never => {
  throw new HttpError(status, message)
}
app.onError((e, c) => {
  if (e instanceof HttpError)
    return c.json({ error: e.message }, e.status as any)
  console.log("Unhandled server error:", e)
  return c.json(
    { error: "Something went wrong on the server — please try again." },
    500,
  )
})
const stale = (b: any) =>
  fail(
    409,
    `This booking is now ${HUMAN[b.status] ?? b.status} — refreshing to the latest state.`,
  )
function dbFail(error: any): never {
  const code = String(error?.code ?? "")
  if (/^PH\d{3}$/.test(code)) fail(Number(code.slice(2)), error.message)
  if (["42P01", "42883", "PGRST202", "PGRST205"].includes(code)) {
    dbReady = false
    fail(
      503,
      "The PLUG-HOME database isn't set up yet — run the schema migration.",
    )
  }
  console.log("Database error:", error)
  return fail(500, "Database error — please try again.")
}
const must = (res: DbResult) => {
  if (res.error) dbFail(res.error)
  return res.data
}

const readBody = async (c: any) => {
  try {
    const b = await c.req.json()
    return b && typeof b === "object" ? b : {}
  } catch {
    return {}
  }
}
const round1 = (n: number) => Math.round(n * 10) / 10
const isNum = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v)
const shortId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 12)
const clean = (v: unknown, max: number) =>
  String(v ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, max)
const initialsOf = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase() || "PH"
const ms = (t: unknown) => (t ? Date.parse(String(t)) : null)
const num = (v: unknown) => (v == null ? null : Number(v))

async function sha1Hex(s: string) {
  const d = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s))
  return Array.from(new Uint8Array(d), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("")
}

const cldAvatarUrl = (publicId: string) =>
  `https://res.cloudinary.com/${cld().cloud}/image/upload/c_fill,g_face,w_256,h_256,f_auto,q_auto/${publicId.split("/").map(encodeURIComponent).join("/")}`

const hostOut = (r: any) => ({
  id: r.id,
  name: r.name,
  ownerId: r.owner_id,
  ownerName: r.owner_name,
  ownerInitials: r.owner_initials,
  demo: r.demo,
  lat: num(r.lat),
  lng: num(r.lng),
  locality: r.locality,
  socket: r.socket,
  kw: num(r.kw),
  rate: r.rate,
  perks: r.perks ?? [],
  rating: r.reviews > 0 ? num(r.rating) : null,
  reviews: r.reviews,
  online: r.online,
  mediaPublicId: r.media_public_id,
  mediaType: r.media_type,
  createdAt: r.demo ? 0 : ms(r.created_at),
})
const bookingOut = (r: any) => ({
  id: r.id,
  hostId: r.host_id,
  hostName: r.host_name,
  hostOwnerId: r.host_owner_id,
  driverId: r.driver_id,
  driverName: r.driver_name,
  car: r.car,
  demoHost: r.demo_host,
  status: r.status,
  startSoc: r.start_soc,
  targetSoc: r.target_soc,
  rate: r.rate,
  estimateKwh: num(r.estimate_kwh),
  estimateAmount: r.estimate_amount,
  startKwh: num(r.start_kwh),
  endKwh: num(r.end_kwh),
  kwhUsed: num(r.kwh_used),
  amount: r.amount,
  ref: r.ref,
  paidAt: ms(r.paid_at),
  disputeStage: r.dispute_stage,
  createdAt: ms(r.created_at),
  updatedAt: ms(r.updated_at),
})
const readingOut = (r: any) =>
  r
    ? {
        bookingId: r.booking_id,
        stage: r.stage,
        publicId: r.public_id,
        ocrKwh: num(r.ocr_kwh),
        driverValue: num(r.driver_value),
        hostValue: num(r.host_value),
        status: r.status,
        uploadedAt: ms(r.uploaded_at),
        uploadedBy: r.uploaded_by,
      }
    : null

const SB = "sb:"
const parseStored = (id: unknown) => {
  const m = /^sb:([^/]+)\/(.+)$/.exec(String(id ?? ""))
  return m ? { bucket: m[1], path: m[2] } : null
}
let bucketsReady = false
async function ensureBuckets() {
  if (bucketsReady) return true
  const { data, error } = await db.storage.listBuckets()
  if (error) {
    console.log("Supabase Storage unavailable:", error)
    return false
  }
  for (const b of Object.values(BUCKETS)) {
    if (data?.some((x: any) => x.id === b.id)) continue
    const { error: e } = await db.storage.createBucket(b.id, {
      public: false,
      fileSizeLimit: b.maxBytes,
      allowedMimeTypes: b.types,
    })
    if (e && !/exist/i.test(e.message ?? "")) {
      console.log(`Couldn't create storage bucket ${b.id}:`, e)
      return false
    }
  }
  bucketsReady = true
  return true
}
ensureBuckets().catch((e) => console.log("Bucket setup error:", e))

const signedCache = new Map<string, Signed>()
async function signMedia(ids: unknown[]) {
  const out = new Map<string, string>()
  const todo = new Map<string, string[]>()
  const now = Date.now()
  for (const id of new Set(ids.map((v) => String(v ?? "")))) {
    const ref = parseStored(id)
    if (!ref) continue
    const hit = signedCache.get(id)
    if (hit && hit.exp - now > (hit.ttl * 1000) / 4) out.set(id, hit.url)
    else todo.set(ref.bucket, [...(todo.get(ref.bucket) ?? []), ref.path])
  }
  await Promise.all(
    [...todo].map(async ([bucket, paths]) => {
      const ttl =
        Object.values(BUCKETS).find((b) => b.id === bucket)?.ttl ?? 3600
      const { data, error } = await db.storage
        .from(bucket)
        .createSignedUrls(paths, ttl)
      if (error) return console.log("Signing media URLs failed:", error)
      for (const d of data ?? []) {
        if (d.error || !d.signedUrl || !d.path) continue
        const id = `${SB}${bucket}/${d.path}`
        signedCache.set(id, { url: d.signedUrl, exp: now + ttl * 1000, ttl })
        out.set(id, d.signedUrl)
      }
    }),
  )
  return out
}
async function hostsOut(rows: any[]) {
  const hosts = rows.map(hostOut)
  const urls = await signMedia(hosts.map((h) => h.mediaPublicId))
  return hosts.map((h) => {
    const mediaUrl = urls.get(h.mediaPublicId ?? "")
    return mediaUrl ? { ...h, mediaUrl } : h
  })
}
async function readingsOut(rows: any[]) {
  const urls = await signMedia(rows.map((r) => r?.public_id))
  return rows.map((r) => {
    const out = readingOut(r)
    const photoUrl = out && urls.get(out.publicId ?? "")
    return out && photoUrl ? { ...out, photoUrl } : out
  })
}

async function auth(c: any) {
  const token = c.req.header("Authorization")?.split(" ")[1]
  if (!token) fail(401, "Please log in again.")
  const { data, error } = await db.auth.getUser(token)
  if (error || !data?.user)
    fail(401, "Your session has expired — please log in again.")
  const user = data.user!
  const { data: row } = await db
    .from("profiles")
    .select("name, role")
    .eq("id", user.id)
    .maybeSingle()
  if (row) return { id: user.id, email: user.email, profile: row }
  const profile = {
    name:
      clean(user.user_metadata?.name || user.user_metadata?.full_name, 60) ||
      "PLUG-HOME user",
    role: user.user_metadata?.role === "host" ? "host" : "driver",
  }
  await db.from("profiles").upsert({ id: user.id, ...profile })
  return { id: user.id, email: user.email, profile }
}

// Helper to resolve full user profile (including Cloudinary/Storage avatar & EV/Host details) from KV
const userProfileKey = (uid: string) => `plughome:user_profile:${uid}`
async function resolveFullProfile(me: { id: string; email?: string; profile: any }) {
  const saved = (await kv.get(userProfileKey(me.id)).catch(() => null)) || {}
  let photoUrl = saved.photoUrl || ""
  if (saved.avatarPublicId) {
    if (parseStored(saved.avatarPublicId)) {
      const signed = await signMedia([saved.avatarPublicId])
      photoUrl = signed.get(saved.avatarPublicId) || photoUrl
    } else {
      photoUrl = cldAvatarUrl(saved.avatarPublicId)
    }
  }
  return {
    id: me.id,
    name: saved.name || me.profile.name,
    role: saved.role || me.profile.role,
    phone: saved.phone || "",
    email: saved.email || me.email || "",
    photoUrl,
    avatarPublicId: saved.avatarPublicId || null,
    driverDetails: saved.driverDetails || null,
    hostDetails: saved.hostDetails || null,
  }
}

async function broadcast(messages: Message[]) {
  if (!messages.length) return
  try {
    const r = await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({
        messages: messages.map((m) => ({ ...m, private: false })),
      }),
    })
    if (!r.ok) console.log("Broadcast failed:", r.status, await r.text())
  } catch (e) {
    console.log("Broadcast error:", e)
  }
}
const parties = (b: any) => [b.driver_id, b.host_owner_id].filter(Boolean)
const bookingMsgs = (
  b: any,
  events = ["booking"],
  extra: Record<string, unknown> = {},
) =>
  parties(b).flatMap((uid) =>
    events.map((event) => ({
      topic: `plughome-user-${uid}`,
      event,
      payload: { id: b.id, bookingId: b.id, status: b.status, ...extra },
    })),
  )
const hostMsg = (host: any) => ({
  topic: "plughome-hosts",
  event: "host",
  payload: { host },
})

const getHost = async (id: string) =>
  must(await db.from("hosts").select("*").eq("id", id).maybeSingle()) ??
  fail(404, "That charger no longer exists.")
const getBooking = async (id: string) =>
  must(await db.from("bookings").select("*").eq("id", id).maybeSingle()) ??
  fail(404, "That booking no longer exists.")
const getReading = async (id: string, stage: string) =>
  must(
    await db
      .from("meter_readings")
      .select("*")
      .eq("booking_id", id)
      .eq("stage", stage)
      .maybeSingle(),
  )
const partyOf = (b: any, uid: string) =>
  b.driver_id === uid
    ? "driver"
    : b.host_owner_id && b.host_owner_id === uid
      ? "host"
      : null
const asParty = (b: any, uid: string) =>
  partyOf(b, uid) ?? fail(404, "That booking no longer exists.")

let dbReady = false
async function checkDb() {
  if (dbReady) return true
  const { error } = await db.from("hosts").select("id").limit(1)
  if (error) console.log("Database check note:", error)
  else dbReady = true
  return dbReady
}

// ---------- Mutual Reviews (Driver <-> Host in KV store) ----------
const reviewKey = (hostId: string, bookingId: string) =>
  `plughome:review:${hostId}:${bookingId}`
const driverReviewKey = (driverId: string, bookingId: string) =>
  `plughome:driver_review:${driverId}:${bookingId}`

const reviewOut = (r: any) =>
  r && {
    bookingId: r.bookingId,
    hostId: r.hostId,
    stars: r.stars,
    tags: Array.isArray(r.tags) ? r.tags : [],
    comment: r.comment,
    driverName: r.driverName,
    at: r.at,
  }
const driverReviewOut = (r: any) =>
  r && {
    bookingId: r.bookingId,
    driverId: r.driverId,
    stars: r.stars,
    tags: Array.isArray(r.tags) ? r.tags : [],
    comment: r.comment,
    hostName: r.hostName,
    at: r.at,
  }

async function withReviews(rows: any[]) {
  const out = rows.map(bookingOut)
  if (!rows.length) return out

  const paid = rows.filter((r) => r.status === "paid")
  const hostReviewKeys = paid
    .filter((r) => r.host_id)
    .map((r) => reviewKey(r.host_id, r.id))
  const drvReviewKeys = paid
    .filter((r) => r.driver_id)
    .map((r) => driverReviewKey(r.driver_id, r.id))

  const [foundHostRevs, foundDrvRevs] = await Promise.all([
    hostReviewKeys.length
      ? kv.mget(hostReviewKeys).catch(() => [])
      : Promise.resolve([]),
    drvReviewKeys.length
      ? kv.mget(drvReviewKeys).catch(() => [])
      : Promise.resolve([]),
  ])

  const byBookingHostRev = new Map<string, any>()
  for (const r of foundHostRevs)
    if (r?.bookingId) byBookingHostRev.set(r.bookingId, reviewOut(r))

  const byBookingDrvRev = new Map<string, any>()
  for (const r of foundDrvRevs)
    if (r?.bookingId) byBookingDrvRev.set(r.bookingId, driverReviewOut(r))

  const uniqueDrivers = [
    ...new Set(rows.map((r) => r.driver_id).filter(Boolean)),
  ]
  const driverStats = new Map<
    string,
    { rating: number | null; reviews: number; recent: any[] }
  >()
  await Promise.all(
    uniqueDrivers.map(async (did) => {
      try {
        const list = await kv.getByPrefix(`plughome:driver_review:${did}:`)
        const valid = list
          .map(driverReviewOut)
          .filter(Boolean)
          .sort((a: any, b: any) => b.at - a.at)
        const count = valid.length
        const avg =
          count > 0
            ? round1(
                valid.reduce(
                  (s: number, x: any) => s + Number(x.stars || 5),
                  0,
                ) / count,
              )
            : null
        driverStats.set(did, {
          rating: avg,
          reviews: count,
          recent: valid.slice(0, 5),
        })
      } catch {}
    }),
  )

  return out.map((b) => {
    const dStat = driverStats.get(b.driverId)
    return {
      ...b,
      review: byBookingHostRev.get(b.id) || null,
      driverReview: byBookingDrvRev.get(b.id) || null,
      driverRating: dStat?.rating ?? null,
      driverReviewsCount: dStat?.reviews ?? 0,
      driverPastReviews: dStat?.recent ?? [],
    }
  })
}

// ---------- routes ----------
app.get(`${P}/health`, async (c) =>
  c.json({ status: "ok", database: await checkDb() }),
)

app.get(`${P}/config`, async (c) => {
  await checkDb().catch(() => false)
  const storage = storageMode()
  return c.json({
    cloudName: cld().cloud || null,
    storage,
    uploads: storage === "cloudinary" || (await ensureBuckets()),
    ocr: storage === "cloudinary" && ocrOn(),
    packKwh: PACK,
  })
})

app.post(`${P}/auth/signup`, async (c) => {
  const body = await readBody(c)
  const name = clean(body.name, 60) || "PLUG-HOME user"
  const role = body.role === "host" ? "host" : "driver"
  const rawPass = String(body.password ?? "")
  if (rawPass.length < 6 || rawPass.length > 128)
    fail(400, "Password must be at least 6 characters.")
  const email = `${crypto.randomUUID()}@users.plughome.app`
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: rawPass,
    email_confirm: true,
    user_metadata: { name, role },
  })
  if (error || !data?.user) {
    console.log("Signup failed:", error)
    fail(
      502,
      `Couldn't create your account: ${error?.message ?? "unknown error"}`,
    )
  }
  const { error: pErr } = await db
    .from("profiles")
    .upsert({ id: data.user!.id, name, role })
  if (pErr) console.log("Profile insert note:", pErr)
  return c.json({ email })
})

// GET /auth/profile -> Returns full persisted profile & Cloudinary/Storage photoUrl
app.get(`${P}/auth/profile`, async (c) => {
  const me = await auth(c)
  const profile = await resolveFullProfile(me)
  return c.json({ profile })
})

// POST /auth/profile -> Saves name, role, photoUrl, avatarPublicId, driverDetails & hostDetails
app.post(`${P}/auth/profile`, async (c) => {
  const me = await auth(c)
  const body = await readBody(c)
  const existing = (await kv.get(userProfileKey(me.id)).catch(() => null)) || {}

  const name = clean(body.name, 60) || existing.name || me.profile.name
  const role =
    body.role === "host"
      ? "host"
      : body.role === "driver"
        ? "driver"
        : existing.role || me.profile.role

  await db.from("profiles").upsert({ id: me.id, name, role })

  const nextKv = {
    ...existing,
    name,
    role,
    phone: body.phone !== undefined ? clean(body.phone, 20) : existing.phone || "",
    email: body.email !== undefined ? clean(body.email, 120) : existing.email || me.email || "",
    photoUrl:
      body.photoUrl !== undefined ? String(body.photoUrl || "") : existing.photoUrl || "",
    avatarPublicId:
      body.avatarPublicId !== undefined
        ? body.avatarPublicId
        : body.photoUrl === ""
          ? null
          : existing.avatarPublicId || null,
    driverDetails:
      body.driverDetails !== undefined
        ? { ...(existing.driverDetails || {}), ...body.driverDetails }
        : existing.driverDetails || null,
    hostDetails:
      body.hostDetails !== undefined
        ? { ...(existing.hostDetails || {}), ...body.hostDetails }
        : existing.hostDetails || null,
    updatedAt: Date.now(),
  }

  await kv.set(userProfileKey(me.id), nextKv)
  const profile = await resolveFullProfile({ id: me.id, email: me.email, profile: { name, role } })
  return c.json({ profile })
})

// ----- hosts -----
app.get(`${P}/hosts`, async (c) => {
  const rows = must(
    await db
      .from("hosts")
      .select("*")
      .eq("demo", false)
      .order("created_at", { ascending: false })
      .limit(500),
  )
  return c.json({ hosts: await hostsOut(rows) })
})

app.post(`${P}/hosts`, async (c) => {
  const me = await auth(c)
  const body = await readBody(c)
  const name = clean(body.name, 60)
  if (name.length < 2) fail(400, "Give your socket a name.")
  const sock =
    SOCKETS[String(body.socket)] ?? fail(400, "Choose a socket type.")
  const rate = Number(body.rate)
  if (!Number.isInteger(rate) || rate < 8 || rate > 20)
    fail(400, "Rate must be between ₹8 and ₹20 per kWh.")
  const { count, error: cErr } = await db
    .from("hosts")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", me.id)
  if (cErr) dbFail(cErr)
  if ((count ?? 0) >= 5)
    fail(409, "You've reached the limit of 5 listed sockets.")
  const okLat = (v: unknown) => isNum(v) && Math.abs(v) <= 90
  const okLng = (v: unknown) => isNum(v) && Math.abs(v) <= 180
  if (!okLat(body.lat) || !okLng(body.lng))
    fail(
      400,
      "We couldn't place your socket on the map — add a more specific locality.",
    )
  const lat: number = body.lat,
    lng: number = body.lng
  const row = must(
    await db
      .from("hosts")
      .insert({
        id: `n${shortId()}`,
        owner_id: me.id,
        owner_name: me.profile.name,
        owner_initials: initialsOf(me.profile.name),
        demo: false,
        name,
        lat,
        lng,
        locality: clean(body.locality, 80),
        socket: sock.label,
        kw: sock.kw,
        rate,
        perks: Array.isArray(body.perks)
          ? PERKS.filter((p) => body.perks.includes(p))
          : [],
      })
      .select()
      .single(),
  )
  const [host] = await hostsOut([row])
  await broadcast([hostMsg(host)])
  return c.json({ host })
})

app.get(`${P}/hosts/:id/reviews`, async (c) => {
  const host = await getHost(c.req.param("id"))
  if (host.demo) return c.json({ reviews: [] })
  const rows = await kv.getByPrefix(`plughome:review:${host.id}:`)
  const reviews = rows
    .map(reviewOut)
    .filter(Boolean)
    .sort((a: any, b: any) => b.at - a.at)
    .slice(0, 50)
  return c.json({ reviews })
})

app.get(`${P}/drivers/:id/reviews`, async (c) => {
  const driverId = c.req.param("id")
  const rows = await kv.getByPrefix(`plughome:driver_review:${driverId}:`)
  const reviews = rows
    .map(driverReviewOut)
    .filter(Boolean)
    .sort((a: any, b: any) => b.at - a.at)
    .slice(0, 50)
  const count = reviews.length
  const rating =
    count > 0
      ? round1(
          reviews.reduce((s: number, r: any) => s + Number(r.stars || 5), 0) /
            count,
        )
      : null
  return c.json({ rating, count, reviews })
})

app.delete(`${P}/hosts/:id`, async (c) => {
  const me = await auth(c)
  const host = await getHost(c.req.param("id"))
  if (host.owner_id !== me.id) fail(403, "You can only remove your own socket.")
  const { count, error } = await db
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("host_id", host.id)
    .in("status", IN_FLIGHT)
  if (error) dbFail(error)
  if ((count ?? 0) > 0)
    fail(
      409,
      "Finish or decline the active booking before removing this socket.",
    )
  must(await db.from("hosts").delete().eq("id", host.id).eq("owner_id", me.id))
  const media = parseStored(host.media_public_id)
  if (media)
    db.storage
      .from(media.bucket)
      .remove([media.path])
      .then(({ error }) => error && console.log("Media cleanup:", error))
  await broadcast([
    {
      topic: "plughome-hosts",
      event: "host_removed",
      payload: { id: host.id },
    },
  ])
  return c.json({ removed: host.id })
})

app.post(`${P}/hosts/:id/online`, async (c) => {
  const me = await auth(c)
  const body = await readBody(c)
  const current = await getHost(c.req.param("id"))
  if (current.owner_id !== me.id)
    fail(403, "You can only change your own socket.")
  const row = must(
    await db
      .from("hosts")
      .update({ online: Boolean(body.online) })
      .eq("id", current.id)
      .eq("owner_id", me.id)
      .select()
      .single(),
  )
  const [host] = await hostsOut([row])
  await broadcast([hostMsg(host)])
  return c.json({ host })
})

// ----- bookings -----
app.get(`${P}/bookings`, async (c) => {
  const me = await auth(c)
  const rows = must(
    await db
      .from("bookings")
      .select("*")
      .or(`driver_id.eq.${me.id},host_owner_id.eq.${me.id}`)
      .eq("demo_host", false)
      .order("created_at", { ascending: false })
      .limit(100),
  )
  return c.json({ bookings: await withReviews(rows) })
})

app.post(`${P}/bookings`, async (c) => {
  const me = await auth(c)
  const body = await readBody(c)
  const startSoc = Number(body.startSoc),
    targetSoc = Number(body.targetSoc)
  if (
    !Number.isInteger(startSoc) ||
    !Number.isInteger(targetSoc) ||
    startSoc < 0 ||
    targetSoc > 100
  )
    fail(400, "Charge levels must be whole percentages between 0 and 100.")
  if (targetSoc <= startSoc)
    fail(400, "Your target charge must be above your current charge.")
  const host = await getHost(String(body.hostId ?? ""))
  if (host.demo || !host.owner_id)
    fail(409, "That listing isn't bookable — pick another charger.")
  if (!host.online)
    fail(409, `${host.name} just went offline — pick another charger.`)
  if (host.owner_id === me.id) fail(409, "You can't book your own socket.")
  const estimateKwh = round1(((targetSoc - startSoc) / 100) * PACK)
  must(
    await db
      .from("bookings")
      .update({ status: "cancelled" })
      .eq("driver_id", me.id)
      .eq("demo_host", true)
      .in("status", IN_FLIGHT),
  )
  const { data, error } = await db
    .from("bookings")
    .insert({
      id: `b${shortId()}`,
      host_id: host.id,
      host_name: host.name,
      host_owner_id: host.owner_id,
      driver_id: me.id,
      driver_name: me.profile.name,
      demo_host: false,
      status: "requested",
      start_soc: startSoc,
      target_soc: targetSoc,
      rate: host.rate,
      estimate_kwh: estimateKwh,
      estimate_amount: Math.round(estimateKwh * host.rate),
    })
    .select()
    .single()
  if (error) {
    const msg = `${error.message ?? ""} ${error.details ?? ""}`
    if (error.code === "23505" && msg.includes("one_active_per_driver"))
      fail(
        409,
        "You already have an active booking — finish or cancel it first.",
      )
    if (error.code === "23505" && msg.includes("one_active_per_host"))
      fail(409, `${host.name} is busy with another driver right now.`)
    dbFail(error)
  }
  await broadcast(bookingMsgs(data))
  return c.json({ booking: bookingOut(data) })
})

app.post(`${P}/bookings/:id/action`, async (c) => {
  const me = await auth(c)
  const body = await readBody(c)
  const action = String(body.action)
  if (!ACTIONS.includes(action)) fail(400, "Unknown booking action.")
  const paid = action === "mark_paid" || action === "pay_demo"
  const id = c.req.param("id")
  if (action === "finish_charging") {
    // The host owns the socket, so the HOST stops the session. The deployed
    // plughome_booking_action RPC still only lets the driver do this, so the
    // transition is done here: host-only, and only from `charging` (the
    // conditional update keeps it atomic if both sides tap at once).
    const cur = await getBooking(id)
    if (cur.host_owner_id !== me.id && cur.driver_id !== me.id)
      fail(404, "That booking no longer exists.")
    if (cur.host_owner_id !== me.id)
      fail(403, "Only the host can stop charging.")
    if (cur.status !== "charging") stale(cur)
    const moved = must(
      await db
        .from("bookings")
        .update({ status: "end_meter" })
        .eq("id", id)
        .eq("status", "charging")
        .select("id"),
    )
    if (!moved?.length) stale(await getBooking(id))
  } else {
    must(
      await db.rpc("plughome_booking_action", {
        p_booking_id: id,
        p_user: me.id,
        p_action: paid ? "pay_demo" : action,
        p_ref: paid ? `PH${shortId().slice(0, 8).toUpperCase()}` : null,
      }),
    )
  }
  const b = await getBooking(id)
  const events = action === "recheck" ? ["booking", "reading"] : ["booking"]
  await broadcast(bookingMsgs(b, events))
  return c.json({ booking: bookingOut(b) })
})

app.post(`${P}/bookings/:id/review`, async (c) => {
  const me = await auth(c)
  const body = await readBody(c)
  const stars = Number(body.stars)
  if (!Number.isInteger(stars) || stars < 1 || stars > 5)
    fail(400, "Pick a rating from 1 to 5 stars.")
  const b = await getBooking(c.req.param("id"))
  if (b.driver_id !== me.id) fail(403, "Only the driver can rate this session.")
  if (b.status !== "paid") fail(409, "You can rate the host once you've paid.")
  if (!b.host_id) fail(410, "That charger has been removed.")
  const key = reviewKey(b.host_id, b.id)
  if (await kv.get(key)) fail(409, "You've already rated this session.")
  const tags = Array.isArray(body.tags)
    ? body.tags.map((t: any) => clean(t, 32)).filter(Boolean).slice(0, 6)
    : []
  const review = {
    bookingId: b.id,
    hostId: b.host_id,
    stars,
    tags,
    comment: clean(body.comment, 280),
    driverName: me.profile.name,
    at: Date.now(),
  }
  await kv.set(key, review)
  const host = await getHost(b.host_id)
  const n = host.reviews ?? 0
  const avg = n > 0 ? (Number(host.rating) * n + stars) / (n + 1) : stars
  const row = must(
    await db
      .from("hosts")
      .update({ rating: round1(avg), reviews: n + 1 })
      .eq("id", host.id)
      .select()
      .single(),
  )
  const [out] = await hostsOut([row])
  await broadcast([hostMsg(out), ...bookingMsgs(b)])
  return c.json({ review: reviewOut(review), host: out })
})

app.post(`${P}/bookings/:id/driver-review`, async (c) => {
  const me = await auth(c)
  const body = await readBody(c)
  const stars = Number(body.stars)
  if (!Number.isInteger(stars) || stars < 1 || stars > 5)
    fail(400, "Pick a rating from 1 to 5 stars.")
  const b = await getBooking(c.req.param("id"))
  if (b.host_owner_id !== me.id)
    fail(403, "Only the host can rate the driver for this session.")
  if (b.status !== "paid")
    fail(409, "You can rate the driver once the session is paid.")
  const key = driverReviewKey(b.driver_id, b.id)
  if (await kv.get(key)) fail(409, "You've already rated this driver.")
  const tags = Array.isArray(body.tags)
    ? body.tags.map((t: any) => clean(t, 32)).filter(Boolean).slice(0, 6)
    : []
  const driverReview = {
    bookingId: b.id,
    driverId: b.driver_id,
    stars,
    tags,
    comment: clean(body.comment, 280),
    hostName: me.profile.name || b.host_name,
    at: Date.now(),
  }
  await kv.set(key, driverReview)
  await broadcast(bookingMsgs(b))
  return c.json({ driverReview: driverReviewOut(driverReview) })
})

// ----- meter readings -----
app.get(`${P}/bookings/:id/readings`, async (c) => {
  const me = await auth(c)
  const b = await getBooking(c.req.param("id"))
  asParty(b, me.id)
  const rows = must(
    await db.from("meter_readings").select("*").eq("booking_id", b.id),
  )
  const [start, end] = await readingsOut([
    rows.find((r: any) => r.stage === "start"),
    rows.find((r: any) => r.stage === "end"),
  ])
  return c.json({ start, end })
})

app.post(`${P}/bookings/:id/readings/:stage/confirm`, async (c) => {
  const me = await auth(c)
  const body = await readBody(c)
  const stage = c.req.param("stage")
  if (!STAGE_STATUS[stage]) fail(400, "Unknown meter stage.")
  const raw = Number(body.value)
  if (!Number.isFinite(raw) || raw <= 0 || raw > 10_000_000)
    fail(400, "Enter the kWh number shown on the meter.")
  const id = c.req.param("id")
  must(
    await db.rpc("plughome_confirm_reading", {
      p_booking_id: id,
      p_stage: stage,
      p_user: me.id,
      p_value: round1(raw),
      p_auto: false,
      p_max_kwh: PACK * 4,
    }),
  )
  const [b, r] = await Promise.all([getBooking(id), getReading(id, stage)])
  await broadcast(bookingMsgs(b, ["reading", "booking"], { stage }))
  const [reading] = await readingsOut([r])
  return c.json({ booking: bookingOut(b), reading })
})

// ----- uploads (meter, host_media, and avatar) -----
app.post(`${P}/uploads/sign`, async (c) => {
  const me = await auth(c)
  const body = await readBody(c)
  const purpose = String(body.purpose)
  const resourceType = body.resourceType === "video" ? "video" : "image"
  const uploadId = crypto.randomUUID()
  const tag = uploadId.replace(/-/g, "").slice(0, 10)
  let stem: string
  const rec: Record<string, unknown> = {
    id: uploadId,
    user_id: me.id,
    purpose,
    resource_type: resourceType,
  }
  if (purpose === "meter") {
    const stage = String(body.stage)
    if (!STAGE_STATUS[stage]) fail(400, "Unknown meter stage.")
    if (resourceType !== "image") fail(400, "Meter proof must be a photo.")
    const b = await getBooking(String(body.bookingId ?? ""))
    asParty(b, me.id)
    if (b.status !== STAGE_STATUS[stage]) stale(b)
    stem = `meters/${b.id}/${stage}-${tag}`
    Object.assign(rec, { booking_id: b.id, stage })
  } else if (purpose === "host_media") {
    const host = await getHost(String(body.hostId ?? ""))
    if (host.owner_id !== me.id)
      fail(403, "You can only add media to your own socket.")
    stem = `hosts/${host.id}/media-${tag}`
    rec.host_id = host.id
  } else if (purpose === "avatar") {
    if (resourceType !== "image") fail(400, "Profile photo must be an image.")
    stem = `avatars/${me.id}/avatar-${tag}`
  } else {
    return fail(400, "Unknown upload purpose.")
  }
  if (storageMode() === "supabase") {
    if (!(await ensureBuckets()))
      fail(503, "Photo storage isn't set up on the server yet.")
    const bucket = BUCKETS[purpose]
    const type = String(body.contentType ?? "").toLowerCase()
    if (!EXT[type] || !type.startsWith(`${resourceType}/`))
      fail(
        400,
        resourceType === "video"
          ? "Please choose an MP4, MOV or WebM video."
          : "Please choose a JPG, PNG, WebP or HEIC photo.",
      )
    if (!bucket.types.includes(type)) fail(400, "Invalid file type.")
    if (Number(body.size) > bucket.maxBytes)
      fail(413, `That file is too large — max ${bucket.maxBytes / MB} MB.`)
    const path = `${stem}.${EXT[type]}`
    const { data, error } = await db.storage
      .from(bucket.id)
      .createSignedUploadUrl(path)
    if (error || !data?.token) {
      console.log("Signed upload URL failed:", error)
      fail(502, "Couldn't prepare the upload — please retry.")
    }
    rec.public_id = `${SB}${bucket.id}/${path}`
    must(await db.from("uploads").insert(rec))
    return c.json({
      uploadId,
      provider: "supabase",
      bucket: bucket.id,
      path,
      token: data!.token,
      maxBytes: bucket.maxBytes,
      resourceType,
    })
  }
  const publicId = `plughome/${stem}`
  const params: Record<string, string | number> = {
    public_id: publicId,
    timestamp: Math.floor(Date.now() / 1000),
  }
  if (purpose === "meter" && ocrOn()) params.ocr = "adv_ocr"
  const { cloud, key, secret } = cld()
  const toSign = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&")
  const signature = await sha1Hex(toSign + secret)
  rec.public_id = publicId
  must(await db.from("uploads").insert(rec))
  return c.json({
    uploadId,
    provider: "cloudinary",
    params,
    signature,
    apiKey: key,
    cloudName: cloud,
    resourceType,
  })
})

function parseKwh(text: unknown) {
  const hits = String(text ?? "").match(/\d+(?:[.,]\d+)?/g) ?? []
  const best = hits.sort(
    (a, b) => b.replace(/\D/g, "").length - a.replace(/\D/g, "").length,
  )[0]
  const n = best ? Number(best.replace(",", ".")) : NaN
  return Number.isFinite(n) && n > 0 && n <= 10_000_000 ? round1(n) : null
}

app.post(`${P}/uploads/complete`, async (c) => {
  const me = await auth(c)
  const body = await readBody(c)
  const uploadId = String(body.uploadId ?? "")
  if (!/^[0-9a-f-]{36}$/i.test(uploadId))
    fail(404, "That upload has expired — please upload again.")
  const rec = must(
    await db
      .from("uploads")
      .select("*")
      .eq("id", uploadId)
      .eq("user_id", me.id)
      .maybeSingle(),
  )
  if (!rec) fail(404, "That upload has expired — please upload again.")
  if (rec.completed_at) fail(409, "That upload was already recorded.")
  if (Date.now() - (ms(rec.created_at) ?? 0) > DAY)
    fail(410, "That upload has expired — please upload again.")
  const stored = parseStored(rec.public_id)
  if (stored) {
    const cut = stored.path.lastIndexOf("/")
    const name = stored.path.slice(cut + 1)
    const { data, error } = await db.storage
      .from(stored.bucket)
      .list(stored.path.slice(0, cut), { search: name, limit: 10 })
    const obj = data?.find((o: any) => o.name === name)
    if (error || !obj) {
      console.log("Storage verify failed:", error ?? "object not found")
      fail(
        error ? 502 : 409,
        "Couldn't find the uploaded file — please upload again.",
      )
    }
    const mime = String(obj?.metadata?.mimetype ?? "")
    if (mime && !mime.startsWith(`${rec.resource_type}/`))
      fail(400, "That file type doesn't match the upload — please retry.")
  } else {
    const { cloud, key, secret } = cld()
    if (!secret) fail(503, "Photo uploads aren't set up on the server yet.")
    const path = rec.public_id.split("/").map(encodeURIComponent).join("/")
    const check = await fetch(
      `https://api.cloudinary.com/v1_1/${cloud}/resources/${rec.resource_type}/upload/${path}`,
      {
        headers: { Authorization: `Basic ${btoa(`${key}:${secret}`)}` },
      },
    ).catch(() => null)
    if (!check?.ok) {
      console.log(
        "Cloudinary verify failed:",
        check?.status,
        check && (await check.text()),
      )
      fail(
        check?.status === 404 ? 409 : 502,
        "Couldn't verify the upload with Cloudinary — please retry.",
      )
    }
  }
  const claimed = must(
    await db
      .from("uploads")
      .update({ completed_at: new Date().toISOString() })
      .eq("id", rec.id)
      .is("completed_at", null)
      .select("id")
      .maybeSingle(),
  )
  if (!claimed) fail(409, "That upload was already recorded.")

  // Handle Profile Photo (Avatar) upload completion
  if (rec.purpose === "avatar") {
    const existing =
      (await kv.get(userProfileKey(me.id)).catch(() => null)) || {}
    const oldMedia = parseStored(existing.avatarPublicId)
    if (oldMedia && existing.avatarPublicId !== rec.public_id) {
      db.storage
        .from(oldMedia.bucket)
        .remove([oldMedia.path])
        .catch(() => {})
    }
    let photoUrl = ""
    if (stored) {
      const urls = await signMedia([rec.public_id])
      photoUrl = urls.get(rec.public_id) || ""
    } else {
      photoUrl = cldAvatarUrl(rec.public_id)
    }
    await kv.set(userProfileKey(me.id), {
      ...existing,
      avatarPublicId: rec.public_id,
      photoUrl,
      updatedAt: Date.now(),
    })
    return c.json({ publicId: rec.public_id, photoUrl })
  }

  if (rec.purpose === "meter") {
    const b = await getBooking(rec.booking_id)
    const party = asParty(b, me.id)
    if (b.status !== STAGE_STATUS[rec.stage]) stale(b)
    const row = must(
      await db
        .from("meter_readings")
        .upsert(
          {
            booking_id: b.id,
            stage: rec.stage,
            public_id: rec.public_id,
            ocr_kwh: stored ? null : parseKwh(body.ocrText),
            driver_value: null,
            host_value: null,
            status: "pending",
            uploaded_by: party,
            uploaded_at: new Date().toISOString(),
          },
          { onConflict: "booking_id,stage" },
        )
        .select()
        .single(),
    )
    await broadcast(bookingMsgs(b, ["reading"], { stage: rec.stage }))
    const [reading] = await readingsOut([row])
    return c.json({ reading })
  }
  const prev = must(
    await db
      .from("hosts")
      .select("media_public_id")
      .eq("id", rec.host_id)
      .maybeSingle(),
  )
  const row = must(
    await db
      .from("hosts")
      .update({
        media_public_id: rec.public_id,
        media_type: rec.resource_type,
      })
      .eq("id", rec.host_id)
      .eq("owner_id", me.id)
      .select()
      .maybeSingle(),
  )
  if (!row) fail(403, "You can only add media to your own socket.")
  const old = parseStored(prev?.media_public_id)
  if (old && prev.media_public_id !== rec.public_id)
    db.storage
      .from(old.bucket)
      .remove([old.path])
      .then(({ error }) => error && console.log("Old media cleanup:", error))
  const [host] = await hostsOut([row])
  await broadcast([hostMsg(host)])
  return c.json({ host })
})

// ----- host earnings -----
app.get(`${P}/stats`, async (c) => {
  const me = await auth(c)
  const paid = must(
    await db
      .from("bookings")
      .select("driver_id, amount, kwh_used, paid_at, updated_at")
      .eq("host_owner_id", me.id)
      .eq("status", "paid"),
  )
  const today = Math.floor((Date.now() + IST) / DAY)
  const last7 = [0, 0, 0, 0, 0, 0, 0]
  for (const b of paid) {
    const at = ms(b.paid_at) ?? ms(b.updated_at) ?? 0
    const ago = today - Math.floor((at + IST) / DAY)
    if (ago >= 0 && ago < 7) last7[6 - ago] += b.amount ?? 0
  }
  return c.json({
    stats: {
      totalEarned: paid.reduce((s: number, b: any) => s + (b.amount ?? 0), 0),
      energyShared: round1(
        paid.reduce((s: number, b: any) => s + Number(b.kwh_used ?? 0), 0),
      ),
      cars: new Set(paid.map((b: any) => b.driver_id)).size,
      last7,
    },
  })
})

Deno.serve(app.fetch)
