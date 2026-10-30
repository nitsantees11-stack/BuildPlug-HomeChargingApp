// @ts-nocheck
import { useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ArrowRight, Clock, History, MapPin, RotateCw, X, Zap } from "lucide-react"
import { co2 } from "../lib"
import { useStore } from "../store"
import { Btn, Card, Chip, Num } from "../ui"
import { ACTIVE_STATUSES } from "../lib/live"
import { useBookingList, useHostList } from "../lib/data"
import { HistorySessionBox, StatusPill, sessionDate } from "./DriverCharge"

const FILTERS = [
  ["all", "All"],
  ["completed", "Completed"],
  ["cancelled", "Cancelled"],
]
const ENDED = ["paid", "cancelled", "declined"]
const monthOf = (b) =>
  sessionDate(b).toLocaleDateString("en-IN", { month: "long", year: "numeric" })

function CancelledRow({ b, host, onRebook }) {
  const declined = b.status === "declined"
  return (
    <Card className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div className="flex items-start gap-3.5 min-w-0">
        <div className="h-12 w-12 rounded-2xl bg-mint grid place-items-center text-slate shrink-0">
          <X size={22} />
        </div>
        <div className="min-w-0">
          <span className="h-5 px-2.5 rounded-full bg-white border border-line text-slate text-[11px] font-bold uppercase inline-flex items-center">
            {declined ? "Declined by host" : "Cancelled"}
          </span>
          <h3 className="mt-1 font-display text-lg font-extrabold text-ink truncate">{host.name}</h3>
          <p className="text-xs text-slate flex flex-wrap items-center gap-2 mt-0.5">
            <span className="inline-flex items-center gap-1 font-mono">
              <Clock size={12} />
              {sessionDate(b).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
            </span>
            <span>· est. {(b.estimateKwh || 0).toFixed(1)} kWh · ₹{b.estimateAmount} · not charged</span>
          </p>
        </div>
      </div>
      {host.id && (
        <Btn variant="secondary" icon={RotateCw} className="!h-10 !text-sm shrink-0" onClick={onRebook}>
          Book again
        </Btn>
      )}
    </Card>
  )
}

export default function DriverHistory() {
  const { state, dispatch } = useStore()
  const demo = Boolean(state.session.demo)
  const uid = state.session.userId
  const { bookings, loading, error, refresh: retry } = useBookingList()
  const { hosts } = useHostList()
  const [filter, setFilter] = useState("all")
  const [openId, setOpenId] = useState(null)

  const mine = bookings.filter((x) => x.driverId === uid)
  const active = mine.find((x) => ACTIVE_STATUSES.includes(x.status) || x.status === "disputed")
  const ended = useMemo(
    () => mine.filter((x) => ENDED.includes(x.status)).sort((a, z) => sessionDate(z) - sessionDate(a)),
    [bookings, uid],
  )
  const paid = ended.filter((x) => x.status === "paid")
  const shown = ended.filter((x) =>
    filter === "all" ? true : filter === "completed" ? x.status === "paid" : x.status !== "paid",
  )
  const groups = shown.reduce((acc, b) => {
    const m = monthOf(b)
    ;(acc[m] ||= []).push(b)
    return acc
  }, {})

  const totalKwh = paid.reduce((s, x) => s + (x.kwhUsed || 0), 0)
  const totalSpent = paid.reduce((s, x) => s + (x.amount || 0), 0)
  const stats = [
    ["Charges", <Num value={paid.length} />],
    ["Energy", <Num value={totalKwh} decimals={1} suffix=" kWh" />],
    ["Spent", <Num value={totalSpent} prefix="₹" />],
    ["CO₂ saved", <Num value={co2(totalKwh)} decimals={1} suffix=" kg" />],
  ]

  const hostFor = (b) =>
    hosts.find((h) => h.id === b.hostId) || { id: null, name: b.hostName || "Host", socket: "" }
  const go = (tab) => dispatch({ type: "TAB", role: "driver", tab })
  const rebook = (h) => {
    dispatch({ type: "SELECT", id: h.id })
    go("find")
  }

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 pb-28 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-mint grid place-items-center text-parrot-ink">
            <History size={22} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate">Your activity</p>
            <h2 className="font-display text-2xl font-extrabold">Charging history</h2>
          </div>
        </div>
        <Btn icon={Zap} className="!h-10 !text-sm" onClick={() => go("find")}>
          Book a charger
        </Btn>
      </div>

      {active && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="p-4 md:p-5 !border-parrot ring-2 ring-parrot/20">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="h-3 w-3 rounded-full bg-parrot animate-pulse shrink-0" />
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate">Charge in progress</p>
                  <p className="font-display font-bold text-ink truncate">{hostFor(active).name}</p>
                </div>
                <StatusPill status={active.status} />
              </div>
              <Btn className="!h-10 !text-sm" onClick={() => go("charge")}>
                Open live session <ArrowRight size={16} />
              </Btn>
            </div>
          </Card>
        </motion.div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map(([k, v]) => (
          <Card key={k} soft className="p-4">
            <p className="text-xs text-slate font-semibold">{k}</p>
            <p className="mt-1 font-mono text-2xl font-extrabold text-ink tnum">{v}</p>
          </Card>
        ))}
      </div>

      <div className="flex gap-2 overflow-x-auto snap-x pb-1">
        {FILTERS.map(([id, label]) => (
          <Chip key={id} active={filter === id} onClick={() => setFilter(id)}>
            {label}
            {id === "all" ? ` · ${ended.length}` : id === "completed" ? ` · ${paid.length}` : ` · ${ended.length - paid.length}`}
          </Chip>
        ))}
      </div>

      {loading && !bookings.length && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-24 rounded-3xl skel shimmer" />)}
        </div>
      )}

      {!loading && error && !bookings.length && (
        <Card className="p-8 text-center">
          <h3 className="font-display text-xl font-extrabold">Couldn't load your history</h3>
          <Btn className="mt-4" onClick={retry}>Try again</Btn>
        </Card>
      )}

      {!loading && !error && !shown.length && (
        <Card className="p-8 text-center">
          <div className="mx-auto h-16 w-16 rounded-3xl bg-mint grid place-items-center text-parrot-ink">
            <MapPin size={28} />
          </div>
          <h3 className="mt-4 font-display text-xl font-extrabold">
            {filter === "cancelled" ? "No cancelled bookings" : "No charges yet"}
          </h3>
          <p className="text-sm text-slate mt-1">Finished sessions, receipts and ratings collect here.</p>
        </Card>
      )}

      <AnimatePresence initial={false}>
        {Object.entries(groups).map(([month, list]) => (
          <motion.section key={month} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-slate px-1">{month}</p>
            {list.map((b) =>
              b.status === "paid" ? (
                <HistorySessionBox
                  key={b.id}
                  b={b}
                  host={hostFor(b)}
                  demo={demo}
                  expanded={openId === b.id}
                  onToggle={() => setOpenId((p) => (p === b.id ? null : b.id))}
                />
              ) : (
                <CancelledRow key={b.id} b={b} host={hostFor(b)} onRebook={() => rebook(hostFor(b))} />
              ),
            )}
          </motion.section>
        ))}
      </AnimatePresence>
    </div>
  )
}
