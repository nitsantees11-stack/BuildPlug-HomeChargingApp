// @ts-nocheck
import { useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  AlertTriangle,
  LocateFixed,
  MapPin,
  Navigation,
  PlugZap,
  Route,
  Star,
  X,
  Zap,
  Crosshair,
} from "lucide-react"
import {
  SPRING,
  etaMins,
  fetchRoute,
  fmtHours,
  gmaps,
  hasLoc,
  haversine,
  hoursFor,
  kwhNeeded,
  loadLeaflet,
  rangeKm,
  reverseGeocode,
  round1,
} from "../lib"
import { useStore, useToast } from "../store"
import { Avatar, Btn, Card, Chip, Img, Num, Slider } from "../ui"
import { createBooking } from "../lib/api"
import { ACTIVE_STATUSES, refresh } from "../lib/live"
import { useBookingList, useHostList } from "../lib/data"
import { DEMO_USERS, demoBooking } from "../demo"
import {
  photoUrl,
  videoPoster as cldPoster,
  videoUrl as cldVideo,
} from "../lib/cloudinary"
import { useErrorToast } from "../lib/errorToast"

const FILTERS = [
  ["nearest", "🔥 Nearest", () => true],
  ["fast", "⚡ 7.2kW Fast", (h) => h.kw >= 7.2],
  ["plug", "🔌 15A Plug", (h) => h.socket === "15A Plug"],
  ["solar", "☀️ Solar", (h) => h.perks.includes("Solar")],
  ["family", "👩 Family Verified", (h) => h.perks.includes("Family Verified")],
  ["chai", "☕ Free Chai", (h) => h.perks.includes("Free Chai")],
]

// Without a shared location there's no distance: km/mins stay null and the
// list keeps the server's order.
function useNearby() {
  const { state } = useStore()
  const { user, hosts } = state
  return useMemo(
    () =>
      hosts
        .map((h) => {
          const d = haversine(user, h)
          const km = Number.isFinite(d) ? d : null
          return { ...h, km, mins: km == null ? null : etaMins(km) }
        })
        .sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity)),
    [user.lat, user.lng, hosts],
  )
}
const distText = (h) =>
  h.km == null ? "Distance unknown" : `${h.km.toFixed(1)} km • ${h.mins} mins`
const ratingText = (h) =>
  Number.isFinite(h.rating) && h.reviews > 0
    ? `${h.rating.toFixed(1)} (${h.reviews})`
    : "New"
// India-wide view when there's nothing better to centre on
const INDIA = [22.5, 79]

// host names are user input and go into Leaflet's HTML popups
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

function NoMedia() {
  return (
    <div
      className="absolute inset-0 grid place-items-center text-center"
      style={{ background: "linear-gradient(120deg,#F4F9F0,#D9EFC4,#F4F9F0)" }}
    >
      <div>
        <PlugZap size={40} className="mx-auto text-parrot-ink" />
        <p className="mt-1 text-xs font-semibold text-slate">No photos yet</p>
      </div>
    </div>
  )
}

// The host's own uploaded photo or walkthrough video, or an honest placeholder.
export function VideoPreview({ host }) {
  const ref = useRef(null)
  const [err, setErr] = useState(false)
  const media = host.mediaPublicId
  const isVideo = host.mediaType === "video"
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === "undefined") return
    const io = new IntersectionObserver(
      ([e]) => {
        try {
          e.isIntersecting ? el.play()?.catch(() => {}) : el.pause()
        } catch {}
      },
      { threshold: 0.4 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [err, media, host.mediaUrl])
  useEffect(() => setErr(false), [media, host.mediaUrl])
  const src =
    (media &&
      (isVideo ? cldVideo(media) : photoUrl(media, { w: 640, h: 360 }))) ||
    host.mediaUrl
  if (!src || err) return <NoMedia />
  if (!isVideo)
    return (
      <Img
        key={src}
        srcs={[src]}
        alt={`${host.name} driveway`}
        className="absolute inset-0 h-full w-full"
      />
    )
  return (
    <video
      key={src}
      ref={ref}
      muted
      loop
      playsInline
      preload="metadata"
      poster={(media && cldPoster(media)) || undefined}
      src={src}
      onError={() => setErr(true)}
      className="absolute inset-0 h-full w-full object-cover"
    />
  )
}

