// PLUG-HOME edge function. The server is the only authority for booking
// status, meter readings, kWh, bills and earnings; the browser only asks.
// Data lives in the Postgres tables from
// supabase/migrations/20261024100000_plughome_schema.sql (RLS on, no client
// policies: only this function's service role can read or write them).
// Media (meter photos, listing photos/videos) goes to Cloudinary when its API
// secret is set, otherwise to private Supabase Storage buckets this function
// creates (see supabase/migrations/20261026100000_plughome_storage.sql).
// Only real users' data is served: no seeded or sample rows reach live mode.
// Secrets (service role, Cloudinary API secret) are read from the function
// environment and never returned to clients.
import { Hono } from "npm:hono"
import { cors } from "npm:hono/cors"
import { logger } from "npm:hono/logger"
import { createClient } from "jsr:@supabase/supabase-js@2.49.8"
import * as kv from "./kv_store.tsx"

const app = new Hono()
const P = "/make-server-14a63397"

// Enable logger
app.use("*", logger(console.log))

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
)

// ---------- environment ----------
const env = (k: string) => (Deno.env.get(k) ?? "").trim()
const SUPABASE_URL = env("SUPABASE_URL")
const SERVICE_KEY = env("SUPABASE_SERVICE_ROLE_KEY")
const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})
// read per request so newly added secrets apply without a code change
const cld = () => ({
  // cloud name and API key are public (every asset URL / signed upload form
  // carries them), so they have defaults; only the API secret must be set
  cloud: env("CLOUDINARY_CLOUD_NAME") || "kegek3qo",
  key: env("CLOUDINARY_API_KEY") || "147459677335848",
  secret: env("CLOUDINARY_API_SECRET"),
})
const cldReady = () => {
  const c = cld()
  return Boolean(c.cloud && c.key && c.secret)
}
// Cloudinary's OCR add-on must be enabled on the account before uploads may
// request it, so it is opt-in (CLOUDINARY_OCR=true). Without it the meter
// reading is typed in by hand.
const ocrOn = () => /^(1|true|yes|adv_ocr)$/i.test(env("CLOUDINARY_OCR"))
// Where uploads go: Cloudinary (signed direct upload, transforms, optional
// OCR) when its secret is set, else private Supabase Storage buckets.
// MEDIA_STORAGE=supabase forces Storage even with Cloudinary configured.
const storageMode = () =>
  env("MEDIA_STORAGE").toLowerCase() === "supabase" || !cldReady()
    ? "supabase"
    : "cloudinary"

