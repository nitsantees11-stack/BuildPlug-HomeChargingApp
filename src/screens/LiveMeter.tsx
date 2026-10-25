// @ts-nocheck
// Live-mode meter proof: real camera/file input → signed Cloudinary upload →
// OCR prefill → each party confirms → the server decides (confirmed/disputed).
import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  Camera,
  Check,
  Hourglass,
  RotateCw,
  ScanLine,
  TriangleAlert,
} from "lucide-react"
import { useStore, useToast } from "../store"
import { Btn, Card, Img } from "../ui"
import { round1 } from "../lib"
import { demoMeterStart, demoReading } from "../demo"
import { bookingAction, confirmReading } from "../lib/api"
import { uploadToCloudinary } from "../lib/upload"
import { refresh, useBookings, usePendingAction } from "../lib/live"
import { meterSrcs } from "../lib/data"
import { useErrorToast } from "../lib/errorToast"

const fmtTime = (ts) =>
  ts
    ? new Date(ts).toLocaleTimeString("en-IN", {
        hour: "numeric",
        minute: "2-digit",
      })
    : "—"
const kwhText = (v) =>
  v == null
    ? "—"
    : v.toLocaleString("en-IN", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })

export function LiveMeterTile({ label, reading, kwh }) {
  const value =
    kwh ??
    reading?.driverValue ??
    reading?.hostValue ??
    reading?.ocrKwh ??
    reading?.suggested ??
    null
  const id = reading?.publicId || reading?.localUrl
  // live: Cloudinary / signed Storage URL · Judge Mode: on-device SVG
  const srcs = meterSrcs(
    reading,
    value != null ? `${label} ${value.toFixed(1)} kWh` : label,
  )
  return (
    <div className="rounded-2xl overflow-hidden border border-line bg-white">
      <div className="relative aspect-[3/2] bg-mint">
        {id && srcs.length ? (
          <Img
            key={id}
            srcs={srcs}
            alt={`${label} meter`}
            className="h-full w-full"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center p-4 text-center">
            <div>
              <Camera className="mx-auto text-parrot-ink" />
              <p className="mt-1 text-xs text-slate">No meter photo yet</p>
            </div>
          </div>
        )}
        <span className="absolute top-2 left-2 h-6 px-2.5 rounded-full bg-white text-[11px] font-bold inline-flex items-center">
          {label}
        </span>
      </div>
      <div className="p-3">
        <p className="font-mono font-bold text-sm md:text-base">
          {kwhText(value)} kWh · {fmtTime(reading?.uploadedAt)}
        </p>
        <p className="text-xs text-parrot-ink font-semibold flex flex-wrap items-center gap-1 mt-0.5">
          <ScanLine size={12} />
          {reading?.ocrKwh != null ? (
            <>OCR read: {reading.ocrKwh.toFixed(1)} kWh</>
          ) : (
            <span className="text-mute font-normal">
              {reading?.simulated
                ? "Simulated meter · judge demo"
                : id
                  ? "OCR unavailable — entered manually"
                  : "Photo required"}
            </span>
          )}
        </p>
      </div>
    </div>
  )
}