function HostCard({ h, selected, best, onSelect, onCharge }) {
  const { state } = useStore()
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={SPRING.soft}
    >
      <Card
        className={`overflow-hidden cursor-pointer ${
          selected ? "!border-parrot !bg-mint-2 ring-2 ring-parrot/30" : ""
        } ${!h.online ? "opacity-60" : ""}`}
        onClick={() => onSelect(h)}
      >
        <div className="relative aspect-video rounded-t-3xl overflow-hidden bg-mint">
          <VideoPreview host={h} />
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white/80 to-transparent" />
          <span className="absolute top-3 left-3 h-7 px-3 rounded-full bg-white text-xs font-semibold inline-flex items-center gap-1 shadow-sm">
            <MapPin size={12} className="text-parrot-ink" />
            <span className="font-mono">{distText(h)}</span>
          </span>
          <span
            className="absolute top-3 right-3 h-7 px-3 rounded-full btn-primary text-xs font-mono font-bold inline-flex items-center gap-1.5"
            title="Host's rate. ₹24/kWh is an illustrative public fast-charger price."
          >
            ₹{h.rate} / kWh <s className="opacity-60 font-medium">₹24</s>
          </span>
          {h.demo ? (
            <span
              className="absolute bottom-3 left-3 h-6 px-2.5 rounded-full bg-ink text-white text-[11px] font-semibold inline-flex items-center"
              title="Judge demo listing — simulated on this device, no real owner or socket."
            >
              Judge demo · simulated
            </span>
          ) : (
            (h.mediaPublicId || h.mediaUrl) && (
              <span className="absolute bottom-3 left-3 h-6 px-2.5 rounded-full bg-white/90 text-[11px] font-medium text-slate inline-flex items-center">
                {h.mediaType === "video" ? "Host walkthrough" : "Host photo"}
              </span>
            )
          )}
          {h.isNew && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={SPRING.bouncy}
              className="absolute bottom-3 right-3 h-6 px-2.5 rounded-full btn-primary text-[11px] font-bold inline-flex items-center"
            >
              🆕 Just listed
            </motion.span>
          )}
          {best && !h.isNew && (
            <motion.span
              initial={{ scale: 0, rotate: -8 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={SPRING.bouncy}
              className="absolute bottom-3 right-3 h-7 px-3 rounded-full bg-white text-ink text-xs font-bold inline-flex items-center gap-1 shadow"
            >
              <Star size={12} className="fill-parrot text-parrot" />
              Best for you
            </motion.span>
          )}
        </div>
        <div className="p-5">
          <div className="flex items-center gap-3">
            <Avatar initials={h.ownerInitials} />
            <div className="min-w-0 flex-1">
              <h3 className="font-display font-bold text-[17px] truncate">
                {h.name}
              </h3>
              <p className="text-sm text-slate flex flex-wrap items-center gap-x-2">
                <span className="inline-flex items-center gap-1">
                  <Star size={13} className="fill-amber text-amber" />
                  {ratingText(h)}
                </span>
                ·
                <span>
                  {h.socket === "15A Plug" ? "🔌" : "⚡"} {h.socket}
                </span>
                {!h.online && <span className="text-mute">· Offline</span>}
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {h.perks.slice(0, 4).map((p) => (
              <span
                key={p}
                className="h-6 px-2.5 rounded-full bg-mint text-xs font-medium text-ink inline-flex items-center"
              >
                {p}
              </span>
            ))}
          </div>
          <div
            className="mt-4 grid grid-cols-2 gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <Btn
              variant="secondary"
              icon={Route}
              className="!h-11 !px-3 !text-sm"
              onClick={() => onSelect(h)}
            >
              Show Route
            </Btn>
            <Btn
              variant="secondary"
              icon={Navigation}
              className="!h-11 !px-3 !text-sm"
              disabled={!hasLoc(h)}
              onClick={() => {
                const url = gmaps(state.user, h)
                if (url) window.open(url, "_blank", "noopener")
              }}
            >
              Google Maps
            </Btn>
            <Btn
              icon={Zap}
              className="col-span-2"
              disabled={!h.online}
              onClick={() => onCharge(h)}
            >
              Plug In & Charge
            </Btn>
          </div>
        </div>
      </Card>
    </motion.div>
  )
}

