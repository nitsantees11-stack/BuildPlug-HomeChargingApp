// @ts-nocheck
import { useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  ArrowRight,
  Bell,
  Camera,
  Check,
  ChevronRight,
  IndianRupee,
  Leaf,
  Power,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  Zap,
  X,
} from "lucide-react"
import { EASE, SPRING, geocode } from "../lib"
import { useStore, useToast } from "../store"
import {
  Avatar,
  Btn,
  Card,
  Chip,
  CopyBtn,
  Img,
  LeafBurst,
  Num,
  Slider,
} from "../ui"
import { Stepper } from "./DriverCharge"
import { VideoPreview } from "./DriverFind"
import { DisputePanel, LiveMeterTile, MeterCapture } from "./LiveMeter"
import { useErrorToast } from "../lib/errorToast"
import { listMySocket, removeSocket, setSocketOnline } from "../lib/api"
import { uploadToCloudinary } from "../lib/upload"
import { ACTIVE_STATUSES, refresh, rowToHost, stepStatus } from "../lib/live"
import {
  billFor,
  meterSrcs,
  useBookingAction,
  useBookingList,
  useHostList,
  useReadings,
  useStats,
} from "../lib/data"
import {
  DEMO_USERS,
  demoHost,
  demoMediaUrl,
  demoPin,
  revokeDemoMedia,
} from "../demo"

const stagger = (i) => ({
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  transition: { ...SPRING.soft, delay: i * 0.08 },
})
const initialsOf = (s) =>
  s.trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
// browser GPS as a fallback when the typed locality can't be geocoded
const currentPosition = () =>
  new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      (g) => resolve({ lat: g.coords.latitude, lng: g.coords.longitude }),
      () => resolve(null),
      { timeout: 8000 },
    )
  })