const PACK = 26 // kWh, matches the app's battery model
const DAY = 86400000
const IST = 19800000 // earnings days roll over at Indian midnight
const MB = 1024 * 1024
// named interfaces: the repo formatter mangles one-line type literals
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
  ttl: number // signed download URL lifetime, seconds
}
interface Signed {
  url: string
  exp: number
  ttl: number
}
const SOCKETS: Record<string, Socket> = {
  "15A Plug": { label: "15A Plug", kw: 3.3 },
  "7.2kW Wallbox": { label: "7.2kW Type-2", kw: 7.2 },
  "11kW AC": { label: "11kW AC", kw: 7.2 },
}
const PERKS = ["CCTV", "Family Verified", "Free Chai", "Solar"]
const ACTIONS = [
  "accept",
  "decline",
  "cancel",
  "arrive",
  "finish_charging",
  // the driver confirms they paid the host directly (UPI/cash); nothing is
  // charged or verified here. pay_demo is the legacy name older clients send.
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
// private buckets: no storage.objects policies, so only this function (service
// role), its single-use signed upload URLs and expiring signed URLs reach them
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

// ---------- errors ----------
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
// Postgres functions raise SQLSTATE PHxxx where xxx is the HTTP status
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

// ---------- helpers ----------
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

// ---------- row -> API shape (camelCase, ms timestamps) ----------
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
  // the column defaults to 5.0, so an unreviewed listing has no rating yet
  rating: r.reviews > 0 ? num(r.rating) : null,
  reviews: r.reviews,
  online: r.online,
  // a listing's media is only ever what its owner uploaded (never sample
  // footage); Storage-backed media also gets a signed mediaUrl (hostsOut)
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

// ---------- media storage (Supabase Storage) ----------
// Storage-backed media is recorded as "sb:<bucket>/<path>" in the same
// public_id columns Cloudinary ids use, so the schema serves both.
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
// create the buckets on startup (idempotent); uploads retry if this failed
ensureBuckets().catch((e) => console.log("Bucket setup error:", e))

// Expiring download URLs for private objects, batched per bucket and reused
// per isolate until a quarter of their lifetime is left
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
        // a missing object gets no URL: the app shows "no photo" honestly
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

// ---------- auth ----------
async function auth(c: any) {
  const token = c.req.header("Authorization")?.split(" ")[1]
  if (!token) fail(401, "Please log in again.")
  const { data, error } = await db.auth.getUser(token)
  if (error || !data?.user)
    fail(401, "Your session has expired — please log in again.")
  const user = data.user!
  const row = must(
    await db
      .from("profiles")
      .select("name, role")
      .eq("id", user.id)
      .maybeSingle(),
  )
  if (row) return { id: user.id, profile: row }
  // accounts created before the profiles table: backfill from metadata
  const profile = {
    name: clean(user.user_metadata?.name, 60) || "PLUG-HOME user",
    role: user.user_metadata?.role === "host" ? "host" : "driver",
  }
  must(await db.from("profiles").upsert({ id: user.id, ...profile }))
  return { id: user.id, profile }
}

// ---------- realtime (Supabase Broadcast over REST) ----------
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
    // clients also poll/refetch, so a missed broadcast only delays the update
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

// ---------- data access ----------
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

// the app won't sign anyone in until /config reports a working database;
// cache success per isolate
let dbReady = false
async function checkDb() {
  if (dbReady) return true
  const { error } = await db.from("hosts").select("id").limit(1)
  if (error) console.log("Database not ready:", error)
  else dbReady = true
  return dbReady
}

// ---------- reviews (key-value store) ----------
// One review per paid booking, keyed by host so a listing's reviews are one
// prefix scan. The host row's rating/reviews columns hold the running average.
const reviewKey = (hostId: string, bookingId: string) =>
  `plughome:review:${hostId}:${bookingId}`
const reviewOut = (r: any) =>
  r && {
    bookingId: r.bookingId,
    hostId: r.hostId,
    stars: r.stars,
    comment: r.comment,
    driverName: r.driverName,
    at: r.at,
  }
// attach each paid booking's review so receipts know it's already rated
async function withReviews(rows: any[]) {
  const out = rows.map(bookingOut)
  const rated = rows.filter((r) => r.status === "paid" && r.host_id)
  if (!rated.length) return out
  const found = await kv
    .mget(rated.map((r) => reviewKey(r.host_id, r.id)))
    .catch((e) => (console.log("Review lookup failed:", e), []))
  const byId = new Map<string, any>()
  for (const r of found) if (r?.bookingId) byId.set(r.bookingId, reviewOut(r))
  return out.map((b) => (byId.has(b.id) ? { ...b, review: byId.get(b.id) } : b))
}

// ---------- routes ----------
app.get(`${P}/health`, async (c) =>
  c.json({ status: "ok", database: await checkDb() }),
)

// public config: only public values and feature flags
app.get(`${P}/config`, async (c) => {
  if (!(await checkDb()))
    return c.json(
      {
        error:
          "The PLUG-HOME database isn't set up yet — run the schema migration.",
      },
      503,
    )
  const storage = storageMode()
  return c.json({
    // public; also renders media uploaded to Cloudinary earlier
    cloudName: cld().cloud || null,
    storage,
    uploads: storage === "cloudinary" || (await ensureBuckets()),
    ocr: storage === "cloudinary" && ocrOn(),
    packKwh: PACK,
  })
})

// demo-grade accounts: the app's OTP is a mock, so the device keeps a random
// password per phone and the server creates a pre-confirmed user for it
app.post(`${P}/auth/signup`, async (c) => {
  const body = await readBody(c)
  const name = clean(body.name, 60) || "PLUG-HOME user"
  const role = body.role === "host" ? "host" : "driver"
  const password = String(body.password ?? "")
  if (password.length < 16 || password.length > 128)
    fail(400, "Couldn't create your account — please try again.")
  const email = `${crypto.randomUUID()}@users.plughome.app`
  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
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
  // auth() backfills from user_metadata if this write fails
  const { error: pErr } = await db
    .from("profiles")
    .upsert({ id: data.user!.id, name, role })
  if (pErr) console.log("Profile insert failed:", pErr)
  return c.json({ email })
})

app.post(`${P}/auth/profile`, async (c) => {
  const me = await auth(c)
  const body = await readBody(c)
  const profile = {
    name: clean(body.name, 60) || me.profile.name,
    role:
      body.role === "host"
        ? "host"
        : body.role === "driver"
          ? "driver"
          : me.profile.role,
  }
  must(await db.from("profiles").upsert({ id: me.id, ...profile }))
  return c.json({ profile })
})

// ----- hosts -----
app.get(`${P}/hosts`, async (c) => {
  // real listings only: legacy seeded sample rows are never served
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
  if (!Number.isInteger(rate) || rate < 9 || rate > 18)
    fail(400, "Rate must be between ₹9 and ₹18 per kWh.")
  const { count, error: cErr } = await db
    .from("hosts")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", me.id)
  if (cErr) dbFail(cErr)
  if ((count ?? 0) >= 5)
    fail(409, "You've reached the limit of 5 listed sockets.")
  const okLat = (v: unknown) => isNum(v) && Math.abs(v) <= 90
  const okLng = (v: unknown) => isNum(v) && Math.abs(v) <= 180
  // the app geocodes the locality (or uses the host's GPS); never invent a spot
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

// public: a listing's latest reviews (newest first)
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

// the owner removes a listing; past bookings keep their copy of the details
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
  // sessions with retired sample hosts are not live data: never served
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
  // a hidden legacy sample session still in flight must not block this
  // driver's real booking (one active booking per driver)
  must(
    await db
      .from("bookings")
      .update({ status: "cancelled" })
      .eq("driver_id", me.id)
      .eq("demo_host", true)
      .in("status", IN_FLIGHT),
  )
  // partial unique indexes enforce one active booking per driver and per real
  // socket, so concurrent requests can't double-book
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
      // the real host owner accepts or declines
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
  // the transition runs in one locked transaction in Postgres
  must(
    await db.rpc("plughome_booking_action", {
      p_booking_id: id,
      p_user: me.id,
      // the SQL function still calls the payment confirmation pay_demo
      p_action: paid ? "pay_demo" : action,
      p_ref: paid ? `PH${shortId().slice(0, 8).toUpperCase()}` : null,
    }),
  )
  const b = await getBooking(id)
  const events = action === "recheck" ? ["booking", "reading"] : ["booking"]
  await broadcast(bookingMsgs(b, events))
  return c.json({ booking: bookingOut(b) })
})

// the driver rates a paid session once; the host's average updates with it
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
  const review = {
    bookingId: b.id,
    hostId: b.host_id,
    stars,
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
  // both parties' values, kWh and the bill settle atomically in Postgres
  must(
    await db.rpc("plughome_confirm_reading", {
      p_booking_id: id,
      p_stage: stage,
      p_user: me.id,
      p_value: round1(raw),
      // both real parties confirm; nobody auto-confirms on anyone's behalf
      p_auto: false,
      p_max_kwh: PACK * 4,
    }),
  )
  const [b, r] = await Promise.all([getBooking(id), getReading(id, stage)])
  await broadcast(bookingMsgs(b, ["reading", "booking"], { stage }))
  const [reading] = await readingsOut([r])
  return c.json({ booking: bookingOut(b), reading })
})

