import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import { supabase, getLiveUser, isLive } from "./supabase"
import {
  fetchBookings,
  fetchConfig,
  fetchDriverReviews,
  fetchHosts,
  fetchReadings,
  fetchReviews,
  fetchStats,
  getLocalVerifiedReviewForBooking,
  getLocalVerifiedReviewsForHost,
  reconcileBookingRows,
} from "./api"
import { clearSigned, rememberSigned, setCloud } from "./cloudinary"

let probe = null
let backendConfig = null
export const getBackendConfig = () => backendConfig
export function probeBackend() {
  if (!isLive) return Promise.resolve(false)
  if (!probe)
    probe = fetchConfig()
      .then((cfg) => {
        backendConfig = cfg || {}
        setCloud(cfg?.cloudName)
        return true
      })
      .catch(() => {
        probe = null
        return false
      })
  return probe
}

const num = (v, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d)
const url = (v) => (typeof v === "string" && v ? v : null)
const STATUS = {
  requested: "requested",
  accepted: "accepted",
  start_meter: "startMeter",
  charging: "charging",
  end_meter: "endMeter",
  awaiting_pay: "awaitingPay",
  paid: "paid",
  cancelled: "cancelled",
  declined: "declined",
  disputed: "disputed",
}
export const ACTIVE_STATUSES = [
  "requested",
  "accepted",
  "startMeter",
  "charging",
  "endMeter",
  "awaitingPay",
]
const DAY = 86400000

export const stepStatus = (b) =>
  b?.status === "disputed"
    ? b.disputeStage === "end"
      ? "endMeter"
      : "startMeter"
    : b?.status

export function rowToHost(r) {
  rememberSigned(r.mediaPublicId, r.mediaUrl)
  const localRevs = getLocalVerifiedReviewsForHost(r.id)
  const baseReviews = num(r.reviews, 0)
  const reviews = baseReviews + localRevs.length
  let rating = baseReviews > 0 ? num(r.rating, 5) : null
  if (localRevs.length > 0) {
    const localSum = localRevs.reduce((s, x) => s + Number(x.stars || 5), 0)
    rating =
      Math.round(
        (((rating || 5) * baseReviews + localSum) / reviews) * 10,
      ) / 10
  }
  return {
    id: r.id,
    name: r.name || "Home socket",
    ownerId: r.ownerId,
    ownerName: r.ownerName || null,
    demo: Boolean(r.demo),
    ownerInitials: r.ownerInitials || "PH",
    lat: num(r.lat, NaN),
    lng: num(r.lng, NaN),
    locality: r.locality || "",
    socket: r.socket || "15A Plug",
    kw: num(r.kw, 3.3),
    rate: num(r.rate, 12),
    perks: Array.isArray(r.perks) ? r.perks : [],
    rating,
    reviews,
    online: Boolean(r.online),
    isNew: !r.demo && Date.now() - num(r.createdAt) < DAY,
    mediaPublicId: r.mediaPublicId || null,
    mediaType: r.mediaType || null,
    mediaUrl: url(r.mediaUrl),
    createdAt: num(r.createdAt),
  }
}

export function rowToBooking(r) {
  const startSoc = num(r.startSoc, 0)
  const localRev = getLocalVerifiedReviewForBooking(r.id)
  // server status always wins — stale local "paid" flags must not hide an
  // in-flight booking (it would block new bookings with no way to finish it)
  const resolvedStatus = STATUS[r.status] || r.status
  const resolvedRawStatus = r.status
  const resolvedReview = r.review || localRev || null

  return {
    id: r.id,
    hostId: r.hostId,
    hostName: r.hostName || "Host",
    hostOwnerId: r.hostOwnerId,
    driverId: r.driverId,
    demoHost: Boolean(r.demoHost),
    driver: r.driverName || "Driver",
    driverRating: r.driverRating == null ? null : num(r.driverRating),
    driverReviewsCount: num(r.driverReviewsCount, 0),
    driverPastReviews: Array.isArray(r.driverPastReviews)
      ? r.driverPastReviews
      : [],
    car: r.car || "EV",
    status: resolvedStatus,
    rawStatus: resolvedRawStatus,
    startSoc,
    targetSoc: num(r.targetSoc, startSoc),
    rate: num(r.rate, 12),
    estimateKwh: num(r.estimateKwh, 0),
    estimateAmount: num(r.estimateAmount, 0),
    startKwh: r.startKwh == null ? null : num(r.startKwh),
    endKwh: r.endKwh == null ? null : num(r.endKwh),
    kwhUsed: num(r.kwhUsed, 0),
    amount: num(r.amount, 0),
    hasBill: r.amount != null && r.kwhUsed != null,
    ref: r.ref || null,
    paidAt: r.paidAt || null,
    disputeStage: r.disputeStage || null,
    review: resolvedReview,
    driverReview: resolvedReview,
    hostReview: r.driverReview || null,
    createdAt: num(r.createdAt),
    updatedAt: num(r.updatedAt),
  }
}