export function MeterCapture({ b, stage, reading, party }) {
  const { state, dispatch } = useStore()
  const demo = Boolean(state.session.demo)
  const toast = useToast()
  const err = useErrorToast()
  const fileRef = useRef(null)
  const [progress, setProgress] = useState(null)
  const [thumb, setThumb] = useState(null)
  const [value, setValue] = useState("")
  const mine = party === "driver" ? reading?.driverValue : reading?.hostValue
  const theirs = party === "driver" ? reading?.hostValue : reading?.driverValue
  const other = party === "driver" ? "host" : "driver"
  const photo = reading?.publicId || reading?.localUrl || null
  // prefill from the server's OCR (or my earlier entry, or the simulated
  // meter in Judge Mode) whenever a new photo lands
  useEffect(() => {
    setValue(
      photo ? String(mine ?? reading.ocrKwh ?? reading.suggested ?? "") : "",
    )
  }, [photo])
  useEffect(() => () => thumb && URL.revokeObjectURL(thumb), [thumb])
  const watch = `${b.rawStatus}|${reading?.publicId}|${reading?.driverValue}|${reading?.hostValue}`
  const [pending, run] = usePendingAction(watch, (e) =>
    err("Couldn't confirm the reading", e),
  )

  // Judge Mode: a simulated meter photo, generated on this device
  const simulate = () => {
    if (progress != null) return
    setProgress(40)
    setTimeout(() => setProgress(100), 250)
    setTimeout(() => {
      const start = b.startKwh ?? demoMeterStart(b.hostId)
      const v =
        stage === "start"
          ? demoMeterStart(b.hostId)
          : round1(start + (b.estimateKwh || 0))
      dispatch({
        type: "DEMO_READING",
        bookingId: b.id,
        stage,
        reading: demoReading(b.id, stage, v),
      })
      setProgress(null)
      toast("Simulated meter photo", "Check the reading, then confirm it.")
    }, 600)
  }
  const upload = async (file) => {
    if (!file || progress != null) return
    setThumb(URL.createObjectURL(file))
    setProgress(1)
    try {
      await uploadToCloudinary({
        file,
        purpose: "meter",
        bookingId: b.id,
        stage,
        resourceType: "image",
        onProgress: setProgress,
      })
      await refresh(`readings:${b.id}`)
      toast("Meter photo uploaded", "Check the reading, then confirm it.")
    } catch (e) {
      err("Meter photo upload failed", e, () => upload(file))
    } finally {
      setProgress(null)
      setThumb(null)
    }
  }
  const n = Number(value)
  const valid = value !== "" && Number.isFinite(n) && n > 0
  const confirm = () => {
    if (!demo) return run("Confirming…", () => confirmReading(b.id, stage, n))
    if (stage === "end" && b.startKwh != null && n < b.startKwh)
      return toast(
        "Check the end reading",
        `It can't be below the start reading (${kwhText(b.startKwh)} kWh).`,
        { tone: "warn" },
      )
    // the simulated other party confirms the same number
    dispatch({
      type: "DEMO_ACTION",
      id: b.id,
      action: stage === "start" ? "confirm_start" : "confirm_end",
      value: round1(n),
    })
    toast(
      stage === "start" ? "Start meter verified" : "Bill ready",
      stage === "start"
        ? `${kwhText(round1(n))} kWh · charging started`
        : "Both readings confirmed — the bill is locked in.",
    )
  }
  const capture = () => (demo ? simulate() : fileRef.current?.click())

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        aria-label={`${stage} meter photo`}
        onChange={(e) => {
          upload(e.target.files?.[0])
          e.target.value = ""
        }}
      />
      <AnimatePresence mode="wait">
        {progress != null ? (
          <motion.div
            key="up"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-5 rounded-2xl bg-mint p-3 flex items-center gap-3"
            aria-live="polite"
          >
            {thumb && (
              <img
                src={thumb}
                alt=""
                className="h-12 w-16 rounded-lg object-cover shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">
                {demo ? "Simulating meter photo…" : "Uploading meter photo…"}{" "}
                <span className="font-mono">{progress}%</span>
              </p>
              <div className="mt-1.5 h-2 rounded-full bg-white overflow-hidden">
                <motion.div
                  className="h-full btn-primary rounded-full"
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </div>
          </motion.div>
        ) : !photo ? (
          <motion.div
            key="cap"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <Btn className="mt-5" icon={Camera} onClick={capture}>
              Capture {stage} meter{demo ? " (simulated)" : ""}
            </Btn>
          </motion.div>
        ) : (
          <motion.div
            key="confirm"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-5"
          >
            {mine == null ? (
              <>
                <label className="block text-sm font-medium">
                  Meter reading (kWh)
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    min="0"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="e.g. 1420.0"
                    className="mt-1.5 w-full h-12 rounded-xl bg-mint px-4 font-mono text-lg font-bold border border-transparent outline-none focus:border-parrot focus:ring-4 focus:ring-parrot/20"
                  />
                </label>
                <p className="mt-1.5 text-xs text-mute">
                  {reading.simulated
                    ? "Pre-filled from the simulated meter — edit it to try a different reading."
                    : reading.ocrKwh != null
                      ? "Pre-filled from OCR — fix it if the photo says otherwise."
                      : "OCR could not read this photo — type the number shown on the meter."}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Btn
                    icon={Check}
                    disabled={!valid || !!pending}
                    onClick={confirm}
                  >
                    {pending || "Confirm reading"}
                  </Btn>
                  <Btn
                    variant="secondary"
                    icon={Camera}
                    disabled={!!pending}
                    onClick={capture}
                  >
                    Retake photo
                  </Btn>
                </div>
              </>
            ) : theirs == null ? (
              <div
                className="rounded-2xl bg-mint p-4 flex gap-3 items-start"
                aria-live="polite"
              >
                <motion.span
                  animate={{ rotate: [0, 180, 180, 360] }}
                  transition={{ duration: 2.4, repeat: Infinity }}
                  className="mt-0.5 text-parrot-ink"
                >
                  <Hourglass size={18} />
                </motion.span>
                <div>
                  <p className="font-semibold">
                    Waiting for the {other} to confirm
                  </p>
                  <p className="text-sm text-slate">
                    You confirmed{" "}
                    <span className="font-mono font-bold text-ink">
                      {kwhText(mine)} kWh
                    </span>
                    . This updates the moment they do.
                  </p>
                </div>
              </div>
            ) : (
              <p className="rounded-2xl bg-mint p-4 font-semibold flex items-center gap-2">
                <Check size={18} className="text-parrot-ink" />
                Both confirmed {kwhText(mine)} kWh — finalising…
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function DisputePanel({ b, start, end, party, photos = true }) {
  const err = useErrorToast()
  const [pending, run] = usePendingAction(b.rawStatus, (e) =>
    err("Couldn't reopen the reading", e),
  )
  const r = b.disputeStage === "end" ? end : start
  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 text-[#B45309]">
        <TriangleAlert size={18} />
        <span className="text-xs font-bold uppercase tracking-wider">
          Readings don't match
        </span>
      </div>
      <h3 className="mt-2 font-display text-xl font-extrabold">
        The {b.disputeStage || "meter"} readings differ
      </h3>
      <p className="text-slate mt-1">
        Compare both meter photos, agree on the number, then re-check. Nothing
        is billed until both of you confirm the same reading.
      </p>
      {photos && (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <LiveMeterTile label="START" reading={start} kwh={b.startKwh} />
          <LiveMeterTile label="END" reading={end} />
        </div>
      )}
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        {[
          ["Driver entered", r?.driverValue],
          ["Host entered", r?.hostValue],
        ].map(([k, v]) => (
          <div
            key={k}
            className={`rounded-2xl p-3 ${
              (party === "driver") === (k === "Driver entered")
                ? "bg-mint"
                : "border border-line"
            }`}
          >
            <p className="text-xs text-slate">{k}</p>
            <p className="font-mono text-lg font-bold">{kwhText(v)} kWh</p>
          </div>
        ))}
      </div>
      <Btn
        className="mt-4"
        icon={RotateCw}
        disabled={!!pending}
        onClick={() => run("Reopening…", () => bookingAction(b.id, "recheck"))}
      >
        {pending || "Re-check reading"}
      </Btn>
    </Card>
  )
}

const DRIVER_MSG = {
  accepted: (b) => ["Booking accepted", `${b.hostName} is ready — head over.`],
  declined: (b) => [
    "Booking declined",
    `${b.hostName} can't host right now — pick another charger.`,
    { tone: "warn" },
  ],
  charging: (b) => [
    "Start meter verified",
    `${kwhText(b.startKwh)} kWh · charging started`,
  ],
  awaitingPay: (b) => [
    "Bill ready",
    `${kwhText(b.kwhUsed)} kWh · ₹${b.amount}`,
  ],
  disputed: () => [
    "Meter readings differ",
    "Compare both photos and re-check.",
    { tone: "warn" },
  ],
}
const HOST_MSG = {
  requested: (b) => [
    "New booking request",
    `${b.driver} wants ${b.startSoc}→${b.targetSoc}%`,
  ],
  cancelled: (b) => [
    "Booking cancelled",
    `${b.driver} cancelled the request.`,
    { tone: "warn" },
  ],
  startMeter: () => ["Driver arrived", "Confirm the start meter reading."],
  endMeter: () => ["Charging finished", "Confirm the end meter reading."],
  paid: (b) => ["Payment received", `₹${b.amount} from ${b.driver}`],
  disputed: () => [
    "Meter readings differ",
    "Compare both photos and re-check.",
    { tone: "warn" },
  ],
}

// Announces server-driven booking changes (from the other window/party).
export function LiveNotifier() {
  const { state } = useStore()
  const toast = useToast()
  const uid = state.session.userId
  const { bookings, loading } = useBookings(true)
  const seen = useRef(null)
  useEffect(() => {
    if (loading) return
    const prev = seen.current
    seen.current = new Map(bookings.map((b) => [b.id, b.status]))
    if (!prev) return
    bookings.forEach((b) => {
      const was = prev.get(b.id)
      if (was === b.status) return
      const asHost = b.hostOwnerId === uid
      if (!was && !(asHost && b.status === "requested")) return
      const msg = (asHost ? HOST_MSG : DRIVER_MSG)[b.status]
      if (msg) {
        const [t, body, extra] = msg(b)
        toast(t, body, extra)
      }
    })
  }, [bookings, loading])
  return null
}
