// @ts-nocheck
import { useEffect, useRef, useState } from "react"
import { animate, motion } from "framer-motion"
import { ArrowRight, FileText, Gauge, Pause, Play } from "lucide-react"
import {
  EASE,
  SPRING,
  privacyAfter,
  privacyBefore,
  videoOpt,
  videoOrig,
  videoPoster,
} from "../lib"
import { useStore } from "../store"
import { CopyBtn, Img } from "../ui"
import { CLOUD } from "../lib/cloudinary"
import { billFor, meterSrcs, useBookingList, useReadings } from "../lib/data"

function Wiper({ before, after, lb = "BEFORE", la = "AFTER" }) {
  const [p, setP] = useState(50)
  const ref = useRef(null)
  useEffect(() => {
    const c = animate(50, [50, 90, 10, 50], {
      duration: 1.6,
      ease: EASE.inOut,
      delay: 0.6,
      onUpdate: setP,
    })
    return () => c.stop()
  }, [])
  const move = (e) => {
    const r = ref.current.getBoundingClientRect()
    setP(Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100)))
  }
  return (
    <div
      ref={ref}
      className="relative aspect-[3/2] rounded-2xl overflow-hidden select-none touch-none cursor-ew-resize bg-mint"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        move(e)
      }}
      onPointerMove={(e) => e.buttons && move(e)}
      role="slider"
      aria-label={`${lb} / ${la} comparison`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(p)}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") setP((x) => Math.max(0, x - 5))
        if (e.key === "ArrowRight") setP((x) => Math.min(100, x + 5))
      }}
    >
      <div className="absolute inset-0">{after}</div>
      <div
        className="absolute inset-0"
        style={{ clipPath: `inset(0 ${100 - p}% 0 0)` }}
      >
        {before}
      </div>
      <div
        className="absolute inset-y-0 w-0.5 bg-white shadow"
        style={{ left: `${p}%` }}
      >
        <span className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-9 w-9 rounded-full bg-white border-2 border-parrot shadow-lg grid place-items-center text-xs font-bold">
          ⇆
        </span>
      </div>
      <span className="absolute top-2 left-2 h-6 px-2.5 rounded-full bg-white text-[11px] font-bold inline-flex items-center">
        {lb}
      </span>
      <span className="absolute top-2 right-2 h-6 px-2.5 rounded-full bg-white text-[11px] font-bold inline-flex items-center">
        {la}
      </span>
    </div>
  )
}

function UrlChip({ url }) {
  const [n, setN] = useState(0)
  useEffect(() => {
    const c = animate(0, url.length, {
      duration: 0.7,
      onUpdate: (v) => setN(Math.round(v)),
    })
    return () => c.stop()
  }, [url])
  return (
    <div className="mt-3 flex items-center gap-2 rounded-xl bg-mint px-3 py-2">
      <code
        className="flex-1 min-w-0 truncate font-mono text-[11px] text-slate"
        title={url}
      >
        {url.slice(0, n)}
      </code>
      <CopyBtn text={url} />
    </div>
  )
}

function Col({ i, title, line, children, url, stats }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...SPRING.soft, delay: i * 0.12 }}
      className="rounded-3xl bg-white border border-line p-5 shadow-sm min-w-0"
    >
      <div className="flex items-center gap-2">
        <span className="h-7 w-7 shrink-0 rounded-full btn-primary grid place-items-center font-mono text-xs font-bold">
          {i + 1}
        </span>
        <h3 className="font-display font-bold">{title}</h3>
      </div>
      <p className="mt-1.5 text-sm text-slate">{line}</p>
      <div className="mt-4">{children}</div>
      {url && <UrlChip url={url} />}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {stats.map((s) => (
          <span
            key={s}
            className="h-6 px-2.5 rounded-full bg-mint-2 text-[11px] font-semibold inline-flex items-center"
          >
            {s}
          </span>
        ))}
      </div>
    </motion.div>
  )
}