export function rowToReading(r) {
  if (!r) return null
  rememberSigned(r.publicId, r.photoUrl)
  return {
    bookingId: r.bookingId,
    stage: r.stage,
    publicId: r.publicId || null,
    photoUrl: url(r.photoUrl),
    ocrKwh: r.ocrKwh == null ? null : num(r.ocrKwh),
    driverValue: r.driverValue == null ? null : num(r.driverValue),
    hostValue: r.hostValue == null ? null : num(r.hostValue),
    status: r.status || "pending",
    uploadedAt: num(r.uploadedAt),
    uploadedBy: r.uploadedBy || null,
  }
}

export function rowToReview(r) {
  if (!r) return null
  return {
    id: `${r.bookingId || ""}-${r.at || Date.now()}`,
    bookingId: r.bookingId || null,
    hostId: r.hostId || null,
    driverId: r.driverId || null,
    driverName: r.driverName || "EV Driver",
    hostName: r.hostName || "Host",
    stars: num(r.stars, 5),
    tags: Array.isArray(r.tags) ? r.tags : [],
    comment: r.comment || "",
    at: num(r.at, Date.now()),
  }
}

const EMPTY = { data: undefined, loading: false, error: null }
const resources = new Map()
let generation = 0

function resource(key, fetcher) {
  let r = resources.get(key)
  if (!r) {
    r = {
      key,
      fetcher,
      data: undefined,
      loading: true,
      error: null,
      listeners: new Set(),
      refs: 0,
      inflight: null,
      again: false,
    }
    r.snap = { data: undefined, loading: true, error: null }
    resources.set(key, r)
  }
  r.fetcher = fetcher
  return r
}
function emit(r) {
  r.snap = { data: r.data, loading: r.loading, error: r.error }
  r.listeners.forEach((l) => l())
}
function load(r) {
  if (judgeMode) return Promise.resolve()
  if (r.inflight) {
    r.again = true
    return r.inflight
  }
  const gen = generation
  r.inflight = (async () => {
    try {
      const d = await r.fetcher()
      if (gen === generation) {
        r.data = d
        r.error = null
      }
    } catch (e) {
      if (gen === generation) r.error = e
    }
    r.inflight = null
    if (gen !== generation) return
    r.loading = false
    emit(r)
    if (r.again) {
      r.again = false
      return load(r)
    }
  })()
  return r.inflight
}
export function refresh(prefix) {
  const jobs = []
  resources.forEach((r) => {
    if (r.key === prefix || r.key.startsWith(prefix + ":")) jobs.push(load(r))
  })
  return Promise.all(jobs)
}
export function refreshActive() {
  resources.forEach((r) => {
    if (r.refs > 0) load(r)
  })
}
export function resetLive() {
  generation++
  resources.clear()
  clearSigned()
}

let judgeMode = false
export function setJudgeMode(on) {
  judgeMode = Boolean(on)
  resetLive()
  if (judgeMode) {
    channels.forEach((c) => supabase?.removeChannel(c.ch))
    channels.clear()
    updateRtStatus()
  }
}
const liveOn = () => isLive && !judgeMode

function useResource(key, fetcher) {
  const r = key && !judgeMode ? resource(key, fetcher) : null
  const subscribe = useCallback(
    (cb) => {
      if (!r) return () => {}
      r.listeners.add(cb)
      if (++r.refs === 1) load(r)
      return () => {
        r.listeners.delete(cb)
        r.refs--
      }
    },
    [r],
  )
  return useSyncExternalStore(subscribe, () => (r ? r.snap : EMPTY))
}