// ----- uploads (signed direct-to-Cloudinary or Supabase Storage) -----
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
    if (!bucket.types.includes(type)) fail(400, "Meter proof must be a photo.")
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
    // single-use token for exactly this object path; the browser PUTs the
    // file to Storage, then /uploads/complete verifies and records it
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

// best-effort number from Cloudinary OCR text: the longest numeric run
function parseKwh(text: unknown) {
  const hits = String(text ?? "").match(/\d+(?:[.,]\d+)?/g) ?? []
  const best = hits.sort(
    (a, b) => b.replace(/\D/g, "").length - a.replace(/\D/g, "").length,
  )[0]
  const n = best ? Number(best.replace(",", ".")) : NaN
  // above any real meter (and the column's range): ignore rather than guess
  return Number.isFinite(n) && n > 0 && n <= 10_000_000 ? round1(n) : null
}

app.post(`${P}/uploads/complete`, async (c) => {
  const me = await auth(c)
  const body = await readBody(c)
  const uploadId = String(body.uploadId ?? "")
  // uploads.id is a uuid: reject junk before Postgres does
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
  // trust nothing from the browser: confirm the asset really exists
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
  // single use: only the first completion wins
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
  if (rec.purpose === "meter") {
    const b = await getBooking(rec.booking_id)
    const party = asParty(b, me.id)
    if (b.status !== STAGE_STATUS[rec.stage]) stale(b)
    // a new photo is new evidence: both parties confirm again
    const row = must(
      await db
        .from("meter_readings")
        .upsert(
          {
            booking_id: b.id,
            stage: rec.stage,
            public_id: rec.public_id,
            // OCR only exists for Cloudinary uploads; otherwise typed by hand
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
  // replaced Storage media is no longer referenced anywhere: best-effort delete
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
