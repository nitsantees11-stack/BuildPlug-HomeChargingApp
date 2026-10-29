// @ts-nocheck
import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  BatteryCharging,
  Check,
  Download,
  Hourglass,
  MapPin,
  Navigation,
  Plug,
  Receipt,
  ShieldCheck,
  Star,
  TreePine,
  UserCheck,
  X,
} from "lucide-react"
import {
  EASE,
  SPRING,
  co2,
  etaMins,
  fmtHours,
  gmaps,
  hasLoc,
  haversine,
  round1,
} from "../lib"
import { useStore, useToast } from "../store"
import { Btn, Card, CopyBtn, Img, Num } from "../ui"
import { DEMO_USERS } from "../demo"
import { ACTIVE_STATUSES, refresh, stepStatus } from "../lib/live"
import { reviewBooking } from "../lib/api"
import { supabase } from "../lib/supabase"
import {
  billFor,
  useBookingAction,
  useBookingList,
  useHostList,
  useReadings,
} from "../lib/data"
import { useErrorToast } from "../lib/errorToast"
import { DisputePanel, LiveMeterTile, MeterCapture } from "./LiveMeter"

const STAGES = ["Navigate", "Start meter", "Charging", "End meter", "Pay"]
const stageIdx = (s) =>
  ({
    requested: -1,
    accepted: 0,
    navigating: 0,
    startMeter: 1,
    charging: 2,
    endMeter: 3,
    awaitingPay: 4,
    paid: 5,
  })[s] ?? 0