const HOSTS_TOPIC = "plughome-hosts"
const userTopic = (id) => `plughome-user-${id}`
const channels = new Map()

let rtStatus = "connecting"
const rtListeners = new Set()
function updateRtStatus() {
  const all = [...channels.values()]
  const next =
    all.length && all.every((c) => c.state === "SUBSCRIBED")
      ? "live"
      : "connecting"
  if (next === rtStatus) return
  rtStatus = next
  rtListeners.forEach((l) => l())
}
const subscribeRt = (cb) => {
  rtListeners.add(cb)
  return () => rtListeners.delete(cb)
}
export const useRealtimeStatus = () =>
  useSyncExternalStore(subscribeRt, () => rtStatus)

function joinTopic(topic, fn) {
  let c = channels.get(topic)
  if (!c) {
    c = { handlers: new Set(), refs: 0, joined: false, state: "JOINING" }
    const ch = supabase.channel(topic, {
      config: { broadcast: { self: false } },
    })
    ;["host", "host_removed", "booking", "reading"].forEach((event) =>
      ch.on("broadcast", { event }, (m) => c.handlers.forEach((h) => h(m))),
    )
    ch.subscribe((status) => {
      c.state = status
      updateRtStatus()
      if (status !== "SUBSCRIBED") return
      if (c.joined) c.handlers.forEach((h) => h({ event: "resync" }))
      c.joined = true
    })
    c.ch = ch
    channels.set(topic, c)
    updateRtStatus()
  }
  c.handlers.add(fn)
  c.refs++
  return () => {
    c.handlers.delete(fn)
    if (--c.refs === 0) {
      supabase.removeChannel(c.ch)
      channels.delete(topic)
      updateRtStatus()
    }
  }
}
function useTopic(topic, handler) {
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => {
    if (!topic || !supabase || judgeMode) return
    return joinTopic(topic, (m) => ref.current(m))
  }, [topic])
}

if (typeof window !== "undefined") {
  const onVisible = () =>
    document.visibilityState === "visible" && refreshActive()
  window.addEventListener("online", refreshActive)
  document.addEventListener("visibilitychange", onVisible)
  let tick = 0
  const poll = setInterval(() => {
    if (document.visibilityState !== "visible" || navigator.onLine === false)
      return
    if (rtStatus !== "live" || ++tick % 6 === 0) refreshActive()
  }, 10000)
  import.meta.hot?.dispose(() => {
    clearInterval(poll)
    window.removeEventListener("online", refreshActive)
    document.removeEventListener("visibilitychange", onVisible)
    channels.forEach((c) => supabase?.removeChannel(c.ch))
    channels.clear()
  })
}

const NO_HOSTS = []
const NO_BOOKINGS = []
const NO_REVIEWS = []
const listable = (h) =>
  !h.demo && Number.isFinite(h.lat) && Number.isFinite(h.lng)

export function useHosts(enabled = true) {
  const key = enabled && liveOn() ? "hosts" : null
  const snap = useResource(key, async () =>
    (await fetchHosts()).hosts.map(rowToHost).filter(listable),
  )
  useTopic(key && HOSTS_TOPIC, (m) => {
    const r = resources.get("hosts")
    if (!r) return
    if (m.event === "host" && m.payload?.host && r.data) {
      const h = rowToHost(m.payload.host)
      if (!listable(h)) return
      r.data = r.data.some((x) => x.id === h.id)
        ? r.data.map((x) => (x.id === h.id ? h : x))
        : [h, ...r.data]
      emit(r)
    } else load(r)
  })
  return {
    hosts: snap.data || NO_HOSTS,
    loading: Boolean(key) && snap.loading && !snap.data,
    error: snap.error,
    refresh: () => refresh("hosts"),
  }
}