function VideoBox({ src, poster, label }) {
  const ref = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [err, setErr] = useState(false)
  const toggle = () => {
    const v = ref.current
    if (!v) return
    if (playing) {
      v.pause()
      setPlaying(false)
    } else
      v
        .play()
        ?.then(() => setPlaying(true))
        .catch(() => setErr(true))
  }
  return (
    <div className="relative aspect-video rounded-xl overflow-hidden bg-mint">
      {!err ? (
        <video
          ref={ref}
          src={src}
          poster={poster}
          muted
          loop
          playsInline
          preload="metadata"
          onError={() => setErr(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="h-full grid place-items-center text-xs text-slate">
          Video unavailable
        </div>
      )}
      <span className="absolute top-1.5 left-1.5 h-5 px-2 rounded-full bg-white text-[10px] font-bold inline-flex items-center">
        {label}
      </span>
      {!err && (
        <button
          aria-label={playing ? `Pause ${label}` : `Play ${label}`}
          onClick={toggle}
          className="absolute bottom-1.5 right-1.5 h-9 w-9 rounded-full bg-white shadow grid place-items-center"
        >
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </button>
      )}
    </div>
  )
}

function SizeBar({ orig, opt }) {
  const [sizes, setSizes] = useState(null)
  useEffect(() => {
    const head = (u) =>
      fetch(u, { method: "HEAD" }).then(
        (r) => +r.headers.get("content-length") || 0,
      )
    // only show numbers we actually measured
    Promise.all([head(orig), head(opt)])
      .then(([a, b]) => setSizes(a && b ? { a, b } : false))
      .catch(() => setSizes(false))
  }, [orig, opt])
  if (sizes === null)
    return <div className="mt-3 h-12 rounded-xl skel shimmer" />
  if (!sizes)
    return (
      <p className="mt-3 text-[11px] text-mute">
        Couldn't measure the file sizes from this browser.
      </p>
    )
  const pct = Math.max(2, (sizes.b / sizes.a) * 100)
  const fmt = (n) =>
    n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`
  return (
    <div className="mt-3">
      <div className="flex justify-between items-center text-xs font-mono">
        <span>
          {fmt(sizes.a)} → <b>{fmt(sizes.b)}</b>
        </span>
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ ...SPRING.bouncy, delay: 1.2 }}
          className="h-5 px-2 rounded-full btn-primary font-bold inline-flex items-center"
        >
          −{Math.round(100 - pct)}% data
        </motion.span>
      </div>
      <div className="mt-1.5 h-3 rounded-full bg-mint-2 overflow-hidden">
        <motion.div
          className="h-full btn-primary rounded-full"
          initial={{ width: "100%" }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 1.2, ease: EASE.out, delay: 0.3 }}
        />
      </div>
      <p className="mt-1 text-[11px] text-mute">
        Measured from Cloudinary's response headers
      </p>
    </div>
  )
}

const kw1 = (v) => (v == null ? "—" : v.toFixed(1))
const PROOF_STATUSES = [
  "startMeter",
  "charging",
  "endMeter",
  "awaitingPay",
  "paid",
  "disputed",
]
// keep the inspector readable: inline demo images are summarised
const lite = (r) =>
  r && (r.localUrl ? { ...r, localUrl: "data:image/svg+xml (simulated)" } : r)
const SAMPLE_NOTE =
  "Cloudinary sample media — shows the transform, not a PLUG-HOME booking."

function MeterEvidence({ b, start, end, bill }) {
  // stamp only confirmed numbers onto the photos
  const startSrcs = meterSrcs(
    start,
    b.startKwh != null ? `START ${kw1(b.startKwh)} kWh` : "START · unconfirmed",
  )
  const endSrcs = meterSrcs(
    end,
    b.endKwh != null ? `END ${kw1(b.endKwh)} kWh` : "END · unconfirmed",
  )
  return (
    <>
      <Wiper
        lb="START"
        la="END"
        before={
          <Img
            key={startSrcs[0] || "s"}
            srcs={startSrcs}
            alt="Start meter photo"
            className="h-full w-full"
          />
        }
        after={
          <Img
            key={endSrcs[0] || "e"}
            srcs={endSrcs}
            alt="End meter photo"
            className="h-full w-full"
          />
        }
      />
      {bill ? (
        <Img
          key={bill}
          srcs={[bill]}
          alt="Composite bill built from both meter photos"
          className="mt-3 w-full rounded-xl aspect-[1200/630]"
        />
      ) : (
        <p className="mt-3 rounded-xl bg-mint px-3 py-2.5 text-xs text-slate">
          The composite bill is generated once both meter photos are uploaded
          and both readings are confirmed.
        </p>
      )}
    </>
  )
}

export default function Proof() {
  const { state, dispatch } = useStore()
  const demo = Boolean(state.session.demo)
  const uid = state.session.userId
  const { bookings, loading, error } = useBookingList()
  // live: the server only returns my bookings · Judge Mode holds every
  // simulated booking, so keep the ones this persona is part of
  const latest =
    bookings.find(
      (b) =>
        PROOF_STATUSES.includes(b.status) &&
        (!demo || b.driverId === uid || b.hostOwnerId === uid),
    ) || null
  const { start, end } = useReadings(latest?.id)
  const [open, setOpen] = useState(false)
  const role = state.session.role
  const bill = billFor(demo, latest, start, end)
  // a data: URL is meaningless to copy, so Judge Mode shows no URL chip
  const evidenceUrl = demo
    ? null
    : bill || meterSrcs(start, `START ${kw1(latest?.startKwh)} kWh`)[0] || null
  const billStats = !latest
    ? ["No metered charge yet"]
    : latest.hasBill
      ? [
          `Net ${kw1(latest.kwhUsed)} kWh`,
          `Bill ₹${latest.amount}`,
          "Built from both meter photos",
        ]
      : latest.status === "disputed"
        ? ["Readings disputed", "Re-check pending"]
        : [
            latest.startKwh != null ? "Start confirmed" : "Start pending",
            latest.endKwh != null ? "End confirmed" : "Waiting for end meter",
          ]
  const inspector = latest && {
    cloud_name: demo ? "judge-demo (simulated)" : CLOUD || null,
    booking_id: latest.id,
    status: latest.rawStatus,
    start_reading: lite(start),
    end_reading: lite(end),
    kwh_used: latest.hasBill ? latest.kwhUsed : null,
    amount: latest.hasBill ? latest.amount : null,
    bill_url: demo ? (bill ? "data:image/svg+xml (simulated)" : null) : bill,
  }
  const goCharge = () =>
    dispatch({
      type: "TAB",
      role,
      tab: role === "host" ? "bookings" : role === "driver" ? "charge" : "find",
    })
  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-8 pb-28">
      <h2 className="font-display text-2xl md:text-3xl font-extrabold tracking-tight">
        How PLUG-HOME builds trust with Cloudinary
      </h2>
      <p className="text-slate mt-1">
        Every charge leaves photo proof of both meter readings. The privacy and
        video recipes below run on Cloudinary sample media so you can see each
        transform.
      </p>
      <div className="mt-6 grid lg:grid-cols-3 gap-5">
        <Col
          i={0}
          title="Start vs End meter bill"
          line={
            latest
              ? `Your latest charge · ${latest.hostName}`
              : "Disputes over units → one composite built from both photos."
          }
          url={latest ? evidenceUrl : null}
          stats={billStats}
        >
          {loading ? (
            <div className="aspect-[3/2] rounded-2xl skel shimmer" />
          ) : latest ? (
            <MeterEvidence b={latest} start={start} end={end} bill={bill} />
          ) : (
            <div className="aspect-[3/2] rounded-2xl bg-mint grid place-items-center text-center p-6">
              <div>
                <Gauge className="mx-auto text-parrot-ink" />
                <p className="mt-2 font-display font-bold">
                  {error ? "Couldn't load your charges" : "No meter proof yet"}
                </p>
                <p className="mt-1 text-xs text-slate">
                  {error
                    ? "Retrying automatically."
                    : "Meter photos from your first charge appear here, along with the bill built from them."}
                </p>
                {!error && (
                  <button
                    onClick={goCharge}
                    className="mt-3 h-11 px-4 inline-flex items-center gap-1.5 text-sm font-semibold text-parrot-ink hover:underline"
                  >
                    {role === "host"
                      ? "Go to Bookings & Proof"
                      : "Find a charger"}
                    <ArrowRight size={15} />
                  </button>
                )}
              </div>
            </div>
          )}
        </Col>
        <Col
          i={1}
          title="Host driveway privacy shield"
          line="Strangers' faces & plates → blurred, brightened, stripped."
          url={privacyAfter()}
          stats={[
            "Sample media",
            "Faces blurred",
            "Plate zone blurred (fixed region)",
            "Metadata stripped",
          ]}
        >
          <Wiper
            before={
              <Img
                srcs={[privacyBefore()]}
                alt="Sample raw driveway photo"
                className="h-full w-full"
              />
            }
            after={
              <Img
                srcs={[privacyAfter()]}
                alt="Sample protected driveway photo"
                className="h-full w-full"
              />
            }
          />
          <p className="mt-2 text-[11px] text-mute">
            {SAMPLE_NOTE} Faces are blurred automatically; the plate blur here
            is a fixed region — automatic plate detection needs an extra AI
            add-on.
          </p>
        </Col>
        <Col
          i={2}
          title="Video compression"
          line="Heavy walkthrough videos → instant previews on 4G."
          url={videoOpt()}
          stats={["Sample media", "f_auto", "q_auto:eco", "w_640 · 6 s"]}
        >
          <div className="grid grid-cols-2 gap-2">
            <VideoBox
              src={videoOrig()}
              poster={videoPoster()}
              label="ORIGINAL"
            />
            <VideoBox
              src={videoOpt()}
              poster={videoPoster()}
              label="OPTIMISED"
            />
          </div>
          <SizeBar orig={videoOrig()} opt={videoOpt()} />
          <p className="mt-2 text-[11px] text-mute">{SAMPLE_NOTE}</p>
        </Col>
      </div>
      <div className="mt-6 rounded-3xl bg-mint p-5 md:p-6 grid lg:grid-cols-2 gap-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-display font-bold">Uploads & inspector</p>
            <span
              className={`h-7 px-3 rounded-full text-xs font-bold inline-flex items-center ${
                demo
                  ? "bg-amber/15"
                  : CLOUD
                    ? "btn-primary"
                    : "bg-white border border-line"
              }`}
            >
              {demo
                ? "Judge demo · nothing uploaded"
                : CLOUD
                  ? `Signed uploads · ${CLOUD}`
                  : "Photo uploads not configured"}
            </span>
          </div>
          <p className="mt-3 text-sm text-slate">
            Meter photos and host media upload with short-lived signatures
            issued by the PLUG-HOME server — no keys or presets live in the
            browser. Both parties confirm each reading before it is billed.
          </p>
          <button
            onClick={() => setOpen((o) => !o)}
            disabled={!inspector}
            aria-expanded={open}
            className="mt-3 h-11 inline-flex items-center gap-1.5 text-sm font-semibold text-parrot-ink disabled:text-mute"
          >
            <FileText size={15} />
            {!inspector
              ? "JSON inspector · available after your first charge"
              : open
                ? "Hide JSON inspector"
                : "Show JSON inspector"}
          </button>
          {open && inspector && (
            <pre className="mt-1 max-h-56 overflow-auto rounded-xl bg-white border border-line p-3 font-mono text-[11px] text-slate">
              {JSON.stringify(inspector, null, 2)}
            </pre>
          )}
        </div>
        <ol className="rounded-2xl bg-white border border-line p-5 space-y-3 text-sm">
          {[
            [
              "Start meter",
              "The driver photographs the meter on arrival; both of you confirm the number.",
            ],
            ["Charge", "The car charges from the host socket."],
            ["End meter", "A second photo and confirmation close the session."],
            [
              "Bill",
              "Units × rate gives the amount, and both photos are stamped into one bill.",
            ],
          ].map(([t, d], i) => (
            <li key={t} className="flex gap-3">
              <span className="h-6 w-6 shrink-0 rounded-full btn-primary grid place-items-center font-mono text-[11px] font-bold">
                {i + 1}
              </span>
              <span>
                <span className="font-semibold">{t}</span> —{" "}
                <span className="text-slate">{d}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
