// @ts-nocheck
// Ola / Uber-style trip presentation shared by My Charge, the floating trip
// sheet and History: the seven driver phases, the animated status hero, the
// phase stepper and the Zomato-style invoice. Presentation only: every number
// comes from the booking (the server's bill), nothing is recalculated here.
import { AnimatePresence, motion } from "framer-motion"
import {
  BatteryCharging,
  Camera,
  Check,
  ChevronRight,
  IndianRupee,
  Leaf,
  MapPin,
  Navigation,
  Receipt,
  Search,
  TreePine,
  Wallet,
} from "lucide-react"
import { EASE, SPRING, co2 } from "../lib"
import { useStore } from "../store"
import { Avatar, Card } from "../ui"
import { ACTIVE_STATUSES } from "../lib/live"
import { useBookingList, useHostList, useReadings } from "../lib/data"

export const PHASES = [
  {
    key: "searching",
    label: "Searching for host",
    short: "Searching",
    icon: Search,
    sub: (h) => `Asking ${h.name} to accept — you'll see it the moment they do`,
  },
  {
    key: "navigating",
    label: "Host accepted · navigating",
    short: "Navigating",
    icon: Navigation,
    sub: (h) => `Head to ${h.name} and check in when you reach the socket`,
  },
  {
    key: "arrived",
    label: "Arrived at location",
    short: "Arrived",
    icon: MapPin,
    sub: () => "Snap the start meter photo to begin the session",
  },
  {
    key: "startMeter",
    label: "Start meter verification",
    short: "Start meter",
    icon: Camera,
    sub: () => "You and the host both confirm the same reading",
  },
  {
    key: "charging",
    label: "Charging in progress",
    short: "Charging",
    icon: BatteryCharging,
    sub: (h) => `Charging active — ${h.name} will stop the session`,
  },
  {
    key: "endMeter",
    label: "End meter & bill generation",
    short: "End meter",
    icon: Receipt,
    sub: () => "Confirm the end reading — the bill is built from both photos",
  },
  {
    key: "payment",
    label: "Payment",
    short: "Payment",
    icon: Wallet,
    sub: (h) => `Pay ${h.name} by UPI or cash, then confirm here`,
  },
]
const SUCCESS = {
  key: "success",
  label: "Payment successful",
  short: "Paid",
  icon: Check,
  sub: (h) => `Charge complete at ${h.name}`,
}

const hasPhoto = (r) => Boolean(r && (r.publicId || r.localUrl || r.photoUrl))

// index into PHASES; 7 = paid (all done)
export function phaseOf(b, start) {
  switch (b?.status) {
    case "requested":
      return 0
    case "accepted":
      return 1
    case "startMeter":
      return hasPhoto(start) ? 3 : 2
    case "disputed":
      return b.disputeStage === "end" ? 5 : 3
    case "charging":
      return 4
    case "endMeter":
      return 5
    case "awaitingPay":
      return 6
    case "paid":
      return 7
    default:
      return 0
  }
}
export const phaseInfo = (i) => PHASES[i] || SUCCESS