export function useBookings(enabled = true) {
  const uid = enabled && liveOn() ? getLiveUser()?.id : null
  const key = uid ? `bookings:${uid}` : null
  const snap = useResource(key, async () => {
    const rows = reconcileBookingRows((await fetchBookings()).bookings || [])
    writeBookingCache(uid, rows)
    return rows.map(rowToBooking)
  })
  useTopic(uid && userTopic(uid), (m) => {
    if (m.event === "booking" || m.event === "resync") refresh("bookings")
  })
  useDbEvents(uid)
  // last list this device saw: shown while the first fetch is slow or failing,
  // so My Charge / History never go blank
  const cached = snap.data ? null : readBookingCache(uid)
  return {
    bookings: snap.data || cached || NO_BOOKINGS,
    loading: Boolean(key) && snap.loading && !snap.data && !cached,
    error: snap.error,
    stale: Boolean(cached),
    refresh: () => refresh("bookings"),
  }
}

const CACHE_PREFIX = "plughome:bookings_cache:"
const cacheMemo = { uid: null, raw: null, list: null }
function writeBookingCache(uid, rows) {
  try {
    localStorage.setItem(CACHE_PREFIX + uid, JSON.stringify(rows.slice(0, 60)))
  } catch {}
}
function readBookingCache(uid) {
  if (!uid || typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + uid)
    if (!raw) return null
    if (cacheMemo.uid === uid && cacheMemo.raw === raw) return cacheMemo.list
    const list = reconcileBookingRows(JSON.parse(raw)).map(rowToBooking)
    Object.assign(cacheMemo, { uid, raw, list })
    return list
  } catch {
    return null
  }
}

// A successful action returns the updated booking: show it right away (the
// list fetch / realtime push that follows confirms it).
export function applyBookingRow(row) {
  if (!row?.id) return
  const b = rowToBooking(row)
  resources.forEach((r) => {
    if (!r.key.startsWith("bookings:") || !Array.isArray(r.data)) return
    r.data = r.data.some((x) => x.id === b.id)
      ? r.data.map((x) => (x.id === b.id ? b : x))
      : [b, ...r.data]
    emit(r)
  })
}

// ---------------------------------------------------------------------------
// Booking timeline + database realtime (migration 20261030100000).
// `booking_events` is written by database triggers, so it stays accurate even
// when the edge function is older than the app. Both features degrade quietly
// to the server broadcast + derived timeline if the migration isn't applied.
// ---------------------------------------------------------------------------
const NO_EVENTS = []
let eventsMissing = false

export function rowToEvent(r) {
  return {
    id: r.id,
    bookingId: r.booking_id,
    event: r.event,
    status: STATUS[r.to_status] || r.to_status || null,
    stage: r.meta?.stage || null,
    at: Date.parse(r.created_at) || null,
  }
}

export function useBookingEvents(bookingId, enabled = true) {
  const uid = enabled && liveOn() && supabase ? getLiveUser()?.id : null
  const key = uid && bookingId ? `events:${bookingId}` : null
  const snap = useResource(key, async () => {
    if (eventsMissing) return NO_EVENTS
    const { data, error } = await supabase
      .from("booking_events")
      .select("id, booking_id, event, to_status, meta, created_at")
      .eq("booking_id", bookingId)
      .order("created_at", { ascending: true })
    if (error) {
      // table not created yet (42P01) or not exposed — stop asking
      if (error.code === "42P01" || error.code === "PGRST205")
        eventsMissing = true
      return NO_EVENTS
    }
    return (data || []).map(rowToEvent)
  })
  return snap.data || NO_EVENTS
}

