// @ts-nocheck
import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  BatteryCharging, Check, ChevronDown, ChevronUp, Clock, Download,
  History, Hourglass, MapPin, MessageSquare, Navigation, Plug,
  Receipt, ShieldCheck, Square, Star, TreePine, UserCheck, X, Zap,
} from "lucide-react"
import {
  EASE, SPRING, co2, etaMins, fmtHours, gmaps, hasLoc, haversine, round1,
} from "../lib"
import { useStore, useToast } from "../store"
import { Avatar, Btn, Card, CopyBtn, Img, Num } from "../ui"
import { DEMO_USERS } from "../demo"
import { ACTIVE_STATUSES, refresh, stepStatus } from "../lib/live"
import { reviewBooking } from "../lib/api"
import {
  billFor, useBookingAction, useBookingList, useHostList, useReadings, useTimeline,
} from "../lib/data"
import { useErrorToast } from "../lib/errorToast"
import { DisputePanel, LiveMeterTile, MeterCapture } from "./LiveMeter"
import { InvoiceCard, PhaseStepper, TripHero } from "./Trip"

const STAGES = ["Navigate", "Start meter", "Charging", "End meter", "Pay"]
// driver trip: the request itself is step 1, like a ride request
const DRIVER_STAGES = ["Requested", "Navigate", "Start meter", "Charging", "End meter", "Pay"]
const stageIdx = (s) =>
  ({
    requested: -1, accepted: 0, navigating: 0, startMeter: 1,
    charging: 2, endMeter: 3, awaitingPay: 4, paid: 5,
  })[s] ?? 0

export function Stepper({ status, labels = STAGES, withRequest = false }) {
  const idx = stageIdx(status) + (withRequest ? 1 : 0)
  return (
    <div className="flex items-start">
      {labels.map((l, i) => (
        <div key={l} className="flex-1 flex flex-col items-center relative">
          {i > 0 && (
            <div className="absolute top-3.5 right-1/2 w-full h-1 bg-mint-2">
              <motion.div
                className="h-full bg-parrot"
                initial={false}
                animate={{ width: idx >= i ? "100%" : "0%" }}
                transition={{ duration: 0.6, ease: EASE.inOut }}
              />
            </div>
          )}
          <div
            className={`relative z-10 h-8 w-8 rounded-full grid place-items-center text-xs font-mono font-bold ${
              idx > i
                ? "btn-primary"
                : idx === i
                  ? "bg-white border-2 border-parrot"
                  : "bg-white border-2 border-line text-mute"
            }`}
          >
            {idx > i ? <Check size={15} /> : i + 1}
          </div>
          <p className={`mt-2 text-[11px] md:text-xs font-semibold text-center ${idx >= i ? "text-ink" : "text-mute"}`}>
            {l}
          </p>
        </div>
      ))}
    </div>
  )
}

const cellColor = (soc) =>
  soc < 20 ? "#F59E0B" : soc > 50 ? "#72D600" : soc < 35 ? "#E2B019" : "#A3C93A"

export function EVStudio({ soc, charging, fast, xray }) {
  const dur = fast ? 0.3 : 1.2
  const color = cellColor(soc)
  const cable = "M78 120 C 100 230, 170 230, 196 172"
  return (
    <svg viewBox="0 0 760 260" className="w-full h-auto" role="img" aria-label={`Battery ${Math.round(soc)}%`}>
      <rect x="0" y="236" width="760" height="4" rx="2" fill="#E2EBDA" />
      <rect x="30" y="60" width="56" height="84" rx="14" fill="#fff" stroke="#CBD5E1" strokeWidth="2" />
      <circle cx="58" cy="92" r="13" fill="none" stroke="#72D600" strokeWidth="4" />
      <path d="M60 84 L53 95 L58 95 L56 102 L63 90 L58 90 Z" fill="#0F172A" />
      <path d={cable} stroke="#D9EFC4" strokeWidth="6" fill="none" strokeLinecap="round" />
      {charging && (
        <path d={cable} stroke="#72D600" strokeWidth="6" fill="none" strokeLinecap="round" strokeDasharray="2 12" className="route-flow" style={{ animationDuration: `${dur}s` }} />
      )}
      <g transform="translate(110 0)">
        <g style={{ opacity: xray ? 0.15 : 1 }}>
          <path d="M50 192 L50 160 C50 146 58 138 74 134 L112 124 C128 96 150 78 190 74 L400 74 C440 76 468 96 500 128 L570 142 C590 146 598 156 598 172 L598 192 L520 192 A50 50 0 0 0 420 192 L220 192 A50 50 0 0 0 120 192 L50 192 Z" fill="#fff" stroke="#CBD5E1" strokeWidth="2.5" />
          <path d="M122 122 C138 98 158 86 190 84 L290 84 L290 122 Z" fill="#E3ECE6" />
          <path d="M304 84 L400 84 C430 86 452 102 478 122 L304 122 Z" fill="#E3ECE6" />
        </g>
        {[170, 470].map((cx) => (
          <g key={cx}>
            <circle cx={cx} cy="196" r="38" fill="#0F172A" />
            <circle cx={cx} cy="196" r="22" fill="#fff" />
            <circle cx={cx} cy="196" r="5" fill="#0F172A" />
          </g>
        ))}
        <g>
          {Array.from({ length: 24 }).map((_, i) => {
            const col = i % 12, row = Math.floor(i / 12)
            const x = 226 + col * 16, y = 146 + row * 16
            const lo = (i / 24) * 100, hi = ((i + 1) / 24) * 100
            const f = Math.max(0, Math.min(1, (soc - lo) / (hi - lo)))
            return (
              <g key={i}>
                <rect x={x} y={y} width="14" height="14" rx="3" fill="#EEF4EA" stroke="#D9EFC4" />
                <rect x={x} y={y + 14 - 14 * f} width="14" height={14 * f} rx="3" fill={color} />
              </g>
            )
          })}
        </g>
      </g>
    </svg>
  )
}