export function Stepper({ status, labels = STAGES }) {
  const idx = stageIdx(status)
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
            {idx === i && (
              <motion.span
                className="absolute inset-0 rounded-full border-2 border-parrot"
                animate={{ scale: [1, 1.8], opacity: [0.6, 0] }}
                transition={{ duration: 1.6, repeat: Infinity }}
              />
            )}
          </div>
          <p
            className={`mt-2 text-[11px] md:text-xs font-semibold text-center ${
              idx >= i ? "text-ink" : "text-mute"
            }`}
          >
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
    <svg
      viewBox="0 0 760 260"
      className="w-full h-auto"
      role="img"
      aria-label={`Illustration: estimated battery ${Math.round(soc)}%`}
    >
      <rect x="0" y="236" width="760" height="4" rx="2" fill="#E2EBDA" />
      <rect
        x="30"
        y="60"
        width="56"
        height="84"
        rx="14"
        fill="#fff"
        stroke="#CBD5E1"
        strokeWidth="2"
      />
      <motion.circle
        cx="58"
        cy="92"
        r="13"
        fill="none"
        stroke="#72D600"
        strokeWidth="4"
        animate={{ opacity: [0.4, 1, 0.4] }}
        transition={{ duration: 1.6, repeat: Infinity }}
      />
      <path d="M60 84 L53 95 L58 95 L56 102 L63 90 L58 90 Z" fill="#0F172A" />
      <path
        d={cable}
        stroke="#D9EFC4"
        strokeWidth="6"
        fill="none"
        strokeLinecap="round"
      />
      {charging && (
        <g key={String(fast)}>
          <path
            d={cable}
            stroke="#72D600"
            strokeWidth="6"
            fill="none"
            strokeLinecap="round"
            strokeDasharray="2 12"
            className="route-flow"
            style={{ animationDuration: fast ? "0.25s" : "0.9s" }}
          />
          {[0, 1, 2, 3, 4].map((i) => (
            <circle
              key={i}
              r="4"
              fill="#B5F56B"
              style={{ filter: "drop-shadow(0 0 4px #72D600)" }}
            >
              <animateMotion
                dur={`${dur}s`}
                begin={`${(i * dur) / 5}s`}
                repeatCount="indefinite"
                path={cable}
              />
            </circle>
          ))}
        </g>
      )}
      <g transform="translate(110 0)">
        <motion.g
          animate={{ opacity: xray ? 0.15 : 1 }}
          transition={{ duration: 0.4 }}
        >
          <path
            d="M50 192 L50 160 C50 146 58 138 74 134 L112 124 C128 96 150 78 190 74 L400 74 C440 76 468 96 500 128 L570 142 C590 146 598 156 598 172 L598 192 L520 192 A50 50 0 0 0 420 192 L220 192 A50 50 0 0 0 120 192 L50 192 Z"
            fill="#fff"
            stroke="#CBD5E1"
            strokeWidth="2.5"
          />
          <path
            d="M122 122 C138 98 158 86 190 84 L290 84 L290 122 Z"
            fill="#E3ECE6"
          />
          <path
            d="M304 84 L400 84 C430 86 452 102 478 122 L304 122 Z"
            fill="#E3ECE6"
          />
          <path d="M297 128 L297 186" stroke="#E2E8F0" strokeWidth="2" />
          <rect x="560" y="150" width="30" height="8" rx="4" fill="#F1F5F9" />
        </motion.g>
        <circle
          cx="86"
          cy="172"
          r="6"
          fill={charging ? "#72D600" : "#CBD5E1"}
          stroke="#fff"
          strokeWidth="2"
        />
        {[170, 470].map((cx) => (
          <motion.g
            key={cx}
            animate={charging ? { rotate: 0 } : { rotate: 360 }}
            transition={
              charging
                ? { duration: 0.3 }
                : { duration: 6, repeat: Infinity, ease: "linear" }
            }
            style={{ originX: `${cx}px`, originY: "196px" }}
          >
            <circle cx={cx} cy="196" r="38" fill="#0F172A" />
            <circle cx={cx} cy="196" r="22" fill="#fff" />
            {[0, 72, 144, 216, 288].map((a) => (
              <rect
                key={a}
                x={cx - 2}
                y="178"
                width="4"
                height="14"
                rx="2"
                fill="#CBD5E1"
                transform={`rotate(${a} ${cx} 196)`}
              />
            ))}
            <circle cx={cx} cy="196" r="5" fill="#0F172A" />
          </motion.g>
        ))}
        <motion.g
          animate={{ scale: xray ? 1.6 : 1 }}
          transition={SPRING.soft}
          style={{
            originX: "320px",
            originY: "161px",
            filter: xray ? "drop-shadow(0 0 10px rgba(114,214,0,.5))" : "none",
          }}
        >
          {Array.from({ length: 24 }).map((_, i) => {
            const col = i % 12,
              row = Math.floor(i / 12)
            const x = 226 + col * 16,
              y = 146 + row * 16
            const lo = (i / 24) * 100,
              hi = ((i + 1) / 24) * 100
            const f = Math.max(0, Math.min(1, (soc - lo) / (hi - lo)))
            return (
              <g key={i}>
                <rect
                  x={x}
                  y={y}
                  width="14"
                  height="14"
                  rx="3"
                  fill="#EEF4EA"
                  stroke="#D9EFC4"
                />
                <rect
                  x={x}
                  y={y + 14 - 14 * f}
                  width="14"
                  height={14 * f}
                  rx="3"
                  fill={color}
                  style={{ transition: "y .6s, height .6s, fill .5s" }}
                />
              </g>
            )
          })}
          <motion.rect
            y="146"
            width="18"
            height="30"
            fill="white"
            opacity="0.25"
            initial={{ x: 226 }}
            animate={{ x: [226, 400] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "linear" }}
          />
        </motion.g>
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
const clock = (t) =>
  new Date(t).toLocaleTimeString("en-IN", { timeStyle: "short" })

function ArrivalCard({ b, host, pending, onArrive }) {
  const { state, dispatch } = useStore()
  const now = useNow(1000)
  const hostKnown = hasLoc(host)
  const located = hostKnown && hasLoc(state.user)
  const left = located
    ? Math.max(
        0,
        (b.updatedAt || now) +
          etaMins(haversine(state.user, host)) * 60000 -
          now,
      )
    : null
  const s = Math.round((left ?? 0) / 1000)
  return (
    <Card className="p-6 md:p-8 text-center">
      <p className="text-slate">
        {left != null ? "Estimated arrival" : `Head to ${host.name}`}
      </p>
      {left != null && (
        <p className="font-mono text-5xl font-bold tnum mt-1">
          {String(Math.floor(s / 60)).padStart(2, "0")}:
          {String(s % 60).padStart(2, "0")}
        </p>
      )}
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {hostKnown && (
          <Btn
            variant="secondary"
            icon={Navigation}
            onClick={() =>
              window.open(gmaps(state.user, host), "_blank", "noopener")
            }
          >
            Go via Google Maps
          </Btn>
        )}
        <Btn
          variant="secondary"
          icon={MapPin}
          onClick={() => dispatch({ type: "TAB", role: "driver", tab: "find" })}
        >
          Show route
        </Btn>
        <Btn icon={Check} disabled={!!pending} onClick={onArrive}>
          {pending || "I've arrived"}
        </Btn>
      </div>
    </Card>
  )
}

function ChargingCard({ b, host }) {
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
    [
      "Battery (est.)",
      kw ? `≈ ${estSoc}%` : "—",
      `started ${b.startSoc}% · target ${b.targetSoc}%`,
    ],
    [
      "Energy (est.)",
      estKwh != null ? `≈ ${estKwh.toFixed(1)} kWh` : "—",
      kw ? `at ${kw} kW rated` : "charger power unknown",
    ],
    [
      "Time left (est.)",
      leftH == null ? "—" : leftH > 0 ? fmtHours(leftH) : "Any minute",
      `for ${(b.estimateKwh || 0).toFixed(1)} kWh`,
    ],
    [
      "Start meter",
      b.startKwh != null ? `${b.startKwh.toFixed(1)} kWh` : "—",
      "confirmed by both of you",
    ],
  ]
  return (
    <Card className="p-5 md:p-6">
      <div className="rounded-3xl bg-mint p-3 md:p-6">
        <EVStudio soc={estSoc} charging xray={xray} />
      </div>
      <div className="mt-5 grid grid-cols-2 lg:grid-cols-5 gap-3">
        {tiles.map(([k, v, sub]) => (
          <div key={k} className="rounded-2xl border border-line p-3 min-w-0">
            <p className="text-xs text-slate">{k}</p>
            <p className="font-mono text-lg md:text-xl font-bold tnum truncate">
              {v}
            </p>
            <p className="text-[11px] text-mute font-mono truncate" title={sub}>
              {sub}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="rounded-2xl bg-mint px-4 py-2.5 text-xs md:text-sm font-semibold text-ink flex items-center gap-2 border border-line">
          <span className="h-2.5 w-2.5 rounded-full bg-parrot animate-pulse shrink-0" />
          <span>
            Charging active — Host (<strong>{host.name}</strong>) will stop
            charging &amp; unlock the end meter.
          </span>
        </div>
        <Btn
          variant={xray ? "primary" : "secondary"}
          icon={BatteryCharging}
          onClick={() => setXray((x) => !x)}
        >
          Battery X-Ray
        </Btn>
      </div>
    </Card>
  )
}

function PayCard({ b, host, pending, onPaid }) {
  return (
    <Card className="p-6">
      <p className="text-slate text-sm">Total payable to {host.name}</p>
      <Num value={b.amount} prefix="₹" className="text-5xl font-bold" />
      <p className="mt-3 text-sm text-slate">
        {b.demoHost
          ? "This is a sample host, so there's nobody to pay — confirming just completes the trial."
          : `Pay ${host.name} directly by UPI or cash, then confirm here. PLUG-HOME records your confirmation and shows it to the host instantly.`}
      </p>
      <Btn
        className="mt-5 w-full"
        icon={Check}
        disabled={!!pending}
        onClick={onPaid}
      >
        {pending || (b.demoHost ? "Complete trial" : `I've paid ₹${b.amount}`)}
      </Btn>
    </Card>
  )
}

function ReceiptCard({ b, host }) {
  const co = co2(b.kwhUsed)
  return (
    <motion.div
      id="receipt"
      initial={{ scaleY: 0, opacity: 0 }}
      animate={{ scaleY: 1, opacity: 1 }}
      transition={{ duration: 0.7, ease: EASE.out }}
      style={{ transformOrigin: "top" }}
      className="relative bg-white border border-line rounded-t-3xl p-6 pb-10"
    >
      <div className="flex items-center gap-2 text-parrot-ink">
        <Receipt size={18} />
        <span className="text-xs font-bold uppercase tracking-wider">
          Receipt + CO₂ estimate
        </span>
      </div>
      <h3 className="mt-2 font-display text-2xl font-extrabold">
        {b.demoHost ? "Trial complete" : "Payment confirmed"}
      </h3>
      <p className="mt-1 text-sm text-slate">
        {b.demoHost
          ? "Charged with a sample host — no money changed hands."
          : `You marked ₹${b.amount} as paid to ${host.name} directly.`}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
        {[
          [
            "Units (metered)",
            <Num value={b.kwhUsed} decimals={1} suffix=" kWh" />,
          ],
          ["Amount", <Num value={b.amount} prefix="₹" />],
          [
            "PLUG-HOME ref",
            <span className="font-mono break-all">{b.ref || "—"}</span>,
          ],
          [
            "Date",
            <span className="font-mono">
              {b.paidAt
                ? new Date(b.paidAt).toLocaleString("en-IN", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })
                : "—"}
            </span>,
          ],
          ["CO₂ saved (est.)", <Num value={co} decimals={1} suffix=" kg" />],
          [
            "Equivalent",
            <span className="font-mono">
              ≈ {(co / 21).toFixed(1)} tree-years
            </span>,
          ],
        ].map(([k, v]) => (
          <div key={k}>
            <p className="text-slate text-xs">{k}</p>
            <p className="font-semibold text-base">{v}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-mute flex items-center gap-1">
        <TreePine size={12} />
        Approximate: CO₂ = kWh × 0.8 kg vs petrol · 21 kg CO₂ per tree per year
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-2 print:hidden">
        <Btn
          variant="secondary"
          icon={Download}
          className="!h-10 !text-sm"
          onClick={() => window.print()}
        >
          Download / Print
        </Btn>
        {b.ref && <CopyBtn text={b.ref} label="Copy reference" />}
      </div>
      <RateHost b={b} host={host} />
    </motion.div>
  )
}

function RateHost({ b, host }) {
  const { state, dispatch } = useStore()
  const toast = useToast()
  const err = useErrorToast()

  const [stars, setStars] = useState(0)
  const [hover, setHover] = useState(0)
  const [comment, setComment] = useState("")
  const [busy, setBusy] = useState(false)

  const [rlsReviews, setRlsReviews] = useState({
    driver: null,
    host: null,
  })

  useEffect(() => {
    if (state.session.demo || !supabase || !b?.id) return
    let active = true

    const fetchBookingRlsReviews = async () => {
      const { data } = await supabase
        .from("reviews")
        .select("*")
        .eq("booking_id", b.id)
      if (!active || !Array.isArray(data)) return
      const d = data.find((r) => r.by_role === "driver")
      const h = data.find((r) => r.by_role === "host")
      setRlsReviews({
        driver: d
          ? { stars: d.stars, comment: d.comment, at: d.created_at }
          : null,
        host: h
          ? {
              stars: h.stars,
              comment: h.comment,
              reviewerName: h.reviewer_name,
              at: h.created_at,
            }
          : null,
      })
    }

    fetchBookingRlsReviews()

    const ch = supabase
      .channel(`booking-reviews-${b.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "reviews",
          filter: `booking_id=eq.${b.id}`,
        },
        () => fetchBookingRlsReviews(),
      )
      .subscribe()

    return () => {
      active = false
      supabase.removeChannel(ch)
    }
  }, [b?.id, state.session.demo])

  if (b.demoHost && !state.session.demo) return null

  const doneDriver = b.driverReview || b.review || rlsReviews.driver
  const doneHost = b.hostReview || rlsReviews.host
  const shown = doneDriver ? doneDriver.stars : hover || stars

  const submit = async () => {
    if (!stars || busy) return
    const text = comment.trim().slice(0, 280)

    if (state.session.demo) {
      const n = Number.isFinite(host.reviews) ? host.reviews : 0
      const avg = n > 0 && Number.isFinite(host.rating) ? host.rating : stars
      dispatch({
        type: "DEMO_BOOK",
        booking: {
          ...b,
          review: { stars, comment: text, at: Date.now() },
          driverReview: { stars, comment: text, at: Date.now() },
        },
      })
      dispatch({
        type: "DEMO_HOST",
        id: host.id,
        patch: {
          rating: round1((avg * n + stars) / (n + 1)),
          reviews: n + 1,
        },
      })
      return toast("Thanks for rating", `${host.name} · ${stars}★ (judge demo)`)
    }

    setBusy(true)
    try {
      if (supabase && state.session.userId) {
        await supabase.from("reviews").upsert(
          {
            booking_id: b.id,
            host_id: host.id || b.hostId,
            driver_id: state.session.userId,
            host_owner_id: b.hostOwnerId || null,
            reviewer_id: state.session.userId,
            reviewer_name: state.session.name || "Driver",
            by_role: "driver",
            stars,
            comment: text,
          },
          { onConflict: "booking_id,by_role" },
        )
      }
      await reviewBooking(b.id, stars, text, "driver")
      await Promise.all([
        refresh("bookings"),
        refresh("hosts"),
        refresh(`reviews:host:${host.id || b.hostId}`),
      ])
      toast("Thanks for rating", `${host.name} · ${stars}★`)
    } catch (e) {
      err("Couldn't save your rating", e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-6 border-t border-line pt-4 space-y-4 print:hidden">
      <div>
        <p className="text-sm font-semibold">
          {doneDriver
            ? `Your rating for ${host.name}`
            : `How was charging at ${host.name}?`}
        </p>
        <div
          className="mt-2 flex gap-1"
          role="radiogroup"
          aria-label="Rating"
          onMouseLeave={() => setHover(0)}
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={shown === n}
              disabled={Boolean(doneDriver) || busy}
              onMouseEnter={() => !doneDriver && setHover(n)}
              onClick={() => setStars(n)}
              className="h-10 w-10 grid place-items-center rounded-xl hover:bg-mint disabled:hover:bg-transparent transition"
            >
              <Star
                size={24}
                className={n <= shown ? "text-amber" : "text-line"}
                fill={n <= shown ? "currentColor" : "none"}
              />
            </button>
          ))}
        </div>
        {doneDriver ? (
          doneDriver.comment && (
            <p className="mt-2 text-sm text-slate">“{doneDriver.comment}”</p>
          )
        ) : (
          stars > 0 && (
            <div className="mt-3 flex flex-col sm:flex-row gap-2">
              <input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                maxLength={280}
                placeholder="Add a review for other drivers (optional)"
                className="h-11 flex-1 rounded-xl border border-line bg-white px-3 text-sm outline-none focus:border-parrot"
              />
              <Btn className="!h-11 !text-sm" disabled={busy} onClick={submit}>
                {busy ? "Saving…" : "Submit rating"}
              </Btn>
            </div>
          )
        )}
      </div>

      <div className="rounded-2xl bg-mint p-3.5 border border-line/70">
        <p className="text-xs font-bold uppercase tracking-wider text-parrot-ink flex items-center gap-1.5">
          <UserCheck size={14} /> Host's Review for You (Real-Time)
        </p>
        {doneHost ? (
          <div className="mt-2 space-y-1">
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <Star
                  key={n}
                  size={15}
                  className={n <= doneHost.stars ? "text-amber" : "text-line"}
                  fill={n <= doneHost.stars ? "currentColor" : "none"}
                />
              ))}
              <span className="ml-1.5 font-mono text-xs font-bold text-ink">
                {doneHost.stars}★ by {host.name}
              </span>
            </div>
            {doneHost.comment && (
              <p className="text-sm text-ink">“{doneHost.comment}”</p>
            )}
          </div>
        ) : (
          <p className="mt-1 text-xs text-slate">
            When <strong>{host.name}</strong> rates your session from their Host
            portal, their star rating and review will appear here in real time.
          </p>
        )}
      </div>
    </div>
  )
}

function NoCharge() {
  const { dispatch } = useStore()
  return (
    <div className="min-h-[70vh] grid place-items-center p-6 text-center">
      <div>
        <motion.div
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 2.4, repeat: Infinity }}
          className="mx-auto h-24 w-24 rounded-[2rem] bg-mint grid place-items-center"
        >
          <Plug size={40} className="text-parrot-ink" />
        </motion.div>
        <h2 className="mt-5 font-display text-2xl font-extrabold">
          No active charge yet
        </h2>
        <p className="text-slate mt-1">
          Pick a neighbour's socket and your live session appears here.
        </p>
        <Btn
          className="mt-5"
          icon={MapPin}
          onClick={() => dispatch({ type: "TAB", role: "driver", tab: "find" })}
        >
          Find a charger
        </Btn>
      </div>
    </div>
  )
}

export default function DriverCharge() {
  const { state, dispatch } = useStore()
  const toast = useToast()
  const err = useErrorToast()
  const demo = Boolean(state.session.demo)
  const uid = state.session.userId
  const { bookings, loading, error, refresh: retry } = useBookingList()
  const { hosts } = useHostList()
  const mine = bookings.filter((x) => x.driverId === uid)
  const b =
    mine.find(
      (x) => ACTIVE_STATUSES.includes(x.status) || x.status === "disputed",
    ) || (mine[0]?.status === "paid" ? mine[0] : null)
  const { start, end } = useReadings(b?.id)
  const [pending, act] = useBookingAction(b, (e) =>
    err("That didn't go through", e),
  )
  const host = (b && hosts.find((h) => h.id === b.hostId)) || {
    name: b?.hostName || "Host",
    socket: "",
  }

  if (!b) {
    if (loading)
      return (
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 space-y-5">
          <div className="h-36 rounded-3xl skel shimmer" />
          <div className="h-72 rounded-3xl skel shimmer" />
        </div>
      )
    if (error)
      return (
        <div className="min-h-[70vh] grid place-items-center p-6 text-center">
          <div>
            <h2 className="font-display text-2xl font-extrabold">
              Couldn't load your charge
            </h2>
            <p className="text-slate mt-1">
              {error.message || "The server is unavailable right now."}
            </p>
            <Btn className="mt-5" onClick={retry}>
              Try again
            </Btn>
          </div>
        </div>
      )
    return <NoCharge />
  }
  const status = stepStatus(b)
  const idx = stageIdx(status)
  const bill = billFor(demo, b, start, end)
  const demoNeedsHost = demo && b.hostOwnerId === DEMO_USERS.host.id

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 pb-28 space-y-5">
      <Card className="p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate">
              {demo
                ? "Judge demo · simulated session"
                : b.demoHost
                  ? "Trial session · sample host"
                  : "Live session"}
            </p>
            <h2 className="font-display text-xl font-extrabold">{host.name}</h2>
          </div>
          <span className="h-8 px-3 rounded-full bg-mint text-sm font-mono font-bold inline-flex items-center">
            ₹{b.rate}/kWh{host.socket ? ` · ${host.socket}` : ""}
          </span>
        </div>
        <Stepper status={status} />
      </Card>

      <AnimatePresence mode="wait">
        <motion.div
          key={idx >= 3 ? "bill" : b.status}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.35, ease: EASE.out }}
        >
          {b.status === "requested" && (
            <Card className="p-6 md:p-8 text-center">
              <motion.div
                animate={{ rotate: [0, 180, 180, 360] }}
                transition={{ duration: 2.4, repeat: Infinity }}
                className="mx-auto h-14 w-14 rounded-2xl bg-mint grid place-items-center text-parrot-ink"
              >
                <Hourglass size={26} />
              </motion.div>
              <h3 className="mt-4 font-display text-2xl font-extrabold">
                Waiting for {host.name} to accept
              </h3>
              <p className="text-slate mt-1">
                Request sent ·{" "}
                <span className="font-mono">
                  {b.startSoc}% → {b.targetSoc}%
                </span>{" "}
                · ≈ <span className="font-mono">₹{b.estimateAmount}</span>{" "}
                estimate
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {demoNeedsHost && (
                  <Btn
                    icon={Check}
                    onClick={() =>
                      act("Accepting…", "accept", () =>
                        toast(
                          "Booking accepted",
                          `${host.name} is ready — head over.`,
                        ),
                      )
                    }
                  >
                    Simulate host accepting
                  </Btn>
                )}
                <Btn
                  variant="secondary"
                  icon={MapPin}
                  onClick={() =>
                    dispatch({ type: "TAB", role: "driver", tab: "find" })
                  }
                >
                  Show route
                </Btn>
                <Btn
                  variant="secondary"
                  icon={X}
                  disabled={!!pending}
                  onClick={() =>
                    act("Cancelling…", "cancel", () =>
                      toast("Request cancelled", "No charge was made.", {
                        tone: "warn",
                      }),
                    )
                  }
                >
                  {pending || "Cancel request"}
                </Btn>
              </div>
            </Card>
          )}
          {b.status === "accepted" && (
            <ArrivalCard
              b={b}
              host={host}
              pending={pending}
              onArrive={() =>
                act("Checking in…", "arrive", () =>
                  demo
                    ? toast(
                        "You've arrived",
                        "Capture the start meter to begin charging.",
                      )
                    : null,
                )
              }
            />
          )}
          {b.status === "startMeter" && (
            <Card className="p-6 grid md:grid-cols-2 gap-6 items-center">
              <LiveMeterTile
                label="START"
                reading={start}
                bookingId={b.id}
                stage="start"
              />
              <div>
                <h3 className="font-display text-2xl font-extrabold">
                  Capture the start meter
                </h3>
                <MeterCapture
                  b={b}
                  stage="start"
                  reading={start}
                  party="driver"
                />
              </div>
            </Card>
          )}
          {b.status === "disputed" && b.disputeStage !== "end" && (
            <DisputePanel b={b} start={start} end={end} party="driver" />
          )}
          {b.status === "charging" && <ChargingCard b={b} host={host} />}
          {idx >= 3 && (
            <div className="grid lg:grid-cols-[1.3fr_1fr] gap-5 items-start">
              <Card className="p-5 md:p-6">
                <div className="flex items-center gap-2 text-parrot-ink">
                  <ShieldCheck size={18} />
                  <span className="text-xs font-bold uppercase tracking-wider">
                    Zero-Fight meter bill
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
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
                </div>
                {b.hasBill ? (
                  <>
                    <p className="mt-4 font-mono text-sm md:text-base font-bold bg-mint rounded-xl px-4 py-3">
                      {(b.endKwh ?? 0).toFixed(1)} −{" "}
                      {(b.startKwh ?? 0).toFixed(1)} ={" "}
                      <Num value={b.kwhUsed} decimals={1} /> kWh × ₹{b.rate} ={" "}
                      <Num value={b.amount} prefix="₹" />
                    </p>
                    {bill && (
                      <div className="mt-4 rounded-2xl overflow-hidden border border-line">
                        <Img
                          key={bill}
                          srcs={[bill]}
                          alt="Bill image"
                          className="w-full aspect-[1200/630]"
                        />
                      </div>
                    )}
                  </>
                ) : (
                  <p className="mt-4 text-sm text-slate bg-mint rounded-xl px-4 py-3">
                    Confirm the end reading to calculate the bill.
                  </p>
                )}
              </Card>
              <div className="space-y-4">
                {b.status === "endMeter" && (
                  <Card className="p-6">
                    <h3 className="font-display text-xl font-extrabold">
                      Capture the end meter
                    </h3>
                    <MeterCapture
                      b={b}
                      stage="end"
                      reading={end}
                      party="driver"
                    />
                  </Card>
                )}
                {b.status === "disputed" && (
                  <DisputePanel
                    b={b}
                    start={start}
                    end={end}
                    party="driver"
                    photos={false}
                  />
                )}
                {b.status === "awaitingPay" && (
                  <PayCard
                    b={b}
                    host={host}
                    pending={pending}
                    onPaid={() =>
                      act("Recording…", "mark_paid", () =>
                        toast(
                          b.demoHost ? "Trial complete" : "Payment recorded",
                          b.demoHost
                            ? "Thanks for trying PLUG-HOME."
                            : `${host.name} can see it now.`,
                        ),
                      )
                    }
                  />
                )}
                {b.status === "paid" && <ReceiptCard b={b} host={host} />}
                {b.status === "paid" && (
                  <Btn
                    variant="secondary"
                    className="w-full"
                    icon={MapPin}
                    onClick={() =>
                      dispatch({ type: "TAB", role: "driver", tab: "find" })
                    }
                  >
                    Find another charger
                  </Btn>
                )}
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