export function PhaseStepper({ idx }) {
  return (
    <div>
      <div className="flex items-center">
        {PHASES.map((p, i) => {
          const done = idx > i
          const now = idx === i
          return (
            <div
              key={p.key}
              className={`flex items-center ${i ? "flex-1" : ""}`}
            >
              {i > 0 && (
                <div className="flex-1 h-1 mx-1 rounded-full bg-mint-2 overflow-hidden">
                  <motion.div
                    className="h-full bg-parrot"
                    initial={false}
                    animate={{ width: idx >= i ? "100%" : "0%" }}
                    transition={{ duration: 0.6, ease: EASE.inOut }}
                  />
                </div>
              )}
              <div className="relative">
                {now && (
                  <motion.span
                    className="absolute inset-0 rounded-full bg-parrot/40"
                    animate={{ scale: [1, 1.7], opacity: [0.6, 0] }}
                    transition={{
                      duration: 1.4,
                      repeat: Infinity,
                      ease: "easeOut",
                    }}
                  />
                )}
                <div
                  title={p.label}
                  className={`relative h-7 w-7 rounded-full grid place-items-center text-[11px] font-mono font-bold ${
                    done
                      ? "btn-primary"
                      : now
                        ? "bg-white border-2 border-parrot text-ink"
                        : "bg-white border-2 border-line text-mute"
                  }`}
                >
                  {done ? <Check size={14} /> : i + 1}
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-2 hidden sm:flex justify-between">
        {PHASES.map((p, i) => (
          <p
            key={p.key}
            className={`w-16 -mx-4 first:mx-0 first:text-left last:mx-0 last:text-right text-center text-[11px] font-semibold ${
              idx >= i ? "text-ink" : "text-mute"
            }`}
          >
            {p.short}
          </p>
        ))}
      </div>
    </div>
  )
}

function PhaseIcon({ phase, big }) {
  const Icon = phase.icon
  const size = big ? "h-16 w-16 rounded-3xl" : "h-11 w-11 rounded-2xl"
  const searching = phase.key === "searching"
  const live = phase.key === "charging"
  return (
    <div className={`relative ${size} shrink-0`}>
      {(searching || live) &&
        [0, 1].map((k) => (
          <motion.span
            key={k}
            className={`absolute inset-0 ${
              big ? "rounded-3xl" : "rounded-2xl"
            } ${searching ? "bg-amber/40" : "bg-parrot/40"}`}
            animate={{ scale: [1, 1.8], opacity: [0.5, 0] }}
            transition={{
              duration: 1.8,
              repeat: Infinity,
              delay: k * 0.9,
              ease: "easeOut",
            }}
          />
        ))}
      <motion.div
        initial={{ scale: 0.5, rotate: -12, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={SPRING.bouncy}
        className={`relative ${size} grid place-items-center ${
          phase.key === "success" || live
            ? "btn-primary"
            : searching
              ? "bg-amber/20 text-ink"
              : "bg-mint text-parrot-ink"
        }`}
      >
        <motion.span
          animate={
            searching
              ? { rotate: [0, 18, -18, 0] }
              : live
                ? { scale: [1, 1.12, 1] }
                : {}
          }
          transition={{
            duration: 1.6,
            repeat: searching || live ? Infinity : 0,
          }}
          className="grid place-items-center"
        >
          <Icon size={big ? 30 : 20} />
        </motion.span>
      </motion.div>
    </div>
  )
}

// big animated status card at the top of My Charge
export function TripHero({ b, host, start }) {
  const idx = phaseOf(b, start)
  const phase = phaseInfo(idx)
  const disputed = b.status === "disputed"
  return (
    <Card className="p-5 md:p-6 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Avatar
            initials={
              host.ownerInitials || (host.name || "H").slice(0, 2).toUpperCase()
            }
            size={36}
          />
          <div className="min-w-0">
            <p className="font-display font-bold text-ink truncate">
              {host.name}
            </p>
            <p className="text-xs text-slate truncate">
              {[host.locality, host.socket, `₹${b.rate}/kWh`]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </div>
        <span className="h-7 px-3 rounded-full bg-mint text-[11px] font-bold uppercase tracking-wider text-parrot-ink inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-parrot animate-pulse" /> Live
          · step {Math.min(idx + 1, 7)} of 7
        </span>
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={phase.key + (disputed ? "-d" : "")}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.28, ease: EASE.out }}
          className="mt-5 flex items-center gap-4"
        >
          <PhaseIcon phase={phase} big />
          <div className="min-w-0">
            <h2 className="font-display text-2xl md:text-3xl font-extrabold leading-tight">
              {disputed ? "Readings don't match" : phase.label}
            </h2>
            <p className="text-sm text-slate mt-1">
              {disputed
                ? "Re-check the meter photo together and confirm the same number."
                : phase.sub(host)}
            </p>
          </div>
        </motion.div>
      </AnimatePresence>
      <div className="mt-6">
        <PhaseStepper idx={idx} />
      </div>
    </Card>
  )
}

// floating status sheet shown on the driver's other tabs while a trip runs
export function TripSheet() {
  const { state, dispatch } = useStore()
  const uid = state.session.userId
  const { bookings } = useBookingList()
  const { hosts } = useHostList()
  const b =
    state.role === "driver" && state.driverTab !== "charge"
      ? bookings.find(
          (x) =>
            x.driverId === uid &&
            (ACTIVE_STATUSES.includes(x.status) || x.status === "disputed"),
        )
      : null
  const { start } = useReadings(b?.id)
  const host = (b && hosts.find((h) => h.id === b.hostId)) || {
    name: b?.hostName || "Host",
  }
  const idx = b ? phaseOf(b, start) : 0
  const phase = phaseInfo(idx)
  return (
    <AnimatePresence>
      {b && (
        <motion.div
          initial={{ y: 120, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 120, opacity: 0 }}
          transition={SPRING.snap}
          className="fixed inset-x-3 bottom-20 md:bottom-6 z-[650] mx-auto max-w-lg print:hidden"
        >
          <motion.button
            type="button"
            whileTap={{ scale: 0.98 }}
            onClick={() =>
              dispatch({ type: "TAB", role: "driver", tab: "charge" })
            }
            className="w-full text-left rounded-3xl bg-white border border-line shadow-xl p-3.5 flex items-center gap-3"
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={phase.key}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <PhaseIcon phase={phase} />
              </motion.div>
            </AnimatePresence>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate">
                Live charge · step {Math.min(idx + 1, 7)} of 7
              </p>
              <p className="font-display font-bold text-ink truncate">
                {b.status === "disputed" ? "Readings don't match" : phase.label}
              </p>
              <div className="mt-1.5 h-1 rounded-full bg-mint-2 overflow-hidden">
                <motion.div
                  className="h-full bg-parrot"
                  initial={false}
                  animate={{ width: `${Math.max(6, (idx / 7) * 100)}%` }}
                  transition={{ duration: 0.6, ease: EASE.inOut }}
                />
              </div>
              <p className="mt-1 text-xs text-slate truncate">{host.name}</p>
            </div>
            <span className="h-10 w-10 rounded-2xl btn-primary grid place-items-center shrink-0">
              <ChevronRight size={20} />
            </span>
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ---------------------------------------------------------------------------
// invoice (Zomato / Uber receipt style)
// ---------------------------------------------------------------------------
const PUBLIC_RATE = 24 // illustrative public fast-charger ₹/kWh (same as Find)

function Row({ k, v, strong, muted }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className={`text-sm ${muted ? "text-mute" : "text-slate"}`}>
        {k}
      </span>
      <span
        className={`font-mono tnum ${
          strong
            ? "text-base font-extrabold text-ink"
            : "text-sm font-bold text-ink"
        }`}
      >
        {v}
      </span>
    </div>
  )
}

export function InvoiceCard({ b, host, flat }) {
  const ready = b.hasBill
  const kwh = b.kwhUsed || 0
  const co = co2(kwh)
  const saved = Math.max(0, Math.round(kwh * PUBLIC_RATE) - (b.amount || 0))
  const when = b.paidAt || (ready ? b.updatedAt : null)
  const shell = flat
    ? "rounded-2xl border border-line bg-white"
    : "rounded-3xl border border-line bg-white shadow-sm"
  return (
    <div className={`${shell} overflow-hidden`}>
      <div className="px-5 py-4 bg-mint flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-9 w-9 rounded-xl bg-white grid place-items-center text-parrot-ink shrink-0">
            <Receipt size={17} />
          </div>
          <div className="min-w-0">
            <p className="font-display font-bold text-ink">Bill summary</p>
            <p className="text-[11px] text-slate font-mono truncate">
              {b.ref ? `#${b.ref}` : `Booking ${String(b.id).slice(-8)}`}
              {when
                ? ` · ${new Date(when).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}`
                : ""}
            </p>
          </div>
        </div>
        <span
          className={`h-6 px-2.5 rounded-full text-[11px] font-bold uppercase inline-flex items-center shrink-0 ${
            b.status === "paid"
              ? "btn-primary"
              : ready
                ? "bg-white text-ink border border-line"
                : "bg-amber/20 text-ink"
          }`}
        >
          {b.status === "paid" ? "Paid" : ready ? "Due" : "Generating"}
        </span>
      </div>

      <div className="px-5 pt-3 pb-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-mute pt-1">
          Meter readings
        </p>
        <Row
          k="Start meter"
          v={b.startKwh != null ? `${b.startKwh.toFixed(1)} kWh` : "—"}
        />
        <Row
          k="End meter"
          v={
            b.endKwh != null
              ? `${b.endKwh.toFixed(1)} kWh`
              : ready
                ? "—"
                : "awaiting photo"
          }
          muted={b.endKwh == null}
        />
        <Row
          k="Total units"
          v={
            ready
              ? `${kwh.toFixed(1)} kWh`
              : `≈ ${(b.estimateKwh || 0).toFixed(1)} kWh`
          }
          strong
        />

        <div className="my-3 border-t border-dashed border-line" />
        <p className="text-[11px] font-bold uppercase tracking-wider text-mute">
          Charges
        </p>
        <Row k="Per-unit rate" v={`₹${b.rate}/kWh`} />
        <Row
          k={
            ready
              ? `Energy (${kwh.toFixed(1)} × ₹${b.rate})`
              : "Energy (estimate)"
          }
          v={`₹${ready ? b.amount : b.estimateAmount}`}
        />
        <Row
          k="Platform fee"
          v={
            <span>
              ₹0{" "}
              <span className="text-parrot-ink font-sans text-xs">
                launch offer
              </span>
            </span>
          }
        />

        <div className="mt-3 pt-3 border-t-2 border-ink/80 flex items-end justify-between gap-3">
          <div>
            <p className="font-display font-extrabold text-ink">
              {ready ? "Total" : "Estimated total"}
            </p>
            <p className="text-[11px] text-slate">
              {ready
                ? `Payable to ${host.name} · UPI or cash`
                : "Final bill appears once both confirm the end meter"}
            </p>
          </div>
          {ready ? (
            <motion.p
              key={b.amount}
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={SPRING.bouncy}
              className="font-mono text-4xl font-extrabold text-ink tnum"
            >
              ₹{b.amount}
            </motion.p>
          ) : (
            <div className="h-10 w-28 rounded-xl skel shimmer" />
          )}
        </div>
      </div>

      {ready && (
        <div className="px-5 pb-5 flex flex-wrap gap-2">
          <span className="h-8 px-3 rounded-full bg-parrot/15 text-parrot-ink text-xs font-bold inline-flex items-center gap-1.5">
            <Leaf size={14} /> {co.toFixed(1)} kg CO₂ saved
          </span>
          <span className="h-8 px-3 rounded-full bg-parrot/15 text-parrot-ink text-xs font-bold inline-flex items-center gap-1.5">
            <TreePine size={14} /> ≈ {(co / 21).toFixed(1)} tree-years
          </span>
          {saved > 0 && (
            <span
              className="h-8 px-3 rounded-full bg-mint text-ink text-xs font-bold inline-flex items-center gap-1.5"
              title="vs ₹24/kWh illustrative public fast-charger price"
            >
              <IndianRupee size={13} /> {saved} saved vs public charging
            </span>
          )}
        </div>
      )}
    </div>
  )
}