function useNow(ms) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}
const clock = (t) => new Date(t).toLocaleTimeString("en-IN", { timeStyle: "short" })

function ArrivalCard({ b, host, pending, onArrive }) {
  const { state, dispatch } = useStore()
  const now = useNow(1000)
  const hostKnown = hasLoc(host)
  const located = hostKnown && hasLoc(state.user)
  const left = located ? Math.max(0, (b.updatedAt || now) + etaMins(haversine(state.user, host)) * 60000 - now) : null
  const s = Math.round((left ?? 0) / 1000)
  return (
    <Card className="p-6 md:p-8 text-center">
      <p className="text-slate">{left != null ? "Estimated arrival" : `Head to ${host.name}`}</p>
      {left != null && (
        <p className="font-mono text-5xl font-bold tnum mt-1">
          {String(Math.floor(s / 60)).padStart(2, "0")}:{String(s % 60).padStart(2, "0")}
        </p>
      )}
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {hostKnown && (
          <Btn variant="secondary" icon={Navigation} onClick={() => window.open(gmaps(state.user, host), "_blank", "noopener")}>
            Go via Google Maps
          </Btn>
        )}
        <Btn variant="secondary" icon={MapPin} onClick={() => dispatch({ type: "TAB", role: "driver", tab: "find" })}>
          Show route
        </Btn>
        <Btn icon={Check} disabled={!!pending} onClick={onArrive}>
          {pending || "I've arrived"}
        </Btn>
      </div>
    </Card>
  )
}

