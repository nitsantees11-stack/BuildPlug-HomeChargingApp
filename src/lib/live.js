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
  fetchHosts,
  fetchReadings,
  fetchStats,
} from "./api"
import { clearSigned, rememberSigned, setCloud } from "./cloudinary"

// ---------- backend probe ----------
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

// ---------- row mappers (server row → the UI's existing object shapes) ----------
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

// UI step for the stepper; a dispute pauses on the stage it happened at
export const stepStatus = (b) =>
  b?.status === "disputed"
    ? b.disputeStage === "end"
      ? "endMeter"
      : "startMeter"
    : b?.status

export function rowToHost(r) {
  rememberSigned(r.mediaPublicId, r.mediaUrl)
  const reviews = num(r.reviews, 0)
  return {
    id: r.id,
    name: r.name || "Home socket",
    ownerId: r.ownerId,
    ownerName: r.ownerName || null,
    // legacy seeded sample row: never shown in live mode (see `listable`)
    demo: Boolean(r.demo),
    ownerInitials: r.ownerInitials || "PH",
    lat: num(r.lat, NaN),
    lng: num(r.lng, NaN),
    locality: r.locality || "",
    socket: r.socket || "15A Plug",
    kw: num(r.kw, 3.3),
    rate: num(r.rate, 12),
    perks: Array.isArray(r.perks) ? r.perks : [],
    // no reviews yet = no rating (the UI shows "New"), never a made-up score
    rating: reviews > 0 ? num(r.rating, null) : null,
    reviews,
    online: Boolean(r.online),
    isNew: !r.demo && Date.now() - num(r.createdAt) < DAY,
    mediaPublicId: r.mediaPublicId || null,
    mediaType: r.mediaType || null,
    // the server's signed URL for private Storage media; used when the
    // cached first URL (cloudinary.js) is missing, so media is never hidden
    mediaUrl: url(r.mediaUrl),
    createdAt: num(r.createdAt),
  }
}

export function rowToBooking(r) {
  const startSoc = num(r.startSoc, 0)
  return {
    id: r.id,
    hostId: r.hostId,
    hostName: r.hostName || "Host",
    hostOwnerId: r.hostOwnerId,
    driverId: r.driverId,
    demoHost: Boolean(r.demoHost),
    driver: r.driverName || "Driver",
    car: r.car || "EV",
    status: STATUS[r.status] || r.status,
    rawStatus: r.status,
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
    // the driver's rating for a paid session, once given
    review: r.review || null,
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

// ---------- shared resource cache ----------
// One fetch + one subscription per resource no matter how many components use
// it. Data only ever comes from the server (initial GET, realtime-triggered
// re-fetch, or a host row pushed by the server).
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

// Judge Mode gate: while a local demo session is open no live resource,
// fetch, poll or realtime channel may start — even if the browser still holds
// a Supabase session from earlier.
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

// ---------- realtime (broadcast) ----------
const HOSTS_TOPIC = "plughome-hosts"
const userTopic = (id) => `plughome-user-${id}`
const channels = new Map()

// Connection status for the navbar pill: "live" once every joined channel is
// subscribed, "connecting" while any is joining, erroring or timed out.
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
      // after a reconnect anything may have changed — re-sync once
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

// Safety net when a broadcast is missed: refetch on focus / reconnect, plus a
// poll while the tab is visible — every 60 s while realtime is connected,
// every 10 s while it isn't.
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
  // dev hot-reload: tear down this copy's timers, listeners and channels so
  // the re-evaluated module doesn't stack duplicates on the shared client
  import.meta.hot?.dispose(() => {
    clearInterval(poll)
    window.removeEventListener("online", refreshActive)
    document.removeEventListener("visibilitychange", onVisible)
    channels.forEach((c) => supabase?.removeChannel(c.ch))
    channels.clear()
  })
}

// ---------- hooks ----------
const NO_HOSTS = []
const NO_BOOKINGS = []
// schema guarantees coordinates; drop anything malformed rather than invent a
// spot, and never list a legacy sample row as if it were a real charger
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
  const snap = useResource(key, async () =>
    (await fetchBookings()).bookings.map(rowToBooking),
  )
  useTopic(uid && userTopic(uid), (m) => {
    if (m.event === "booking" || m.event === "resync") refresh("bookings")
  })
  return {
    bookings: snap.data || NO_BOOKINGS,
    loading: Boolean(key) && snap.loading && !snap.data,
    error: snap.error,
    refresh: () => refresh("bookings"),
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

// ---------- action helper ----------
// Fires a server action and shows a pending label until the watched value
// (usually the booking's status) changes via realtime. Never trusts the HTTP
// response for UI state; re-fetches after 4 s and gives up after 15 s.
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
  // resolves true on success so callers can follow up (toasts etc.)
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