function MapView({ hosts, onSelect, onCharge }) {
  const { state } = useStore()
  const el = useRef(null)
  const map = useRef(null)
  const layers = useRef({ markers: {}, route: [], user: null })
  const cb = useRef({})
  cb.current = { onSelect, onCharge, user: state.user }
  const [status, setStatus] = useState("loading")
  const { user, selectedHostId, route } = state

  useEffect(() => {
    let dead = false
    loadLeaflet()
      .then((L) => {
        if (dead || !el.current) return
        const first = hosts.find(hasLoc)
        const m = L.map(el.current, {
          zoomControl: false,
          attributionControl: true,
        })
        if (hasLoc(user)) m.setView([user.lat, user.lng], 14)
        else if (first) m.setView([first.lat, first.lng], 13)
        else m.setView(INDIA, 5)
        L.control.zoom({ position: "bottomleft" }).addTo(m)
        L.tileLayer(
          "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
          {
            maxZoom: 19,
            attribution: "&copy; OpenStreetMap contributors",
          },
        ).addTo(m)
        map.current = m
        setStatus("ready")
        setTimeout(() => m.invalidateSize(), 60)
      })
      .catch(() => !dead && setStatus("failed"))
    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => map.current?.invalidateSize())
        : null
    el.current && ro?.observe(el.current)
    return () => {
      dead = true
      ro?.disconnect()
      try {
        map.current?.remove()
      } catch {}
      map.current = null
      layers.current = { markers: {}, route: [], user: null }
    }
  }, [])

  useEffect(() => {
    const L = window.L,
      m = map.current
    if (!m || !L) return
    layers.current.user?.remove()
    layers.current.user = null
    if (!hasLoc(user)) return
    layers.current.user = L.marker([user.lat, user.lng], {
      icon: L.divIcon({
        className: "",
        html: '<div class="user-dot pin-wrap"><span class="ring"></span><span class="ring r2"></span><span class="core"></span></div>',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      }),
      zIndexOffset: 1000,
    }).addTo(m)
    if (!route) m.flyTo([user.lat, user.lng], 14, { duration: 0.8 })
  }, [status, user.lat, user.lng])

  useEffect(() => {
    const L = window.L,
      m = map.current
    if (!m || !L) return
    const mk = layers.current.markers
    const ids = new Set(hosts.map((h) => h.id))
    Object.keys(mk).forEach((id) => {
      if (!ids.has(id)) {
        mk[id].remove()
        delete mk[id]
      }
    })
    hosts.forEach((h, i) => {
      if (!hasLoc(h)) return
      const cls = `pin ${h.id === selectedHostId ? "active" : ""} ${
        h.online ? "" : "off"
      }`
      const html = `<div class="${
        mk[h.id] ? "" : "pin-wrap"
      }" style="animation-delay:${i * 90}ms"><div class="${cls}"><b>⚡ ₹${h.rate}</b><i></i></div></div>`
      const icon = L.divIcon({
        className: "",
        html,
        iconSize: [72, 36],
        iconAnchor: [36, 40],
      })
      const popup = `<div style="min-width:220px"><p style="font:700 15px 'Plus Jakarta Sans';margin:0">${esc(h.name)}</p><p style="font:500 12px 'JetBrains Mono';color:#475569;margin:4px 0 10px">₹${h.rate}/kWh · ${h.kw}kW · ${distText(h)}${
        h.demo ? " · simulated" : ""
      }</p><button data-a="nav" style="width:100%;height:40px;border-radius:12px;border:1px solid #D9EFC4;background:#fff;font:700 13px 'Plus Jakarta Sans';margin-bottom:6px;cursor:pointer">🧭 Start Live Navigation (Google Maps)</button><button data-a="charge" ${
        h.online ? "" : "disabled"
      } style="width:100%;height:40px;border-radius:12px;border:0;background:linear-gradient(135deg,#72D600,#84CC16);font:700 13px 'Plus Jakarta Sans';cursor:pointer">⚡ Plug In & Charge</button></div>`
      if (mk[h.id]) {
        mk[h.id].setIcon(icon)
        mk[h.id].setLatLng([h.lat, h.lng])
        mk[h.id].setPopupContent(popup)
        return
      }
      const marker = L.marker([h.lat, h.lng], { icon }).addTo(m)
      marker.bindPopup(popup, {
        className: "plug-popup",
        closeButton: false,
        offset: [0, -30],
      })
      marker.on("click", () => cb.current.onSelect(h.id))
      marker.on("popupopen", (e) => {
        const node = e.popup.getElement()
        node?.querySelector('[data-a="nav"]')?.addEventListener("click", () => {
          const url = gmaps(cb.current.user, h)
          if (url) window.open(url, "_blank", "noopener")
        })
        node
          ?.querySelector('[data-a="charge"]')
          ?.addEventListener("click", () => {
            m.closePopup()
            cb.current.onCharge(h.id)
          })
      })
      mk[h.id] = marker
    })
    const pins = hosts.filter(hasLoc).map((h) => [h.lat, h.lng])
    if (!hasLoc(user) && !layers.current.framed && pins.length) {
      layers.current.framed = true
      try {
        m.fitBounds(L.latLngBounds(pins), { padding: [40, 40], maxZoom: 14 })
      } catch {}
    }
  }, [status, hosts, selectedHostId])

  useEffect(() => {
    const L = window.L,
      m = map.current
    if (!m || !L) return
    layers.current.route.forEach((l) => l.remove())
    layers.current.route = []
    if (!route?.coords?.length) return
    const casing = L.polyline([], {
      color: "#fff",
      weight: 10,
      opacity: 1,
      lineCap: "round",
    }).addTo(m)
    const line = L.polyline([], {
      color: "#72D600",
      weight: 6,
      lineCap: "round",
      className: "route-flow",
    }).addTo(m)
    layers.current.route = [casing, line]
    const h = hosts.find((x) => x.id === route.hostId)
    if (!h || !hasLoc(h) || !hasLoc(user)) return
    try {
      m.flyToBounds(
        L.latLngBounds([
          [user.lat, user.lng],
          [h.lat, h.lng],
        ]),
        { padding: [60, 60], duration: 1.1 },
      )
    } catch {}
    let raf
    const t0 = performance.now()
    const pts = route.coords
    const step = (t) => {
      const p = Math.min(1, (t - t0) / 900)
      let slice = pts.slice(0, Math.max(2, Math.ceil(pts.length * p)))
      if (pts.length === 2)
        slice = [
          pts[0],
          [
            pts[0][0] + (pts[1][0] - pts[0][0]) * p,
            pts[0][1] + (pts[1][1] - pts[0][1]) * p,
          ],
        ]
      casing.setLatLngs(slice)
      line.setLatLngs(slice)
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [status, route])

  return (
    <div className="relative h-full w-full">
      <div ref={el} className="absolute inset-0 bg-mint" />
      {status === "loading" && (
        <div className="absolute inset-0 skel shimmer" />
      )}
      {status === "failed" && (
        <div className="absolute inset-0 grid place-items-center bg-mint p-6 text-center">
          <div>
            <MapPin className="mx-auto text-parrot-ink" />
            <p className="mt-2 font-display font-bold">
              Map unavailable — showing list view
            </p>
            <p className="text-sm text-slate">
              All chargers are still bookable from the list.
            </p>
          </div>
        </div>
      )}
      <div className="absolute top-4 left-4 z-[500] h-10 px-4 rounded-full bg-white shadow-lg border border-line inline-flex items-center gap-2 text-sm font-semibold">
        <span className="h-2 w-2 rounded-full bg-parrot" />
        <span className="font-mono">
          {hosts.filter((h) => h.online).length}
        </span>{" "}
        home chargers nearby
      </div>
      <button
        aria-label="Recenter map"
        onClick={() => {
          const first = hosts.find(hasLoc)
          if (hasLoc(user))
            map.current?.flyTo([user.lat, user.lng], 15, { duration: 0.8 })
          else if (first)
            map.current?.flyTo([first.lat, first.lng], 13, { duration: 0.8 })
        }}
        className="absolute bottom-6 right-4 z-[500] h-12 w-12 rounded-full bg-white shadow-lg border border-line grid place-items-center hover:scale-105 transition"
      >
        <Crosshair size={20} />
      </button>
      <AnimatePresence>
        {route?.coords && (
          <RouteCard
            key={route.hostId}
            r={route}
            hosts={hosts}
            onCharge={onCharge}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function RouteCard({ r, hosts, onCharge }) {
  const { state, dispatch } = useStore()
  const h = r && hosts.find((x) => x.id === r.hostId)
  if (!h) return null
  return (
    <motion.div
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 80, opacity: 0 }}
      transition={SPRING.soft}
      className="absolute z-[600] left-3 right-[4.5rem] bottom-3 md:right-auto md:w-[380px] rounded-3xl bg-white border border-line shadow-[0_24px_50px_-18px_rgba(15,23,42,.25)] p-4 md:p-5"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate truncate">{h.name}</p>
          <p className="mt-1 flex items-baseline gap-3">
            <Num
              value={r.km}
              decimals={1}
              suffix=" km"
              className="text-3xl font-bold"
            />
            <span className="font-mono text-xl font-bold text-parrot-ink">
              {r.mins} mins
            </span>
          </p>
          <p className="text-sm text-slate truncate">
            {r.via ? `via ${r.via}` : "Approximate — straight-line estimate"}
          </p>
        </div>
        <button
          aria-label="Close route"
          onClick={() => {
            dispatch({ type: "ROUTE", route: null })
            dispatch({ type: "SELECT", id: null })
          }}
          className="h-9 w-9 shrink-0 rounded-full grid place-items-center hover:bg-mint"
        >
          <X size={16} />
        </button>
      </div>
      <ul className="mt-3 space-y-1.5 hidden sm:block">
        {(
          r.steps || [
            `Routing unavailable — head towards ${h.name} using Google Maps`,
          ]
        ).map((s, i) => (
          <motion.li
            key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 + i * 0.1 }}
            className="text-sm flex gap-2"
          >
            <span className="h-5 w-5 shrink-0 rounded-full bg-mint-2 text-[11px] font-mono font-bold grid place-items-center">
              {i + 1}
            </span>
            {s}
          </motion.li>
        ))}
      </ul>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Btn
          variant="secondary"
          icon={Navigation}
          className="!h-11 !px-2 !text-sm"
          onClick={() => {
            const url = gmaps(state.user, h)
            if (url) window.open(url, "_blank", "noopener")
          }}
        >
          Google Maps
        </Btn>
        <Btn
          icon={Zap}
          className="!h-11 !px-2 !text-sm"
          disabled={!h.online}
          onClick={() => onCharge(h.id)}
        >
          Plug In
        </Btn>
      </div>
    </motion.div>
  )
}

export function BookingSheet({ host, onClose }) {
  const { state, dispatch } = useStore()
  const demo = Boolean(state.session.demo)
  const { bookings } = useBookingList()
  const toast = useToast()
  const soc = state.user.soc
  const [target, setTarget] = useState(Math.min(100, Math.max(85, soc + 1)))
  const kwh = round1(kwhNeeded(target, soc))
  const amt = Math.round(kwh * host.rate)
  const pub = Math.round(kwh * 24)
  const ref = useRef(null)
  const err = useErrorToast()
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const prev = document.activeElement
    ref.current?.querySelector("input")?.focus()
    const k = (e) => {
      if (e.key === "Escape") onClose()
      if (e.key === "Tab" && ref.current) {
        const f = ref.current.querySelectorAll("button:not([disabled]),input")
        if (e.shiftKey && document.activeElement === f[0]) {
          e.preventDefault()
          f[f.length - 1].focus()
        } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
          e.preventDefault()
          f[0].focus()
        }
      }
    }
    window.addEventListener("keydown", k)
    return () => {
      window.removeEventListener("keydown", k)
      prev?.focus?.()
    }
  }, [])
  const away = host.mins != null ? `${host.mins} mins away · ` : ""
  const confirmDemo = () => {
    const active = bookings.find(
      (b) =>
        b.driverId === state.session.userId &&
        (ACTIVE_STATUSES.includes(b.status) || b.status === "disputed"),
    )
    if (active) {
      toast(
        "Finish your current charge first",
        `You already have a session with ${active.hostName}.`,
        { tone: "warn" },
      )
      onClose()
      return dispatch({ type: "TAB", role: "driver", tab: "charge" })
    }
    const accepted = host.ownerId !== DEMO_USERS.host.id
    dispatch({
      type: "DEMO_BOOK",
      booking: demoBooking({
        id: `demo-d${Date.now()}`,
        host,
        driverId: state.session.userId,
        driver: state.session.name,
        startSoc: soc,
        targetSoc: target,
        status: accepted ? "accepted" : "requested",
      }),
    })
    toast(
      accepted ? "Booking accepted" : "Request sent",
      accepted
        ? `${host.name} · ${away}head over now`
        : `${host.name} · ${away}waiting for ${DEMO_USERS.host.name} to accept`,
    )
    onClose()
    dispatch({ type: "TAB", role: "driver", tab: "charge" })
  }
  const confirm = async () => {
    if (busy) return
    if (demo) return confirmDemo()
    setBusy(true)
    try {
      const res = await createBooking(host.id, soc, target)
      await refresh("bookings")
      const accepted = res?.booking?.status === "accepted"
      toast(
        accepted ? "Booking accepted" : "Request sent",
        accepted
          ? `${host.name} · ${away}head over now`
          : `${host.name} · ${away}waiting for the host`,
      )
      onClose()
      dispatch({ type: "TAB", role: "driver", tab: "charge" })
    } catch (e) {
      setBusy(false)
      err("Couldn't book this charger", e)
    }
  }
  const rows = [
    ["Energy needed", <Num value={kwh} decimals={1} suffix=" kWh" />],
    [
      "Estimated time",
      <span className="font-mono">{fmtHours(hoursFor(kwh, host.kw))}</span>,
    ],
    [
      "Host rate",
      <span className="font-mono">
        ₹{host.rate} × {kwh.toFixed(1)} = ₹{amt}
      </span>,
    ],
    [
      "Platform fee",
      <span className="font-mono">
        ₹0{" "}
        <span className="text-parrot-ink font-sans text-xs font-semibold">
          (launch offer)
        </span>
      </span>,
    ],
  ]
  return (
    <motion.div
      className="fixed inset-0 z-[900] flex items-end md:items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div
        className="absolute inset-0 bg-[rgba(15,23,42,.25)] backdrop-blur-[4px]"
        onClick={onClose}
      />
      <motion.div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Book charger"
        initial={{ y: 120, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 120, opacity: 0 }}
        transition={SPRING.soft}
        className="relative w-full md:max-w-lg bg-white rounded-t-[2rem] md:rounded-[2rem] p-6 md:p-7 max-h-[92vh] overflow-y-auto"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-display text-xl font-extrabold">{host.name}</h3>
            <p className="text-sm text-slate font-mono">
              {distText(host)} · {host.socket}
            </p>
          </div>
          <button
            aria-label="Close"
            onClick={onClose}
            className="h-10 w-10 shrink-0 rounded-full grid place-items-center hover:bg-mint"
          >
            <X size={18} />
          </button>
        </div>
        <div className="mt-6">
          <div className="flex justify-between text-sm">
            <span className="font-medium">Target battery</span>
            <span className="font-mono font-bold">
              {soc}% → <span className="text-parrot-ink">{target}%</span>
            </span>
          </div>
          <div className="mt-3">
            <Slider
              label="Target battery"
              value={target}
              min={Math.min(soc + 1, 100)}
              max={100}
              onChange={setTarget}
            />
          </div>
        </div>
        <div className="mt-5 divide-y divide-line rounded-2xl bg-mint px-4">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 py-3 text-sm">
              <span className="text-slate">{k}</span>
              <span className="font-semibold text-right">{v}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-end justify-between">
          <span className="font-display font-bold">Total ≈</span>
          <Num value={amt} prefix="₹" className="text-4xl font-bold" />
        </div>
        <div className="mt-3 rounded-2xl border border-line p-3 text-sm flex items-center justify-between gap-3">
          <span className="text-slate">
            Public fast charger ≈ <span className="font-mono">₹{pub}</span>{" "}
            (₹24/kWh, illustrative)
          </span>
          <span className="shrink-0 h-7 px-3 rounded-full btn-primary text-xs font-bold inline-flex items-center">
            You save ₹{pub - amt}
          </span>
        </div>
        {host.demo && (
          <p className="mt-3 rounded-xl bg-mint p-3 text-xs text-slate">
            <span className="font-semibold text-ink">Judge demo.</span> This
            booking is simulated on this device — nothing is sent to the server
            and no money is charged.
          </p>
        )}
        <p className="mt-3 text-xs text-mute">
          Final bill is based on the meter photos you and the host both confirm.
        </p>
        <div className="mt-5 grid grid-cols-[auto_1fr] gap-2">
          <Btn variant="secondary" onClick={onClose}>
            Cancel
          </Btn>
          <Btn icon={Navigation} magnetic disabled={busy} onClick={confirm}>
            {busy ? "Sending request…" : "Confirm & Navigate"}
          </Btn>
        </div>
      </motion.div>
    </motion.div>
  )
}