function ChargingCard({ b, host, onSimulateStop, pending }) {
  const [xray, setXray] = useState(false)
  const now = useNow(5000)
  const since = b.updatedAt || b.createdAt || now
  const elapsedH = Math.max(0, (now - since) / 3.6e6)
  const kw = host.kw ? Math.min(host.kw, 7.2) : null
  const estKwh = kw ? Math.min(b.estimateKwh, round1(elapsedH * kw)) : null
  const share = estKwh != null && b.estimateKwh > 0 ? estKwh / b.estimateKwh : 0
  const estSoc = Math.round(b.startSoc + (b.targetSoc - b.startSoc) * share)
  const leftH = kw ? Math.max(0, b.estimateKwh / kw - elapsedH) : null
  const tiles = [
    ["Charging for", fmtHours(elapsedH), `since ${clock(since)}`],
    ["Battery (est.)", kw ? `≈ ${estSoc}%` : "—", `started ${b.startSoc}% · target ${b.targetSoc}%`],
    ["Energy (est.)", estKwh != null ? `≈ ${estKwh.toFixed(1)} kWh` : "—", kw ? `at ${kw} kW rated` : "charger power"],
    ["Time left", leftH == null ? "—" : leftH > 0 ? fmtHours(leftH) : "Any minute", `for ${(b.estimateKwh || 0).toFixed(1)} kWh`],
    ["Start meter", b.startKwh != null ? `${b.startKwh.toFixed(1)} kWh` : "—", "confirmed"],
  ]
  return (
    <Card className="p-5 md:p-6">
      <div className="rounded-3xl bg-mint p-3 md:p-6">
        <EVStudio soc={estSoc} charging xray={xray} />
      </div>
      <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-3">
        {tiles.map(([k, v, sub]) => (
          <div key={k} className="rounded-2xl border border-line p-3 min-w-0">
            <p className="text-xs text-slate">{k}</p>
            <p className="font-mono text-lg font-bold tnum truncate">{v}</p>
            <p className="text-[11px] text-mute font-mono truncate">{sub}</p>
          </div>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="rounded-2xl bg-mint px-4 py-2.5 text-xs md:text-sm font-semibold text-ink flex items-center gap-2 border border-line">
          <span className="h-2.5 w-2.5 rounded-full bg-parrot animate-pulse shrink-0" />
          <span>
            Charging active — Host (<strong>{host.name}</strong>) will stop charging &amp; unlock the end meter.
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {onSimulateStop && (
            <Btn icon={Check} disabled={!!pending} onClick={onSimulateStop}>
              {pending || "Simulate host stopping"}
            </Btn>
          )}
          <Btn variant={xray ? "primary" : "secondary"} icon={BatteryCharging} onClick={() => setXray((x) => !x)}>
            Battery X-Ray
          </Btn>
        </div>
      </div>
    </Card>
  )
}

function PayCard({ b, host, pending, onPaid }) {
  return (
    <Card className="p-4 md:p-5">
      <InvoiceCard b={b} host={host} flat />
      <p className="mt-4 text-sm text-slate">
        Pay {host.name} directly by UPI or cash, then confirm here to unlock your receipt, rating, and History Box.
      </p>
      <Btn className="mt-4 w-full" icon={Check} disabled={!!pending} onClick={onPaid}>
        {pending || `I've paid ₹${b.amount}`}
      </Btn>
    </Card>
  )
}

function ReceiptCard({ b, host, onCollapseToHistory, collapseLabel = "Save to History", doneLabel = "Done" }) {
  return (
    <div id="receipt" className="relative bg-white border border-line rounded-3xl p-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-parrot-ink">
          <Receipt size={18} />
          <span className="text-xs font-bold uppercase tracking-wider">Receipt + CO₂ estimate</span>
        </div>
        {onCollapseToHistory && (
          <button
            type="button"
            onClick={onCollapseToHistory}
            className="h-8 px-3 rounded-full bg-mint hover:bg-mint-2 text-xs font-display font-bold text-ink inline-flex items-center gap-1"
          >
            <History size={13} className="text-parrot-ink" /> {collapseLabel}
          </button>
        )}
      </div>

      <h3 className="mt-2 font-display text-2xl font-extrabold">Payment confirmed</h3>
      <p className="mt-1 text-sm text-slate">You marked ₹{b.amount} as paid to {host.name}.</p>
      <div className="mt-4">
        <InvoiceCard b={b} host={host} flat />
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-2 print:hidden">
        <Btn variant="secondary" icon={Download} className="!h-10 !text-sm" onClick={() => window.print()}>
          Download / Print
        </Btn>
        {b.ref && <CopyBtn text={b.ref} label="Copy reference" />}
      </div>
      <RateHost b={b} host={host} onDone={onCollapseToHistory} doneLabel={doneLabel} />
    </div>
  )
}

const DRIVER_REVIEW_TAGS = [
  "Fast Charging", "Safe Driveway", "Accurate Meter", "Friendly Host", "Free Chai", "Easy Parking",
]

function RateHost({ b, host, onDone, doneLabel = "Done" }) {
  const { state, dispatch } = useStore()
  const toast = useToast()
  const err = useErrorToast()

  const [stars, setStars] = useState(0)
  const [hover, setHover] = useState(0)
  const [selectedTags, setSelectedTags] = useState(["Accurate Meter", "Safe Driveway"])
  const [comment, setComment] = useState("")
  const [busy, setBusy] = useState(false)

  const doneDriver = b.driverReview || b.review
  const doneHost = b.hostReview
  const shown = doneDriver ? doneDriver.stars : hover || stars

  const toggleTag = (t) => {
    setSelectedTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))
  }

  const submit = async () => {
    if (!stars || busy) return
    const text = comment.trim().slice(0, 280)

    if (state.session.demo) {
      const n = Number.isFinite(host.reviews) ? host.reviews : 0
      const avg = n > 0 && Number.isFinite(host.rating) ? host.rating : stars
      const revObj = { stars, tags: selectedTags, comment: text, at: Date.now() }
      dispatch({ type: "DEMO_BOOK", booking: { ...b, review: revObj, driverReview: revObj } })
      dispatch({ type: "DEMO_HOST", id: host.id, patch: { rating: round1((avg * n + stars) / (n + 1)), reviews: n + 1 } })
      toast("Thanks for rating", `${host.name} · ${stars}★`)
      return
    }

    setBusy(true)
    try {
      await reviewBooking(b.id, stars, text, "driver", selectedTags, {
        hostId: host.id || b.hostId,
        driverName: state.session.name || b.driver || "Verified EV Driver",
      })
      await Promise.all([
        refresh("bookings"),
        refresh("hosts"),
        refresh(`reviews:host:${host.id || b.hostId}`),
      ])
      toast("Thanks for rating!", `${host.name} · ${stars}★ saved to your History`)
    } catch (e) {
      err("Couldn't save your rating", e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-6 border-t border-line pt-4 space-y-4 print:hidden">
      <div className="rounded-2xl bg-mint/60 border border-line p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-display font-bold text-ink">
            {doneDriver ? `Your Verified Review for ${host.name}` : `Rate Your Experience at ${host.name}`}
          </p>
          {doneDriver && (
            <span className="h-6 px-2 rounded-lg bg-parrot-ink text-white font-mono text-xs font-bold inline-flex items-center gap-1">
              {doneDriver.stars}.0 ★
            </span>
          )}
        </div>

        <div className="flex gap-1" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              disabled={Boolean(doneDriver) || busy}
              onMouseEnter={() => !doneDriver && setHover(n)}
              onClick={() => setStars(n)}
              className="h-10 w-10 grid place-items-center rounded-xl bg-white border border-line/70"
            >
              <Star size={22} className={n <= shown ? "text-amber" : "text-line"} fill={n <= shown ? "currentColor" : "none"} />
            </button>
          ))}
        </div>

        {doneDriver ? (
          <div className="space-y-2">
            {doneDriver.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {doneDriver.tags.map((t) => (
                  <span key={t} className="px-2 py-0.5 rounded-md bg-white text-[11px] font-semibold text-parrot-ink border border-line">
                    ✓ {t}
                  </span>
                ))}
              </div>
            )}
            {doneDriver.comment && (
              <p className="text-sm text-ink bg-white p-3 rounded-xl border border-line/60">“{doneDriver.comment}”</p>
            )}
          </div>
        ) : (
          stars > 0 && (
            <div className="space-y-3 pt-1">
              <div className="flex flex-wrap gap-1.5">
                {DRIVER_REVIEW_TAGS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleTag(t)}
                    className={`h-7 px-2.5 rounded-full text-xs font-display font-bold border ${
                      selectedTags.includes(t) ? "bg-parrot/25 border-parrot text-ink" : "bg-white border-line text-slate"
                    }`}
                  >
                    {selectedTags.includes(t) ? `✓ ${t}` : `+ ${t}`}
                  </button>
                ))}
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  maxLength={280}
                  placeholder="Share details on charging speed & hospitality..."
                  className="h-11 flex-1 rounded-xl border border-line bg-white px-3 text-sm outline-none focus:border-parrot"
                />
                <Btn className="!h-11 !text-sm" disabled={busy} onClick={submit}>
                  {busy ? "Saving…" : `Publish ${stars}★ Review`}
                </Btn>
              </div>
            </div>
          )
        )}
      </div>

      <div className="rounded-2xl bg-mint p-3.5 border border-line/70">
        <p className="text-xs font-bold uppercase tracking-wider text-parrot-ink flex items-center gap-1.5">
          <UserCheck size={14} /> Host's Review for You
        </p>
        {doneHost ? (
          <div className="mt-2 space-y-1">
            <span className="h-5 px-2 rounded-md bg-parrot-ink text-white font-mono text-xs font-bold inline-flex items-center">
              {doneHost.stars}.0 ★ by {doneHost.hostName || host.name}
            </span>
            {doneHost.comment && <p className="text-sm text-ink mt-1">“{doneHost.comment}”</p>}
          </div>
        ) : (
          <p className="mt-1 text-xs text-slate">
            Once <strong>{host.name}</strong> rates your visit from their Host portal, it will appear here.
          </p>
        )}
      </div>

      {onDone && (
        <Btn variant="secondary" icon={Check} className="w-full" onClick={onDone}>
          {doneLabel}
        </Btn>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// shared pieces (also used by the History tab)
// ---------------------------------------------------------------------------
export function MeterBill({ b, start, end, bill }) {
  return (
    <Card className="p-5 md:p-6">
      <div className="flex items-center gap-2 text-parrot-ink">
        <ShieldCheck size={18} />
        <span className="text-xs font-bold uppercase tracking-wider">Zero-Fight meter bill</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <LiveMeterTile label="START" reading={start} kwh={b.startKwh} bookingId={b.id} stage="start" />
        <LiveMeterTile label="END" reading={end} kwh={b.endKwh} bookingId={b.id} stage="end" />
      </div>
      {b.hasBill && (
        <>
          <p className="mt-4 font-mono text-sm md:text-base font-bold bg-mint rounded-xl px-4 py-3">
            {(b.endKwh ?? 0).toFixed(1)} − {(b.startKwh ?? 0).toFixed(1)} ={" "}
            <Num value={b.kwhUsed} decimals={1} /> kWh × ₹{b.rate} = <Num value={b.amount} prefix="₹" />
          </p>
          {bill && (
            <div className="mt-4 rounded-2xl overflow-hidden border border-line">
              <Img key={bill} srcs={[bill]} alt="Bill image" className="w-full aspect-[1200/630]" />
            </div>
          )}
        </>
      )}
    </Card>
  )
}

function ExpandedPaidSession({ b, host, demo, onCollapse }) {
  const { start, end } = useReadings(b.id)
  const bill = billFor(demo, b, start, end)
  const events = useTimeline(b.id)

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      className="overflow-hidden border-t border-line bg-mint/30"
    >
      <div className="p-5 md:p-6 grid lg:grid-cols-[1.3fr_1fr] gap-5 items-start">
        <div className="space-y-5">
          <MeterBill b={b} start={start} end={end} bill={bill} />
          <TripTimeline b={b} host={host} start={start} end={end} events={events} />
        </div>
        <ReceiptCard b={b} host={host} onCollapseToHistory={onCollapse} collapseLabel="Hide receipt" doneLabel="Close" />
      </div>
    </motion.div>
  )
}

export const sessionDate = (b) =>
  new Date(b.paidAt || b.updatedAt || b.createdAt || Date.now())

export function HistorySessionBox({ b, host, demo, expanded, onToggle }) {
  const kwh = b.kwhUsed || b.estimateKwh || 0
  const amt = b.amount || b.estimateAmount || 0
  const savedCo2 = co2(kwh)
  const driverRev = b.driverReview || b.review
  const dateStr = sessionDate(b).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })

  return (
    <Card className={`overflow-hidden transition-all ${expanded ? "!border-parrot ring-2 ring-parrot/25" : "hover:!border-parrot"}`}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={onToggle}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onToggle())}
        className="p-5 cursor-pointer select-none flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-mint/40 transition"
      >
        <div className="flex items-start gap-3.5 min-w-0">
          <div className="h-12 w-12 rounded-2xl btn-primary grid place-items-center shrink-0">
            <Check size={22} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="h-5 px-2.5 rounded-full bg-parrot/20 text-parrot-ink text-[11px] font-bold uppercase inline-flex items-center">
                Completed
              </span>
              {b.ref && <span className="font-mono text-xs text-slate">#{b.ref}</span>}
              {driverRev?.stars ? (
                <span className="h-5 px-2 rounded-md bg-amber/20 text-ink font-mono text-xs font-bold inline-flex items-center gap-1">
                  <Star size={11} fill="currentColor" className="text-amber" /> {driverRev.stars}.0
                </span>
              ) : (
                <span className="h-5 px-2 rounded-md bg-white border border-line text-slate text-[11px] font-bold inline-flex items-center">
                  Not rated
                </span>
              )}
            </div>
            <h3 className="mt-1 font-display text-lg font-extrabold text-ink truncate">{host.name}</h3>
            <p className="text-xs text-slate flex flex-wrap items-center gap-2 mt-0.5">
              <span className="inline-flex items-center gap-1 font-mono"><Clock size={12} /> {dateStr}</span>
              <span>· ₹{b.rate}/kWh</span>
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between md:justify-end gap-4 pt-3 md:pt-0 border-t md:border-t-0 border-line/60">
          <div className="flex items-center gap-3">
            <div className="px-3 py-1.5 rounded-xl bg-mint text-left">
              <p className="text-[10px] text-slate uppercase font-semibold">Energy</p>
              <p className="font-mono text-sm font-bold text-ink">{kwh.toFixed(1)} kWh</p>
            </div>
            <div className="px-3 py-1.5 rounded-xl bg-mint text-left">
              <p className="text-[10px] text-slate uppercase font-semibold">CO₂ Saved</p>
              <p className="font-mono text-sm font-bold text-parrot-ink">{savedCo2.toFixed(1)} kg</p>
            </div>
            <div className="text-right min-w-[70px]">
              <p className="text-[10px] text-slate uppercase font-semibold">Paid</p>
              <p className="font-mono text-2xl font-extrabold text-ink">₹{amt}</p>
            </div>
          </div>
          <div className="h-10 px-3 rounded-xl bg-mint text-xs font-display font-bold text-ink inline-flex items-center gap-1 shrink-0">
            <span className="hidden sm:inline">{expanded ? "Hide" : "Receipt"}</span>
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {expanded && <ExpandedPaidSession b={b} host={host} demo={demo} onCollapse={onToggle} />}
      </AnimatePresence>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// trip status + timeline (Ola / Uber style)
// ---------------------------------------------------------------------------
const STATUS_PILL = {
  requested: ["Waiting for host", "wait"],
  accepted: ["Head to the socket", "go"],
  startMeter: ["Start meter", "go"],
  charging: ["Charging", "live"],
  endMeter: ["End meter", "go"],
  awaitingPay: ["Payment due", "go"],
  disputed: ["Reading mismatch", "warn"],
  paid: ["Completed", "done"],
}

export function StatusPill({ status }) {
  const [label, tone] = STATUS_PILL[status] || [status, "go"]
  const cls = {
    wait: "bg-amber/20 text-ink",
    go: "bg-mint text-parrot-ink",
    live: "btn-primary",
    warn: "bg-amber/25 text-ink",
    done: "bg-parrot/20 text-parrot-ink",
  }[tone]
  return (
    <span className={`h-8 px-3 rounded-full text-xs font-display font-bold uppercase tracking-wider inline-flex items-center gap-2 ${cls}`}>
      {tone !== "done" && <span className={`h-2 w-2 rounded-full animate-pulse ${tone === "live" ? "bg-white" : tone === "go" ? "bg-parrot" : "bg-amber"}`} />}
      {label}
    </span>
  )
}

function eventAt(events, status) {
  let at = null
  for (const e of events) if (e.status === status && e.event === "status") at = e.at
  return at
}

export function TripTimeline({ b, host, start, end, events = [] }) {
  const idx = stageIdx(stepStatus(b))
  const disputed = b.status === "disputed"
  const steps = [
    { label: "Booking requested", sub: `Sent to ${host.name}`, reached: true, at: b.createdAt },
    { label: "Host accepted", sub: "Socket reserved for you", wait: `Waiting for ${host.name}…`, reached: idx >= 0, at: eventAt(events, "accepted") },
    { label: "Arrived at the socket", sub: "Checked in", wait: "Drive over and check in", reached: idx >= 1, at: eventAt(events, "startMeter") },
    {
      label: "Start meter verified",
      sub: b.startKwh != null ? `${b.startKwh.toFixed(1)} kWh on the meter` : "Photo confirmed by both",
      wait: disputed ? "Readings don't match — re-check together" : "Snap the meter, both confirm",
      reached: idx >= 2,
      at: eventAt(events, "charging") || (idx >= 2 ? start?.uploadedAt : null),
    },
    { label: "Charging", sub: "Host stopped the charge", wait: "Charging in progress", reached: idx >= 3, at: eventAt(events, "endMeter") },
    {
      label: "End meter verified",
      sub: b.hasBill ? `${(b.kwhUsed || 0).toFixed(1)} kWh used` : "Photo confirmed by both",
      wait: disputed ? "Readings don't match — re-check together" : "Snap the meter, both confirm",
      reached: idx >= 4,
      at: eventAt(events, "awaitingPay") || (idx >= 4 ? end?.uploadedAt : null),
    },
    {
      label: "Paid",
      sub: b.amount ? `₹${b.amount} to ${host.name}` : "Paid to host",
      wait: b.hasBill ? `Pay ₹${b.amount} by UPI or cash` : "Bill appears after the end meter",
      reached: idx >= 5,
      at: b.paidAt || eventAt(events, "paid"),
    },
  ]
  const current = steps.findIndex((s) => !s.reached)

  return (
    <Card className="p-5 md:p-6">
      <p className="text-xs font-bold uppercase tracking-wider text-slate">Trip timeline</p>
      <ol className="mt-4">
        {steps.map((s, i) => {
          const isNow = i === current
          const last = i === steps.length - 1
          return (
            <li key={s.label} className="relative flex gap-3 pb-4 last:pb-0">
              {!last && (
                <span className={`absolute left-[11px] top-6 bottom-0 w-0.5 ${s.reached ? "bg-parrot" : "bg-line"}`} />
              )}
              <span
                className={`relative z-10 h-6 w-6 rounded-full grid place-items-center shrink-0 ${
                  s.reached ? "btn-primary" : isNow ? "bg-white border-2 border-parrot" : "bg-white border-2 border-line"
                }`}
              >
                {s.reached ? <Check size={13} /> : isNow && <span className={`h-2 w-2 rounded-full animate-pulse ${disputed ? "bg-amber" : "bg-parrot"}`} />}
              </span>
              <div className="flex-1 min-w-0 -mt-0.5">
                <div className="flex items-baseline justify-between gap-2">
                  <p className={`text-sm font-display font-bold ${s.reached || isNow ? "text-ink" : "text-mute"}`}>{s.label}</p>
                  {s.reached && s.at ? (
                    <span className="font-mono text-[11px] text-slate shrink-0">{clock(s.at)}</span>
                  ) : isNow ? (
                    <span className="text-[11px] font-bold uppercase tracking-wider text-parrot-ink shrink-0">Now</span>
                  ) : null}
                </div>
                {(s.reached || isNow) && (
                  <p className={`text-xs mt-0.5 ${isNow && disputed ? "text-ink font-semibold" : "text-slate"}`}>
                    {s.reached ? s.sub : s.wait}
                  </p>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </Card>
  )
}

function TripSummary({ b, host, pending, onCancel }) {
  const { state } = useStore()
  const rows = [
    ["Battery", `${b.startSoc}% → ${b.targetSoc}%`],
    ["Energy", b.hasBill ? `${(b.kwhUsed || 0).toFixed(1)} kWh` : `≈ ${(b.estimateKwh || 0).toFixed(1)} kWh`],
    ["Rate", `₹${b.rate}/kWh`],
    [b.hasBill ? "Bill" : "Estimate", `₹${b.hasBill ? b.amount : b.estimateAmount}`],
  ]
  return (
    <Card className="p-5 md:p-6">
      <p className="text-xs font-bold uppercase tracking-wider text-slate">Booking details</p>
      <dl className="mt-3 divide-y divide-line">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between py-2.5 text-sm">
            <dt className="text-slate">{k}</dt>
            <dd className="font-mono font-bold text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        {hasLoc(host) && b.status !== "awaitingPay" && (
          <Btn variant="secondary" icon={Navigation} className="!h-10 !text-sm flex-1" onClick={() => window.open(gmaps(state.user, host), "_blank", "noopener")}>
            Directions
          </Btn>
        )}
        {b.status === "accepted" && (
          <Btn variant="secondary" icon={X} className="!h-10 !text-sm flex-1" disabled={!!pending} onClick={onCancel}>
            Cancel booking
          </Btn>
        )}
      </div>
      <p className="mt-3 text-[11px] text-mute font-mono break-all">Booking #{b.id}</p>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// trip complete (rating + receipt), then it moves to History
// ---------------------------------------------------------------------------
const CLOSED_KEY = "plughome:closed-trips"
const readClosed = () => {
  try {
    return JSON.parse(sessionStorage.getItem(CLOSED_KEY) || "[]")
  } catch {
    return []
  }
}
const closeTrip = (id) => {
  try {
    sessionStorage.setItem(CLOSED_KEY, JSON.stringify([...new Set([...readClosed(), id])]))
  } catch {}
}

function TripComplete({ b, host, demo, onFinish }) {
  const { dispatch } = useStore()
  const { start, end } = useReadings(b.id)
  const bill = billFor(demo, b, start, end)
  const kwh = b.kwhUsed || 0
  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 pb-28 space-y-5">
      <Card className="p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center gap-5">
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={SPRING.bouncy}
            className="h-16 w-16 rounded-3xl btn-primary grid place-items-center shrink-0"
          >
            <Check size={32} />
          </motion.div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate">Charge complete</p>
            <h2 className="font-display text-2xl md:text-3xl font-extrabold">₹{b.amount} paid to {host.name}</h2>
            <p className="text-sm text-slate mt-1">
              {kwh.toFixed(1)} kWh · {co2(kwh).toFixed(1)} kg CO₂ saved · rate your host to finish
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Btn variant="secondary" icon={History} onClick={onFinish}>View in History</Btn>
            <Btn icon={Zap} onClick={() => { onFinish(false); dispatch({ type: "TAB", role: "driver", tab: "find" }) }}>
              Book again
            </Btn>
          </div>
        </div>
        <div className="mt-6">
          <PhaseStepper idx={7} />
        </div>
      </Card>
      <div className="grid lg:grid-cols-[1fr_1.15fr] gap-5 items-start">
        <ReceiptCard b={b} host={host} onCollapseToHistory={onFinish} collapseLabel="Save to History" doneLabel="Done" />
        <MeterBill b={b} start={start} end={end} bill={bill} />
      </div>
    </div>
  )
}

function NoCharge({ last, host, historyCount }) {
  const { dispatch } = useStore()
  return (
    <div className="min-h-[70vh] grid place-items-center p-6 text-center">
      <div className="w-full max-w-md">
        <div className="mx-auto h-24 w-24 rounded-[2rem] bg-mint grid place-items-center">
          <Plug size={40} className="text-parrot-ink" />
        </div>
        <h2 className="mt-5 font-display text-2xl font-extrabold">No active charge</h2>
        <p className="text-slate mt-1">Pick a neighbour's socket and your live session appears here.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Btn icon={MapPin} onClick={() => dispatch({ type: "TAB", role: "driver", tab: "find" })}>
            Find a charger
          </Btn>
          {historyCount > 0 && (
            <Btn variant="secondary" icon={History} onClick={() => dispatch({ type: "TAB", role: "driver", tab: "history" })}>
              History ({historyCount})
            </Btn>
          )}
        </div>
        {last && (
          <Card className="mt-6 p-4 text-left">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-mint grid place-items-center text-parrot-ink shrink-0">
                <Receipt size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate">Last charge</p>
                <p className="font-display font-bold text-ink truncate">{host.name}</p>
                <p className="text-xs text-slate font-mono">
                  {sessionDate(last).toLocaleDateString("en-IN", { dateStyle: "medium" })} · {(last.kwhUsed || 0).toFixed(1)} kWh
                </p>
              </div>
              <p className="font-mono text-xl font-extrabold text-ink">₹{last.amount}</p>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// My Charge: one live trip from request to payment
// ---------------------------------------------------------------------------
export default function DriverCharge() {
  const { state, dispatch } = useStore()
  const toast = useToast()
  const err = useErrorToast()
  const demo = Boolean(state.session.demo)
  const uid = state.session.userId
  const { bookings, loading, error, refresh: retry } = useBookingList()
  const { hosts } = useHostList()

  const mine = bookings.filter((x) => x.driverId === uid)
  const activeBooking = mine.find((x) => ACTIVE_STATUSES.includes(x.status) || x.status === "disputed")
  const paidBookings = mine
    .filter((x) => x.status === "paid")
    .sort((a, z) => sessionDate(z) - sessionDate(a))

  // a just-paid trip stays here (receipt + rating) until the driver closes it
  const [justPaidId, setJustPaidId] = useState(null)
  const [closed, setClosed] = useState(readClosed)
  const now = Date.now()
  const completed = activeBooking
    ? null
    : paidBookings.find((x) => x.id === justPaidId) ||
      paidBookings.find(
        (x) =>
          !closed.includes(x.id) &&
          !(x.driverReview || x.review) &&
          now - sessionDate(x).getTime() < 2 * 3600000,
      )

  // keep showing the trip after it's rated, until the driver closes it
  useEffect(() => {
    if (completed && completed.id !== justPaidId) setJustPaidId(completed.id)
  }, [completed?.id])

  const { start, end } = useReadings(activeBooking?.id)
  const events = useTimeline(activeBooking?.id)
  const [pending, act] = useBookingAction(activeBooking, (e) => err("That didn't go through", e))

  const hostFor = (bookingItem) =>
    (bookingItem && hosts.find((h) => h.id === bookingItem.hostId)) || {
      id: bookingItem?.hostId,
      name: bookingItem?.hostName || "Host",
      socket: "",
    }

  if (completed) {
    const finish = (toHistory = true) => {
      closeTrip(completed.id)
      setClosed(readClosed())
      setJustPaidId(null)
      if (toHistory !== false) dispatch({ type: "TAB", role: "driver", tab: "history" })
    }
    return <TripComplete b={completed} host={hostFor(completed)} demo={demo} onFinish={finish} />
  }

  if (!activeBooking) {
    if (loading)
      return (
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 space-y-5">
          <div className="h-36 rounded-3xl skel shimmer" />
          <div className="h-72 rounded-3xl skel shimmer" />
        </div>
      )
    if (error && !bookings.length)
      return (
        <div className="min-h-[70vh] grid place-items-center p-6 text-center">
          <div>
            <h2 className="font-display text-2xl font-extrabold">Couldn't load your charge</h2>
            <Btn className="mt-5" onClick={retry}>Try again</Btn>
          </div>
        </div>
      )
    const last = paidBookings[0]
    return <NoCharge last={last} host={hostFor(last)} historyCount={mine.filter((x) => !ACTIVE_STATUSES.includes(x.status)).length} />
  }

  const b = activeBooking
  const host = hostFor(b)
  const status = stepStatus(b)
  const idx = stageIdx(status)
  const bill = billFor(demo, b, start, end)
  const demoNeedsHost = demo && b.hostOwnerId === DEMO_USERS.host.id
  const disputedEnd = b.status === "disputed" && b.disputeStage === "end"
  const cancel = () => act("Cancelling…", "cancel", () => toast("Booking cancelled", `${host.name} has been told.`))

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 pb-28 space-y-5">
      <TripHero b={b} host={host} start={start} />

      <div className="grid lg:grid-cols-[1.45fr_1fr] gap-5 items-start">
        <div className="space-y-5 min-w-0">
          {b.status === "requested" && (
            <Card className="p-6 md:p-8 text-center">
              <div className="mx-auto h-14 w-14 rounded-2xl bg-mint grid place-items-center text-parrot-ink">
                <Hourglass size={26} />
              </div>
              <h3 className="mt-4 font-display text-2xl font-extrabold">Waiting for {host.name} to accept</h3>
              <p className="mt-1 text-sm text-slate">You'll get a live update the moment they respond.</p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {demoNeedsHost && (
                  <Btn icon={Check} onClick={() => act("Accepting…", "accept", () => toast("Booking accepted", `${host.name} is ready.`))}>
                    Simulate host accepting
                  </Btn>
                )}
                <Btn variant="secondary" icon={X} disabled={!!pending} onClick={cancel}>
                  {pending || "Cancel request"}
                </Btn>
              </div>
            </Card>
          )}

          {b.status === "accepted" && (
            <ArrivalCard b={b} host={host} pending={pending} onArrive={() => act("Checking in…", "arrive")} />
          )}

          {b.status === "startMeter" && (
            <Card className="p-6 grid md:grid-cols-2 gap-6 items-center">
              <LiveMeterTile label="START" reading={start} bookingId={b.id} stage="start" />
              <div>
                <h3 className="font-display text-2xl font-extrabold">Capture the start meter</h3>
                <MeterCapture b={b} stage="start" reading={start} party="driver" />
              </div>
            </Card>
          )}

          {b.status === "disputed" && !disputedEnd && (
            <DisputePanel b={b} start={start} end={end} party="driver" />
          )}

          {b.status === "charging" && (
            <ChargingCard
              b={b}
              host={host}
              pending={pending}
              onSimulateStop={
                demoNeedsHost
                  ? () => act("Stopping charging…", "finish_charging", () => toast("Charging stopped by Host", "Confirm the end meter to get your bill."))
                  : null
              }
            />
          )}

          {b.status === "endMeter" && (
            <>
              <Card className="p-6">
                <h3 className="font-display text-xl font-extrabold">Confirm the end meter</h3>
                <p className="mt-1 text-sm text-slate">{host.name} stopped charging. Check the end reading — your bill is generated from it.</p>
                <MeterCapture b={b} stage="end" reading={end} party="driver" />
              </Card>
              <InvoiceCard b={b} host={host} />
            </>
          )}

          {disputedEnd && <DisputePanel b={b} start={start} end={end} party="driver" photos={false} />}

          {b.status === "awaitingPay" && (
            <PayCard
              b={b}
              host={host}
              pending={pending}
              onPaid={() => {
                const targetId = b.id
                act("Recording…", "mark_paid", () => {
                  setJustPaidId(targetId)
                  toast("Payment confirmed", "Rate your host to finish the trip.")
                })
              }}
            />
          )}

          {idx >= 3 && <MeterBill b={b} start={start} end={end} bill={bill} />}
        </div>

        <div className="space-y-5 min-w-0">
          <TripTimeline b={b} host={host} start={start} end={end} events={events} />
          <TripSummary b={b} host={host} pending={pending} onCancel={cancel} />
        </div>
      </div>
    </div>
  )
}