function Spark({ data }) {
  const max = Math.max(...data),
    min = Math.min(...data)
  const pts = data.map((v, i) => [
    10 + i * (280 / 6),
    70 - ((v - min) / (max - min || 1)) * 55,
  ])
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0]} ${p[1]}`).join(" ")
  const last = pts[pts.length - 1]
  return (
    <svg viewBox="0 0 300 80" className="w-full h-24">
      <motion.path
        d={`${d} L${last[0]} 80 L10 80 Z`}
        fill="#EAF6DC"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
      />
      <motion.path
        d={d}
        stroke="#72D600"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.2, ease: EASE.inOut }}
      />
      <circle cx={last[0]} cy={last[1]} r="5" fill="#72D600" />
      <motion.circle
        cx={last[0]}
        cy={last[1]}
        r="5"
        fill="none"
        stroke="#72D600"
        strokeWidth="2"
        animate={{ scale: [1, 2.5], opacity: [0.8, 0] }}
        transition={{ duration: 1.6, repeat: Infinity }}
        style={{ originX: `${last[0]}px`, originY: `${last[1]}px` }}
      />
    </svg>
  )
}

const NO_STATS = {
  totalEarned: 0,
  energyShared: 0,
  cars: 0,
  last7: [0, 0, 0, 0, 0, 0, 0],
}

// sockets the signed-in user owns
function useMySockets() {
  const { state } = useStore()
  const { hosts, loading } = useHostList()
  return {
    mine: hosts.filter((h) => h.ownerId === state.session.userId),
    loading,
  }
}

export function HostOverview() {
  const { state, dispatch } = useStore()
  const toast = useToast()
  const err = useErrorToast()
  const demo = Boolean(state.session.demo)
  const { stats, error: statsError } = useStats()
  const { mine } = useMySockets()
  const [toggling, setToggling] = useState(false)
  // earnings come from the server's paid bookings (simulated in Judge Mode),
  // status from the host rows
  const num = (v) => (Number.isFinite(v) ? v : 0)
  const s = {
    totalEarned: num(stats?.totalEarned),
    energyShared: num(stats?.energyShared),
    cars: num(stats?.cars),
    last7:
      Array.isArray(stats?.last7) && stats.last7.length
        ? stats.last7.map(num)
        : NO_STATS.last7,
    online: mine.some((h) => h.online),
  }
  const toggle = async () => {
    if (toggling) return
    if (!mine.length)
      return toast(
        "No socket listed yet",
        "List your socket first, then switch it online.",
        {
          tone: "warn",
          action: {
            label: "List my socket",
            onClick: () => dispatch({ type: "TAB", role: "host", tab: "list" }),
          },
        },
      )
    const on = !s.online
    if (demo) {
      dispatch({
        type: "DEMO_HOST",
        ownerId: state.session.userId,
        patch: { online: on },
      })
      return toast(
        on ? "Socket online" : "Socket offline",
        on
          ? "Your pin is back on the driver map."
          : "Drivers can't book you right now.",
      )
    }
    setToggling(true)
    try {
      await Promise.all(mine.map((h) => setSocketOnline(h.id, on)))
      await refresh("hosts")
      toast(
        on ? "Socket online" : "Socket offline",
        on
          ? "Your pin is back on the driver map."
          : "Drivers can't book you right now.",
      )
    } catch (e) {
      err("Couldn't switch your socket", e, toggle)
      refresh("hosts")
    } finally {
      setToggling(false)
    }
  }
  const [hours, setHours] = useState(4)
  const [kw, setKw] = useState(7.2)
  const est = Math.round(kw * hours * 30 * 0.35 * 12)
  const co = s.energyShared * 0.8
  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 py-8 pb-28 space-y-5">
      <motion.h1
        {...stagger(0)}
        className="font-display text-3xl md:text-4xl font-extrabold tracking-tight"
      >
        Namaste, {state.session.name} 👋
      </motion.h1>
      {demo && (
        <p role="status" className="text-sm text-[#92400E]">
          Judge demo — earnings below are sample figures.
        </p>
      )}
      {statsError && !stats && (
        <p role="status" className="text-sm text-[#92400E]">
          Couldn't load your earnings — retrying automatically.
        </p>
      )}
      <div className="grid md:grid-cols-3 gap-4">
        <motion.div {...stagger(1)} className="rounded-3xl bg-mint p-6">
          <p className="text-sm text-slate flex items-center gap-1.5">
            <IndianRupee size={15} />
            Total Earned
          </p>
          <Num
            value={s.totalEarned}
            prefix="₹"
            className="block mt-2 text-4xl lg:text-5xl font-bold"
          />
        </motion.div>
        <motion.div {...stagger(2)} className="rounded-3xl bg-mint p-6">
          <p className="text-sm text-slate flex items-center gap-1.5">
            <Zap size={15} />
            Energy Shared
          </p>
          <Num
            value={s.energyShared}
            suffix=" kWh"
            className="block mt-2 text-4xl lg:text-5xl font-bold"
          />
        </motion.div>
        <motion.div
          {...stagger(3)}
          className={`rounded-3xl p-6 transition-colors ${
            s.online ? "bg-mint" : "bg-slate-100"
          }`}
        >
          <p className="text-sm text-slate flex items-center gap-1.5">
            <Power size={15} />
            Active Status
          </p>
          <div className="mt-3 flex items-center justify-between gap-3">
            <AnimatePresence mode="wait">
              <motion.p
                key={String(s.online)}
                initial={{ rotateX: 90, opacity: 0 }}
                animate={{ rotateX: 0, opacity: 1 }}
                exit={{ rotateX: -90, opacity: 0 }}
                className="font-display font-bold text-lg"
              >
                {s.online ? "🟢 Socket Online" : "Socket Offline"}
              </motion.p>
            </AnimatePresence>
            <button
              role="switch"
              aria-checked={s.online}
              aria-label="Socket online"
              aria-busy={toggling}
              disabled={toggling}
              onClick={toggle}
              className={`relative h-9 w-16 shrink-0 rounded-full transition-colors disabled:opacity-70 ${
                s.online ? "btn-primary" : "bg-slate-300"
              }`}
            >
              <motion.span
                layout
                transition={SPRING.snap}
                className={`absolute top-1 h-7 w-7 rounded-full bg-white shadow ${
                  s.online ? "right-1" : "left-1"
                }`}
              />
              {s.online && (
                <motion.span
                  key="rip"
                  className="absolute right-1 top-1 h-7 w-7 rounded-full bg-parrot"
                  initial={{ scale: 1, opacity: 0.6 }}
                  animate={{ scale: 2.4, opacity: 0 }}
                  transition={{ duration: 0.7 }}
                />
              )}
            </button>
          </div>
          {!s.online && (
            <p className="text-xs text-slate mt-2">
              {!mine.length
                ? "No socket listed yet — list one to appear on the driver map."
                : "Drivers can't see you — your pin is greyed out."}
            </p>
          )}
        </motion.div>
      </div>
      <div className="grid md:grid-cols-[1.4fr_1fr] gap-4">
        <motion.div {...stagger(4)}>
          <Card className="p-6">
            <div className="flex justify-between">
              <p className="font-display font-bold">Earnings · last 7 days</p>
              <span className="font-mono text-sm text-parrot-ink font-bold">
                ₹{s.last7.reduce((a, b) => a + b, 0).toLocaleString("en-IN")}
              </span>
            </div>
            <Spark data={s.last7} />
          </Card>
        </motion.div>
        <motion.div {...stagger(5)}>
          <Card className="p-6 h-full">
            <p className="font-display font-bold flex items-center gap-2">
              <Leaf size={18} className="text-parrot-ink" />
              Impact
            </p>
            <p className="mt-3">
              <Num
                value={Math.round(co)}
                suffix=" kg"
                className="text-3xl font-bold"
              />{" "}
              <span className="text-slate">CO₂ avoided (est.)</span>
            </p>
            <p className="text-sm text-slate mt-1">
              ≈{" "}
              <span className="font-mono font-bold text-ink">
                {Math.round(co / 21)}
              </span>{" "}
              tree-years · Charges completed:{" "}
              <span className="font-mono font-bold text-ink">{s.cars}</span>
            </p>
          </Card>
        </motion.div>
      </div>
      <motion.div {...stagger(6)}>
        <Card className="p-6">
          <p className="font-display font-bold">Monthly income estimator</p>
          <div className="mt-4 grid md:grid-cols-[1fr_auto_auto] gap-5 items-center">
            <div>
              <p className="text-sm text-slate mb-2">
                Hours/day:{" "}
                <span className="font-mono font-bold text-ink">{hours}</span>
              </p>
              <Slider
                label="Hours per day"
                value={hours}
                min={1}
                max={12}
                onChange={setHours}
              />
            </div>
            <div className="flex rounded-full bg-mint p-1">
              {[3.3, 7.2].map((k) => (
                <button
                  key={k}
                  onClick={() => setKw(k)}
                  aria-pressed={kw === k}
                  className={`h-10 px-4 rounded-full text-sm font-bold font-mono ${
                    kw === k ? "btn-primary" : ""
                  }`}
                >
                  {k} kW
                </button>
              ))}
            </div>
            <p>
              <Num value={est} prefix="₹" className="text-3xl font-bold" />
              <span className="text-slate"> / month</span>
            </p>
          </div>
          <p className="text-xs text-mute mt-2">
            kW × hours × 30 × 35% utilisation × ₹12 (illustrative)
          </p>
        </Card>
      </motion.div>
    </div>
  )
}

export function HostList({ goDriver }) {
  const { state, dispatch } = useStore()
  const toast = useToast()
  const [name, setName] = useState("")
  const [loc, setLoc] = useState("")
  const [rate, setRate] = useState(12)
  const [more, setMore] = useState(false)
  const [socket, setSocket] = useState("7.2kW Wallbox")
  const [perks, setPerks] = useState(["CCTV"])
  const [busy, setBusy] = useState(false)
  const [burst, setBurst] = useState(0)
  const [listed, setListed] = useState(null)
  const err = useErrorToast()
  const demo = Boolean(state.session.demo)
  const { mine } = useMySockets()
  // show the server's copy (media updates arrive via realtime)
  const shown = (listed && mine.find((h) => h.id === listed.id)) || listed
  const sockLabel = socket === "7.2kW Wallbox" ? "7.2kW Type-2" : socket
  const submit = async () => {
    if (!name.trim() || !loc.trim())
      return toast("Two quick details", "Add a home name and locality.", {
        tone: "warn",
      })
    if (demo) {
      // Judge Mode: a local listing with a simulated pin near Sector 62
      const h = demoHost({
        id: `demo-l${Date.now()}`,
        name: name.trim(),
        ownerId: state.session.userId,
        ownerName: state.session.name,
        ...demoPin(`${name}|${loc}`),
        locality: loc.trim(),
        socket,
        rate,
        perks,
        isNew: true,
      })
      dispatch({ type: "DEMO_HOST", host: h })
      setBurst(Date.now())
      setListed(h)
      return toast(
        "Your socket is LIVE on the driver map ⚡",
        `${h.name} · simulated pin near Sector 62 (judge demo)`,
      )
    }
    setBusy(true)
    try {
      // the pin goes where the locality geocodes to, or the host's own GPS —
      // never a made-up spot
      let g = await geocode(loc)
      let viaGps = false
      if (!g) {
        g = await currentPosition()
        viaGps = Boolean(g)
      }
      if (!g)
        return toast(
          "Couldn't find that locality",
          "Add the city (e.g. 'Sector 62, Noida') or allow location access so we can place your pin.",
          { tone: "warn" },
        )
      // the server validates and returns the authoritative row
      const { host } = await listMySocket({
        name: name.trim(),
        locality: loc.trim(),
        rate,
        socket,
        perks,
        lat: g.lat,
        lng: g.lng,
      })
      await refresh("hosts")
      const h = rowToHost(host)
      setBurst(Date.now())
      setListed(h)
      toast(
        "Your socket is LIVE on the driver map ⚡",
        viaGps ? `${h.name} · pinned at your current location` : h.name,
      )
    } catch (e) {
      err("Couldn't list your socket", e)
    } finally {
      setBusy(false)
    }
  }
  const preview = {
    name: name || "Your home charger",
    loc: loc || "Your locality",
  }
  const input =
    "mt-1.5 w-full h-12 rounded-xl bg-mint px-4 border border-transparent outline-none focus:border-parrot focus:ring-4 focus:ring-parrot/20"
  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 py-8 pb-28 grid lg:grid-cols-[1.2fr_1fr] gap-6 items-start">
      <Card className="p-6 md:p-8">
        <h2 className="font-display text-2xl font-extrabold">List My Socket</h2>
        <p className="text-slate mt-1">
          Three details. Live on the driver map in seconds.
        </p>
        <label className="block mt-6 text-sm font-medium">
          Home name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Sharma Villa Solar Driveway"
            className={input}
          />
        </label>
        <label className="block mt-4 text-sm font-medium">
          Sector / Locality
          <input
            value={loc}
            onChange={(e) => setLoc(e.target.value)}
            placeholder="Sector 62, Noida"
            className={input}
          />
        </label>
        <div className="mt-5">
          <div className="flex justify-between items-baseline text-sm font-medium">
            Rate per kWh
            <span className="font-mono text-3xl font-bold">₹{rate}</span>
          </div>
          <div className="mt-2">
            <Slider
              label="Rate per kWh"
              value={rate}
              min={9}
              max={18}
              onChange={setRate}
            />
          </div>
        </div>
        <button
          onClick={() => setMore((m) => !m)}
          aria-expanded={more}
          className="mt-5 h-11 flex items-center gap-1 text-sm font-semibold text-parrot-ink"
        >
          <motion.span animate={{ rotate: more ? 90 : 0 }}>
            <ChevronRight size={16} />
          </motion.span>
          More options
        </button>
        <AnimatePresence>
          {more && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <p className="mt-1 text-sm text-slate">Socket type</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {["15A Plug", "7.2kW Wallbox", "11kW AC"].map((x) => (
                  <Chip
                    key={x}
                    active={socket === x}
                    onClick={() => setSocket(x)}
                  >
                    {x}
                  </Chip>
                ))}
              </div>
              <p className="mt-3 text-sm text-slate">Perks</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {["CCTV", "Family Verified", "Free Chai", "Solar"].map((x) => (
                  <Chip
                    key={x}
                    active={perks.includes(x)}
                    onClick={() =>
                      setPerks((p) =>
                        p.includes(x) ? p.filter((y) => y !== x) : [...p, x],
                      )
                    }
                  >
                    {x}
                  </Chip>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="relative mt-6">
          <LeafBurst trigger={burst} />
          <Btn
            className="w-full"
            icon={Zap}
            magnetic
            disabled={busy}
            onClick={submit}
          >
            {busy ? "Placing your pin…" : "Go live on the map"}
          </Btn>
        </div>
        <AnimatePresence>
          {shown && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={SPRING.soft}
              className="mt-4 rounded-2xl bg-mint p-4 flex flex-wrap items-center justify-between gap-3"
            >
              <p className="text-sm">
                <span className="font-bold">{shown.name}</span> is live.
              </p>
              <Btn
                variant="secondary"
                className="!h-11 !text-sm"
                onClick={() => goDriver(shown)}
              >
                See it on the Driver map <ArrowRight size={16} />
              </Btn>
              <HostMedia host={shown} />
            </motion.div>
          )}
        </AnimatePresence>
        <MySockets
          onRemoved={(id) => setListed((l) => (l?.id === id ? null : l))}
        />
      </Card>
      <div className="lg:sticky lg:top-24">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate mb-2">
          Live preview · how drivers see you
        </p>
        <Card className="overflow-hidden">
          <div className="relative aspect-video bg-mint rounded-t-3xl grid place-items-center overflow-hidden">
            {shown?.mediaPublicId || shown?.mediaUrl ? (
              <VideoPreview host={shown} />
            ) : (
              <Zap size={40} className="text-parrot-ink" />
            )}
            <span className="absolute top-3 right-3 h-7 px-3 rounded-full btn-primary text-xs font-mono font-bold inline-flex items-center">
              ₹{rate} / kWh
            </span>
            <span className="absolute bottom-3 right-3 h-6 px-2.5 rounded-full btn-primary text-[11px] font-bold inline-flex items-center">
              🆕 Just listed
            </span>
          </div>
          <div className="p-5">
            <div className="flex items-center gap-3">
              <Avatar initials={initialsOf(preview.name)} />
              <div className="min-w-0">
                <p className="font-display font-bold truncate">
                  {preview.name}
                </p>
                <p className="text-sm text-slate truncate">
                  {preview.loc} · {sockLabel}
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {perks.map((p) => (
                <span
                  key={p}
                  className="h-6 px-2.5 rounded-full bg-mint text-xs font-medium inline-flex items-center"
                >
                  {p}
                </span>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}

// Signed upload of a driveway photo or walkthrough video; the card updates when
// the server pushes the new host row.
// every socket this host has listed, each removable once it's not in use
function MySockets({ onRemoved }) {
  const { mine } = useMySockets()
  if (!mine.length) return null
  return (
    <div className="mt-6 border-t border-line pt-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate">
        Your sockets
      </p>
      <ul className="mt-2 divide-y divide-line">
        {mine.map((h) => (
          <li
            key={h.id}
            className="py-3 flex flex-wrap items-center justify-between gap-3"
          >
            <div className="min-w-0">
              <p className="font-semibold truncate">{h.name}</p>
              <p className="text-xs text-slate">
                {[h.locality, `₹${h.rate}/kWh`, h.online ? "Online" : "Offline"]
                  .filter(Boolean)
                  .join(" · ")}
                {h.reviews > 0 && Number.isFinite(h.rating)
                  ? ` · ★ ${h.rating.toFixed(1)} (${h.reviews})`
                  : ""}
              </p>
            </div>
            <RemoveSocket host={h} onRemoved={onRemoved} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function RemoveSocket({ host, onRemoved }) {
  const { state, dispatch } = useStore()
  const toast = useToast()
  const err = useErrorToast()
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const remove = async () => {
    if (!confirm) return setConfirm(true)
    if (busy) return
    if (state.session.demo) {
      const inUse = (state.demo?.bookings ?? []).some(
        (b) =>
          b.hostId === host.id &&
          (ACTIVE_STATUSES.includes(b.status) || b.status === "disputed"),
      )
      if (inUse) {
        setConfirm(false)
        return toast(
          "Socket in use",
          "Finish or decline the active booking before removing this socket.",
        )
      }
      dispatch({ type: "DEMO_HOST", id: host.id, remove: true })
      onRemoved?.(host.id)
      return toast("Socket removed", `${host.name} is off the driver map.`)
    }
    setBusy(true)
    try {
      await removeSocket(host.id)
      await refresh("hosts")
      onRemoved?.(host.id)
      toast("Socket removed", `${host.name} is off the driver map.`)
    } catch (e) {
      setConfirm(false)
      err("Couldn't remove that socket", e)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex items-center gap-2">
      {confirm && !busy && (
        <Btn
          variant="ghost"
          className="!h-10 !text-sm"
          onClick={() => setConfirm(false)}
        >
          Keep
        </Btn>
      )}
      <Btn
        variant="secondary"
        icon={Trash2}
        className={`!h-10 !text-sm ${confirm ? "!text-[#B42318]" : ""}`}
        onClick={remove}
      >
        {busy ? "Removing…" : confirm ? "Tap again to remove" : "Remove"}
      </Btn>
    </div>
  )
}

function HostMedia({ host }) {
  const { state, dispatch } = useStore()
  const toast = useToast()
  const err = useErrorToast()
  const ref = useRef(null)
  const [progress, setProgress] = useState(null)
  const upload = async (file) => {
    if (!file || progress != null) return
    if (state.session.demo) {
      revokeDemoMedia(host.mediaUrl)
      dispatch({
        type: "DEMO_HOST",
        id: host.id,
        patch: {
          mediaUrl: demoMediaUrl(file),
          mediaType: file.type.startsWith("video") ? "video" : "image",
        },
      })
      return toast(
        "Media added",
        "Shown on your charger card — kept on this device only.",
      )
    }
    setProgress(10)
    // Also upload to Supabase Bucket & local cache so host photo never disappears
    uploadMediaToBucket("hosts", host.id, file).then((bucketUrl) => {
      if (bucketUrl) {
        saveHostPhotoCache(host.id, {
          mediaUrl: bucketUrl,
          mediaType: file.type.startsWith("video") ? "video" : "image",
        })
      }
    })
    try {
      const res = await uploadToCloudinary({
        file,
        purpose: "host_media",
        hostId: host.id,
        onProgress: setProgress,
      })
      if (res?.mediaUrl || res?.secure_url || res?.url) {
        saveHostPhotoCache(host.id, {
          mediaUrl: res.mediaUrl || res.secure_url || res.url,
          mediaPublicId: res.mediaPublicId || res.public_id || null,
          mediaType: file.type.startsWith("video") ? "video" : "image",
        })
      }
      await refresh("hosts")
      toast("Media added", "Drivers now see it on your charger card.")
    } catch (e) {
      await refresh("hosts")
      err("Media upload failed", e, () => upload(file))
    } finally {
      setProgress(null)
    }
  }
  return (
    <div className="w-full">
      <input
        ref={ref}
        type="file"
        accept="image/*,video/*"
        className="sr-only"
        aria-label="Driveway photo or video"
        onChange={(e) => {
          upload(e.target.files?.[0])
          e.target.value = ""
        }}
      />
      {progress != null ? (
        <div aria-live="polite">
          <p className="text-sm font-semibold">
            Uploading… <span className="font-mono">{progress}%</span>
          </p>
          <div className="mt-1.5 h-2 rounded-full bg-white overflow-hidden">
            <motion.div
              className="h-full btn-primary rounded-full"
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>
      ) : (
        <Btn
          variant="secondary"
          icon={Camera}
          className="!h-11 !text-sm"
          onClick={() => ref.current?.click()}
        >
          {host.mediaPublicId || host.mediaUrl
            ? "Replace photo / video"
            : "Add driveway photo or video"}
        </Btn>
      )}
    </div>
  )
}

function LiveHostBooking({ b, i }) {
  const { state } = useStore()
  const demo = Boolean(state.session.demo)
  const toast = useToast()
  const err = useErrorToast()
  const proof = [
    "startMeter",
    "charging",
    "endMeter",
    "awaitingPay",
    "paid",
    "disputed",
  ].includes(b.status)
  const { start, end } = useReadings(proof ? b.id : null)
  const [pending, act] = useBookingAction(b, (e) =>
    err("That didn't go through", e),
  )
  const est = b.hasBill ? b.amount : b.estimateAmount
  const bill = billFor(demo, b, start, end)
  const driverStep =
    demo && b.driverId !== DEMO_USERS.driver.id && DEMO_DRIVER_STEP[b.status]
  return (
    <motion.div
      layout
      initial={{ x: 80, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ ...SPRING.soft, delay: i * 0.06 }}
    >
      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-3">
          {b.status === "requested" ? (
            <motion.div
              animate={{ rotate: [0, -15, 15, -15, 0] }}
              transition={{ duration: 0.5, repeat: 2 }}
              className="h-10 w-10 rounded-2xl bg-mint grid place-items-center"
            >
              <Bell size={18} className="text-parrot-ink" />
            </motion.div>
          ) : (
            <Avatar initials={initialsOf(b.driver)} />
          )}
          <div className="flex-1 min-w-0">
            <p className="font-display font-bold">
              {b.driver} — {b.car}
            </p>
            <p className="text-sm text-slate">
              wants{" "}
              <span className="font-mono">
                {b.startSoc}→{b.targetSoc}%
              </span>{" "}
              · {b.hasBill ? "" : "≈ "}
              <span className="font-mono">₹{est}</span> · {b.hostName}
            </p>
          </div>
          {b.status === "paid" && (
            <span
              className="h-7 px-3 rounded-full btn-primary text-xs font-bold inline-flex items-center gap-1"
              title="Meter readings were confirmed by both of you. Payment is settled directly and confirmed by the driver."
            >
              <ShieldCheck size={13} />
              Driver marked paid
            </span>
          )}
          {b.status === "requested" && (
            <span className="h-7 px-3 rounded-full bg-amber/15 text-[#92400E] text-xs font-bold inline-flex items-center">
              Pending
            </span>
          )}
          {b.status === "disputed" && (
            <span className="h-7 px-3 rounded-full bg-amber/15 text-[#92400E] text-xs font-bold inline-flex items-center gap-1">
              <TriangleAlert size={13} />
              Check readings
            </span>
          )}
        </div>
        {b.status === "requested" && (
          <div className="mt-4 flex gap-2">
            <Btn
              icon={Check}
              disabled={!!pending}
              onClick={() =>
                act("Accepting…", "accept", () =>
                  toast("Booking accepted", `${b.driver} is on the way`),
                )
              }
            >
              {pending === "Accepting…" ? pending : "Accept"}
            </Btn>
            <Btn
              variant="secondary"
              icon={X}
              disabled={!!pending}
              onClick={() =>
                act("Declining…", "decline", () =>
                  toast("Booking declined", "The driver has been notified.", {
                    tone: "warn",
                  }),
                )
              }
            >
              {pending === "Declining…" ? pending : "Decline"}
            </Btn>
          </div>
        )}
        {b.status !== "requested" && b.status !== "paid" && (
          <div className="mt-5">
            <Stepper
              status={stepStatus(b)}
              labels={[
                "On the way",
                "Start meter",
                "Charging",
                "End meter",
                "Paid",
              ]}
            />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-mint p-4">
              <p className="font-mono text-sm font-bold">
                {LIVE_LINE[b.status]?.(b)}
              </p>
              <span className="text-xs text-slate">
                {demo
                  ? "Simulated · judge demo"
                  : "Synced live with the driver"}
              </span>
            </div>

            {/* HOST-ONLY STOP CHARGING BUTTON */}
            {b.status === "charging" && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-parrot/40 bg-white p-4">
                <div className="text-xs text-slate">
                  <p className="font-display font-bold text-sm text-ink">
                    Host Charging Control
                  </p>
                  <p>
                    Stop the session when the vehicle reaches target charge to
                    capture the end meter.
                  </p>
                </div>
                <Btn
                  icon={Zap}
                  disabled={!!pending}
                  onClick={() =>
                    act("Stopping…", "finish_charging", () =>
                      toast(
                        "Charging stopped by Host",
                        "Now capture & confirm the end meter reading.",
                      ),
                    )
                  }
                >
                  {pending || "Stop charging & capture end meter"}
                </Btn>
              </div>
            )}

            {driverStep && b.status !== "charging" && (
              <Btn
                variant="secondary"
                className="mt-3 !h-11 !text-sm"
                onClick={() =>
                  act(driverStep[0], driverStep[1], () =>
                    toast(driverStep[2], `${b.driver} · simulated`),
                  )
                }
              >
                {driverStep[0]}
              </Btn>
            )}
            {(b.status === "startMeter" || b.status === "endMeter") && (
              <div className="mt-4 grid sm:grid-cols-2 gap-4 items-start">
                <LiveMeterTile
                  label={b.status === "startMeter" ? "START" : "END"}
                  reading={b.status === "startMeter" ? start : end}
                  bookingId={b.id}
                  stage={b.status === "startMeter" ? "start" : "end"}
                />
                <div>
                  <p className="font-display font-bold">
                    Confirm the {b.status === "startMeter" ? "start" : "end"}{" "}
                    reading
                  </p>
                  <p className="text-sm text-slate">
                    Check the driver's photo against your meter (or capture it
                    yourself), then confirm the number.
                  </p>
                  <MeterCapture
                    b={b}
                    stage={b.status === "startMeter" ? "start" : "end"}
                    reading={b.status === "startMeter" ? start : end}
                    party="host"
                  />
                </div>
              </div>
            )}
            {b.status === "disputed" && (
              <div className="mt-4">
                <DisputePanel b={b} start={start} end={end} party="host" />
              </div>
            )}
          </div>
        )}
        {(b.status === "paid" || b.status === "awaitingPay") && (
          <div className="mt-4 grid grid-cols-[1fr_1fr_auto] gap-3 items-center">
            <LiveMeterTile
              label="START"
              reading={start}
              kwh={b.startKwh}
              bookingId={b.id}
              stage="start"
            />
            <LiveMeterTile
              label="END"
              reading={end}
              kwh={b.endKwh}
              bookingId={b.id}
              stage="end"
            />
            <div className="text-right">
              <p className="font-mono text-xs text-slate">
                {b.startKwh?.toFixed(1)} → {b.endKwh?.toFixed(1)}
              </p>
              <p className="font-mono font-bold">
                {(b.kwhUsed ?? 0).toFixed(1)} kWh
              </p>
              <p className="font-mono text-2xl font-bold text-parrot-ink">
                ₹{b.amount}
              </p>
            </div>
          </div>
        )}
        {b.status === "paid" && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate">
            <span>
              {b.ref && (
                <>
                  PLUG-HOME ref{" "}
                  <span className="font-mono font-bold text-ink">{b.ref}</span>{" "}
                  ·{" "}
                </>
              )}
              Settled directly with the driver — check you've received ₹
              {b.amount}.
            </span>
            {bill && <CopyBtn text={bill} label="Copy bill URL" />}
          </div>
        )}
      </Card>
    </motion.div>
  )
}


export function HostBookings() {
  const { state } = useStore()
  const { bookings, loading, error, refresh: retry } = useBookingList()
  const list = bookings.filter(
    (b) =>
      b.hostOwnerId === state.session.userId &&
      b.status !== "declined" &&
      b.status !== "cancelled",
  )
  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-8 pb-28 space-y-4">
      <h2 className="font-display text-2xl font-extrabold">Bookings & Proof</h2>
      {loading &&
        [0, 1].map((i) => (
          <div key={i} className="h-28 rounded-3xl skel shimmer" />
        ))}
      {!loading && error && !bookings.length && (
        <p className="text-slate">
          Couldn't load bookings.{" "}
          <button
            onClick={retry}
            className="font-semibold text-parrot-ink hover:underline"
          >
            Try again
          </button>
        </p>
      )}
      {!loading && !error && !list.length && (
        <p className="text-slate">No bookings yet — keep your socket online.</p>
      )}
      <AnimatePresence>
        {list.map((b, i) => (
          <LiveHostBooking key={b.id} b={b} i={i} />
        ))}
      </AnimatePresence>
    </div>
  )
}