// One postgres_changes channel per signed-in user. RLS on booking_events only
// delivers rows for bookings the user is driver or host of.
const dbChannel = { uid: null, ch: null, refs: 0 }
function useDbEvents(uid) {
  useEffect(() => {
    if (!uid || !supabase || judgeMode) return
    if (dbChannel.uid !== uid) {
      if (dbChannel.ch) supabase.removeChannel(dbChannel.ch)
      dbChannel.uid = uid
      dbChannel.refs = 0
      dbChannel.ch = supabase
        .channel(`plughome-db-${uid}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "booking_events" },
          ({ new: row }) => {
            const id = row?.booking_id
            refresh("bookings")
            if (!id) return
            refresh(`events:${id}`)
            if (row.event === "reading" || row.event === "status")
              refresh(`readings:${id}`)
          },
        )
        .subscribe()
    }
    dbChannel.refs++
    return () => {
      if (--dbChannel.refs > 0 || dbChannel.uid !== uid) return
      supabase.removeChannel(dbChannel.ch)
      dbChannel.ch = null
      dbChannel.uid = null
    }
  }, [uid])
}

export function useHostReviews(hostId, enabled = true) {
  const key = enabled && liveOn() && hostId ? `reviews:host:${hostId}` : null
  const snap = useResource(key, async () => {
    const res = await fetchReviews(hostId).catch(() => ({ reviews: [] }))
    const serverRevs = (res?.reviews || []).map(rowToReview).filter(Boolean)
    const localRevs = getLocalVerifiedReviewsForHost(hostId)
      .map(rowToReview)
      .filter(Boolean)
    const seen = new Set(serverRevs.map((r) => r.bookingId))
    return [
      ...localRevs.filter((r) => !seen.has(r.bookingId)),
      ...serverRevs,
    ]
  })
  useTopic(key && HOSTS_TOPIC, (m) => {
    if (m.event === "host" || m.event === "resync") {
      refresh(`reviews:host:${hostId}`)
    }
  })
  return {
    reviews: snap.data || NO_REVIEWS,
    loading: Boolean(key) && snap.loading && !snap.data,
    error: snap.error,
    refresh: () => key && refresh(key),
  }
}

export function useDriverReviews(driverId, enabled = true) {
  const key =
    enabled && liveOn() && driverId ? `reviews:driver:${driverId}` : null
  const snap = useResource(key, async () => {
    const res = await fetchDriverReviews(driverId).catch(() => ({ reviews: [] }))
    return (res?.reviews || []).map(rowToReview).filter(Boolean)
  })
  useTopic(key && userTopic(driverId), (m) => {
    if (m.event === "booking" || m.event === "resync") {
      refresh(`reviews:driver:${driverId}`)
    }
  })
  return {
    reviews: snap.data || NO_REVIEWS,
    loading: Boolean(key) && snap.loading && !snap.data,
    error: snap.error,
    refresh: () => key && refresh(key),
  }
}

export function useMeterReadings(bookingId, enabled = true) {
  const uid = enabled && liveOn() ? getLiveUser()?.id : null
  const key = uid && bookingId ? `readings:${bookingId}` : null
  const snap = useResource(key, async () => {
    const j = await fetchReadings(bookingId)
    return { start: rowToReading(j.start), end: rowToReading(j.end) }
  })
  useTopic(key && userTopic(uid), (m) => {
    const id = m.payload?.bookingId ?? m.payload?.id
    if (m.event === "resync" || id === bookingId)
      refresh(`readings:${bookingId}`)
  })
  return {
    start: snap.data?.start ?? null,
    end: snap.data?.end ?? null,
    loading: Boolean(key) && snap.loading && !snap.data,
    refresh: () => key && refresh(key),
  }
}

export function useHostStats(userId, enabled = true) {
  const key = enabled && liveOn() && userId ? `stats:${userId}` : null
  const snap = useResource(key, async () => (await fetchStats()).stats)
  useTopic(key && userTopic(userId), (m) => {
    if (m.event === "booking" || m.event === "resync") refresh("stats")
  })
  useTopic(key && HOSTS_TOPIC, (m) => {
    if (m.payload?.host?.ownerId === userId) refresh("stats")
  })
  return {
    stats: snap.data ?? null,
    loading: Boolean(key) && snap.loading && !snap.data,
    error: snap.error,
  }
}

export function usePendingAction(watch, onError) {
  const [pending, setPending] = useState(null)
  useEffect(() => {
    if (pending && watch !== pending.watch) setPending(null)
  }, [watch])
  useEffect(() => {
    if (!pending) return
    const a = setTimeout(refreshActive, 4000)
    const b = setTimeout(() => setPending(null), 15000)
    return () => {
      clearTimeout(a)
      clearTimeout(b)
    }
  }, [pending])
  const run = async (label, fn) => {
    if (pending) return false
    setPending({ label, watch })
    try {
      await fn()
      refreshActive()
      return true
    } catch (e) {
      setPending(null)
      onError?.(e)
      return false
    }
  }
  return [pending?.label ?? null, run]
}