export default function DriverFind() {
  const { state, dispatch } = useStore()
  const toast = useToast()
  const all = useNearby()
  const { loading: hostsLoading } = useHostList()
  const demo = Boolean(state.session.demo)
  const [filters, setFilters] = useState([])
  const [scanning, setScanning] = useState(false)
  const [sheetId, setSheetId] = useState(null)
  const { user } = state
  const critical = user.soc < 20

  const list = all.filter((h) =>
    filters.every((f) => FILTERS.find((x) => x[0] === f)[2](h)),
  )
  const select = async (hOrId) => {
    const h =
      typeof hOrId === "string" ? all.find((x) => x.id === hOrId) : hOrId
    if (!h) return
    dispatch({ type: "SELECT", id: h.id })
    if (!hasLoc(state.user))
      return toast(
        "Share your location for directions",
        "Tap Detect my location to see the route to this socket.",
        { tone: "warn" },
      )
    const r = await fetchRoute(state.user, h)
    if (r) dispatch({ type: "ROUTE", route: { hostId: h.id, ...r } })
  }
  const openSheet = (hOrId) =>
    setSheetId(typeof hOrId === "string" ? hOrId : hOrId.id)

  // Robust location detection with Browser GPS + IP Geolocation Fallback
  const detect = async () => {
    if (demo)
      return toast(
        "Simulated location",
        "The judge demo uses a fixed spot in Sector 62, Noida — browser GPS isn't used.",
        { tone: "warn" },
      )

    setScanning(true)

    const applyLocation = async (lat, lng, areaLabel) => {
      const p = { lat: Number(lat), lng: Number(lng) }
      dispatch({
        type: "USER",
        patch: { ...p, located: true, areaName: areaLabel || "Your location" },
      })
      dispatch({ type: "ROUTE", route: null })
      dispatch({ type: "SELECT", id: null })
      setScanning(false)
      toast("Location updated", "Chargers are now sorted by distance from you.")
      try {
        const name = await reverseGeocode(p.lat, p.lng)
        if (name) dispatch({ type: "USER", patch: { areaName: name } })
      } catch {}
    }

    // Try Browser GPS first
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (g) => applyLocation(g.coords.latitude, g.coords.longitude, "GPS Location"),
        async () => {
          // Fallback to IP Geolocation if GPS fails or is blocked in iframe/preview
          try {
            const res = await fetch("https://ipapi.co/json/")
            const data = await res.json()
            if (data && data.latitude && data.longitude) {
              applyLocation(data.latitude, data.longitude, data.city || "Current City")
            } else {
              throw new Error("IP fallback failed")
            }
          } catch {
            setScanning(false)
            toast(
              "Couldn't get your location",
              "Allow location access and try again. Chargers are still bookable from the list.",
              { tone: "warn" },
            )
          }
        },
        { timeout: 7000, enableHighAccuracy: true },
      )
    } else {
      // Direct IP fallback if Geolocation not supported
      try {
        const res = await fetch("https://ipapi.co/json/")
        const data = await res.json()
        if (data && data.latitude && data.longitude) {
          applyLocation(data.latitude, data.longitude, data.city || "Current City")
        } else {
          setScanning(false)
          toast("Location unavailable", "Could not detect location.", { tone: "warn" })
        }
      } catch {
        setScanning(false)
        toast("Location unavailable", "Could not detect location.", { tone: "warn" })
      }
    }
  }

  const sheetHost = sheetId && all.find((h) => h.id === sheetId)

  return (
    <div className="lg:grid lg:grid-cols-[minmax(420px,45%)_1fr] lg:h-[calc(100vh-64px)]">
      <div className="h-[45vh] lg:h-full lg:order-2 lg:py-4 lg:pr-4">
        <div className="h-full lg:rounded-l-[2rem] lg:rounded-r-3xl overflow-hidden shadow-[0_10px_30px_-12px_rgba(114,214,0,.35)]">
          <MapView hosts={all} onSelect={select} onCharge={openSheet} />
        </div>
      </div>
      <div className="lg:order-1 lg:overflow-y-auto px-4 md:px-6 py-5 space-y-4 pb-28 lg:pb-8">
        <Card className="p-4 overflow-hidden">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 shrink-0 rounded-2xl bg-mint grid place-items-center">
              <MapPin size={20} className="text-parrot-ink" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-display font-bold truncate">
                {scanning
                  ? "Finding your location…"
                  : user.areaName ||
                    (hasLoc(user) ? "Your location" : "Location not shared")}
              </p>
              <p className="text-xs text-mute">
                {user.simulated
                  ? "Simulated location · judge demo"
                  : hasLoc(user)
                    ? "Active location"
                    : "Detect your location to sort chargers by distance"}
              </p>
            </div>
            <Btn
              variant="secondary"
              icon={LocateFixed}
              className="!h-11 !px-3 !text-sm"
              onClick={detect}
              disabled={scanning || demo}
            >
              {demo ? "Simulated" : "Detect my location"}
            </Btn>
          </div>
          {scanning &&
            [0, 1].map((i) => (
              <motion.span
                key={i}
                className="pointer-events-none absolute left-9 top-9 h-10 w-10 -ml-5 -mt-5 rounded-full border-2 border-parrot"
                initial={{ scale: 0.5, opacity: 0.8 }}
                animate={{ scale: 12, opacity: 0 }}
                transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.8 }}
              />
            ))}
        </Card>

        <motion.div
          animate={
            critical
              ? {
                  boxShadow: [
                    "0 0 0 0px rgba(245,158,11,0)",
                    "0 0 0 4px rgba(245,158,11,.35)",
                    "0 0 0 0px rgba(245,158,11,0)",
                  ],
                }
              : { boxShadow: "0 0 0 0px rgba(245,158,11,0)" }
          }
          transition={{ duration: 2, repeat: critical ? Infinity : 0 }}
          className="rounded-3xl bg-mint p-5"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate">
                Your EV
              </p>
              <p className="font-display font-bold">Battery level</p>
              <p className="text-xs text-mute">
                Set it from your car's display
              </p>
            </div>
            <p
              className={`font-mono text-3xl font-bold tnum ${
                critical ? "text-amber" : "text-parrot-ink"
              }`}
            >
              {user.soc}%
            </p>
          </div>
          <div className="mt-3 flex gap-[3px]">
            {Array.from({ length: 24 }).map((_, i) => (
              <span
                key={i}
                className="h-2.5 flex-1 rounded-sm transition-colors duration-500"
                style={{
                  background:
                    (i / 24) * 100 < user.soc
                      ? critical
                        ? "#F59E0B"
                        : user.soc < 50
                          ? "#A3C93A"
                          : "#72D600"
                      : "#E2EBDA",
                }}
              />
            ))}
          </div>
          <div className="mt-4">
            <Slider
              label="State of charge"
              value={user.soc}
              min={5}
              max={100}
              amber={critical}
              onChange={(v) => dispatch({ type: "USER", patch: { soc: v } })}
            />
          </div>
          <p className="mt-2 text-sm">
            <span className="font-mono font-bold">{user.soc}%</span>{" "}
            {critical ? (
              <span className="text-[#B45309] font-semibold">Critical</span>
            ) : (
              <span className="text-parrot-ink font-semibold">OK</span>
            )}{" "}
            →{" "}
            <span className="font-mono font-bold">{rangeKm(user.soc)} km</span>{" "}
            left
          </p>
          <AnimatePresence>
            {critical && (
              <motion.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-3 rounded-xl bg-amber/10 text-[#92400E] text-sm font-medium px-3 py-2 flex gap-2 items-center"
              >
                <AlertTriangle size={16} className="shrink-0" />
                Critical — {rangeKm(user.soc)} km left. Showing nearest chargers
                first.
              </motion.p>
            )}
          </AnimatePresence>
        </motion.div>

        <div>
          <div className="flex gap-2 overflow-x-auto snap-x pb-1 -mx-1 px-1 [scrollbar-width:none]">
            {FILTERS.map(([id, label]) => (
              <Chip
                key={id}
                active={filters.includes(id)}
                onClick={() =>
                  setFilters((f) =>
                    f.includes(id) ? f.filter((x) => x !== id) : [...f, id],
                  )
                }
              >
                {label}
              </Chip>
            ))}
          </div>
          <p className="mt-2 text-sm text-slate">
            <span className="font-mono font-bold text-ink">{list.length}</span>{" "}
            {hasLoc(user) ? "sockets near you" : "sockets listed"}
          </p>
        </div>

        {hostsLoading ? (
          [0, 1].map((i) => (
            <div key={i} className="rounded-3xl skel shimmer h-[380px]" />
          ))
        ) : (
          <motion.div layout className="space-y-4">
            <AnimatePresence mode="popLayout">
              {list.map((h, i) => (
                <HostCard
                  key={h.id}
                  h={h}
                  selected={state.selectedHostId === h.id}
                  best={critical && i === 0}
                  onSelect={select}
                  onCharge={openSheet}
                />
              ))}
            </AnimatePresence>
            {!list.length && (
              <p className="text-center text-slate py-10">
                {all.length
                  ? "No sockets match these filters — try removing one."
                  : "No home chargers are listed yet. New sockets appear here the moment a host goes live."}
              </p>
            )}
          </motion.div>
        )}
      </div>
      <AnimatePresence>
        {sheetHost && (
          <BookingSheet host={sheetHost} onClose={() => setSheetId(null)} />
        )}
      </AnimatePresence>
    </div>
  )
}
