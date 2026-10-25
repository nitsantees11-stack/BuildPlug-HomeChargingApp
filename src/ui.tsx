// @ts-nocheck
import { Component, useEffect, useRef, useState } from "react"
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useSpring,
} from "framer-motion"
import {
  Check,
  CheckCircle2,
  CircleAlert,
  Copy,
  PlugZap,
  RotateCw,
  TriangleAlert,
  X,
} from "lucide-react"
import { EASE, SPRING } from "./lib"
import { useStore } from "./store"

export function useCountUp(to, duration = 1.4) {
  const [v, setV] = useState(0)
  const prev = useRef(0)
  useEffect(() => {
    const c = animate(prev.current, to, {
      duration,
      ease: EASE.out,
      onUpdate: setV,
    })
    prev.current = to
    return () => c.stop()
  }, [to])
  return v
}
export function Num({
  value,
  decimals = 0,
  prefix = "",
  suffix = "",
  className = "",
}) {
  // a missing/NaN figure renders as 0 instead of breaking the count-up
  const v = useCountUp(Number.isFinite(value) ? value : 0)
  return (
    <span className={`font-mono tnum ${className}`}>
      {prefix}
      {v.toLocaleString("en-IN", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
      {suffix}
    </span>
  )
}

export function Btn({
  variant = "primary",
  icon: Icon,
  children,
  onClick,
  className = "",
  magnetic,
  ...p
}) {
  const [ripples, setR] = useState([])
  const x = useSpring(useMotionValue(0), SPRING.snap)
  const y = useSpring(useMotionValue(0), SPRING.snap)
  const base =
    "relative overflow-hidden inline-flex items-center justify-center gap-2 h-12 px-5 rounded-2xl font-display font-bold text-[15px] transition-[background,box-shadow] disabled:opacity-50 disabled:pointer-events-none"
  const v = {
    primary: "btn-primary",
    secondary: "bg-white border border-line text-ink hover:bg-mint-2",
    ghost: "text-parrot-ink hover:bg-mint px-3",
  }[variant]
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      style={magnetic ? { x, y } : undefined}
      onMouseMove={(e) => {
        if (!magnetic) return
        const r = e.currentTarget.getBoundingClientRect()
        x.set(((e.clientX - r.left) / r.width - 0.5) * 12)
        y.set(((e.clientY - r.top) / r.height - 0.5) * 12)
      }}
      onMouseLeave={() => {
        x.set(0)
        y.set(0)
      }}
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        const id = Math.random()
        setR((rs) => [
          ...rs,
          { id, x: e.clientX - r.left, y: e.clientY - r.top },
        ])
        setTimeout(() => setR((rs) => rs.filter((q) => q.id !== id)), 520)
        onClick?.(e)
      }}
      className={`${base} ${v} ${className}`}
      {...p}
    >
      {ripples.map((r) => (
        <motion.span
          key={r.id}
          initial={{ scale: 0, opacity: 0.5 }}
          animate={{ scale: 4, opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="pointer-events-none absolute h-24 w-24 rounded-full bg-white/70"
          style={{ left: r.x - 48, top: r.y - 48 }}
        />
      ))}
      {Icon && <Icon size={18} strokeWidth={2.2} className="relative" />}
      <span className="relative inline-flex items-center gap-2">
        {children}
      </span>
    </motion.button>
  )
}

export function Chip({ active, children, onClick }) {
  return (
    <motion.button
      layout
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      aria-pressed={active}
      className={`h-9 shrink-0 snap-start px-4 rounded-full text-sm font-semibold font-sans border transition-colors ${
        active
          ? "btn-primary border-transparent"
          : "bg-white border-line text-slate hover:bg-mint-2"
      }`}
    >
      {children}
    </motion.button>
  )
}

export function Card({ children, className = "", soft, ...p }) {
  const ref = useRef(null)
  return (
    <div
      ref={ref}
      onMouseMove={(e) => {
        const r = ref.current.getBoundingClientRect()
        ref.current.style.setProperty("--mx", `${e.clientX - r.left}px`)
        ref.current.style.setProperty("--my", `${e.clientY - r.top}px`)
      }}
      className={`relative rounded-3xl ${
        soft
          ? "bg-mint"
          : "bg-white border border-line shadow-sm hover:shadow-xl"
      } transition-shadow ${className}`}
      {...p}
    >
      <div className="spot pointer-events-none absolute inset-0 rounded-3xl" />
      <div className="relative">{children}</div>
    </div>
  )
}

export function Slider({ value, min, max, onChange, amber, label }) {
  const fill = ((value - min) / (max - min || 1)) * 100
  return (
    <input
      type="range"
      aria-label={label}
      min={min}
      max={max}
      value={value}
      onChange={(e) => onChange(+e.target.value)}
      className={`range w-full ${amber ? "amber" : ""}`}
      style={{ "--fill": `${fill}%` }}
    />
  )
}

export function CopyBtn({ text, label = "Copy" }) {
  const [ok, setOk] = useState(false)
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
        } catch {}
        setOk(true)
        setTimeout(() => setOk(false), 1500)
      }}
      className="shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-white border border-line text-xs font-semibold text-ink hover:bg-mint-2"
    >
      {ok ? (
        <Check size={14} className="text-parrot-ink" />
      ) : (
        <Copy size={14} />
      )}{" "}
      {ok ? "Copied!" : label}
    </button>
  )
}

export function Logo({ size = 36, draw = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <motion.path
        d="M24 4 C38 8 44 20 40 32 C36 42 26 45 18 42 C8 38 4 26 8 16 C11 9 17 5 24 4 Z"
        stroke="#3F8F00"
        strokeWidth="2.5"
        fill="#72D600"
        initial={draw ? { pathLength: 0, fillOpacity: 0 } : false}
        animate={{ pathLength: 1, fillOpacity: 1 }}
        transition={{
          pathLength: { duration: 0.9, ease: EASE.inOut, delay: 0.1 },
          fillOpacity: { delay: 1, duration: 0.2 },
        }}
      />
      <motion.path
        d="M27 11 L16 27 L23 27 L20 38 L32 21 L25 21 Z"
        fill="#0F172A"
        initial={draw ? { scale: 0, opacity: 0 } : false}
        animate={{ scale: 1, opacity: 1 }}
        style={{ originX: "50%", originY: "50%" }}
        transition={{ ...SPRING.bouncy, delay: draw ? 1.2 : 0 }}
      />
    </svg>
  )
}
export const Wordmark = ({ className = "" }) => (
  <span
    className={`font-display font-extrabold tracking-[-0.02em] ${className}`}
  >
    PLUG<span className="text-parrot">-</span>HOME
  </span>
)

export const Avatar = ({ initials, size = 40 }) => (
  <div
    className="grid place-items-center rounded-full font-display font-bold text-ink shrink-0"
    style={{
      width: size,
      height: size,
      fontSize: size * 0.36,
      background: "linear-gradient(135deg,#EAF6DC,#B5E86B)",
    }}
  >
    {initials}
  </div>
)

// 28 leaves + 12 sparks, radial burst
export function LeafBurst({ trigger }) {
  const [bursts, setB] = useState([])
  useEffect(() => {
    if (!trigger) return
    const id = trigger
    const parts = Array.from({ length: 40 }, (_, i) => {
      const a = Math.random() * Math.PI * 2,
        d = 80 + Math.random() * 140
      return {
        i,
        spark: i >= 28,
        x: Math.cos(a) * d,
        y: Math.sin(a) * d,
        r: (Math.random() - 0.5) * 720,
        delay: Math.random() * 0.15,
        c: ["#72D600", "#84CC16", "#3F8F00", "#A3E635"][i % 4],
      }
    })
    setB((b) => [...b, { id, parts }])
    const t = setTimeout(() => setB((b) => b.filter((x) => x.id !== id)), 1500)
    return () => clearTimeout(t)
  }, [trigger])
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center z-20">
      {bursts.map((b) =>
        b.parts.map((p) => (
          <motion.div
            key={`${b.id}-${p.i}`}
            className="absolute"
            initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 0.6 }}
            animate={{ x: p.x, y: p.y, opacity: 0, rotate: p.r, scale: 1 }}
            transition={{ duration: 1.2, delay: p.delay, ease: EASE.out }}
          >
            {p.spark ? (
              <span className="text-amber text-sm">⚡</span>
            ) : (
              <svg width="12" height="12" viewBox="0 0 12 12">
                <path d="M6 0 C11 2 12 8 6 12 C0 8 1 2 6 0 Z" fill={p.c} />
              </svg>
            )}
          </motion.div>
        )),
      )}
    </div>
  )
}

const TONES = {
  ok: { Icon: CheckCircle2, bar: "bg-parrot", icon: "text-parrot-ink" },
  warn: { Icon: TriangleAlert, bar: "bg-amber", icon: "text-amber" },
  error: { Icon: CircleAlert, bar: "bg-red-500", icon: "text-red-500" },
}
function Toast({ t }) {
  const { dispatch } = useStore()
  const duration =
    t.duration || (t.action ? 8000 : t.tone === "error" ? 6000 : 3200)
  useEffect(() => {
    const x = setTimeout(
      () => dispatch({ type: "DISMISS", id: t.id }),
      duration,
    )
    return () => clearTimeout(x)
  }, [])
  const tone = TONES[t.tone] || TONES.ok
  const Icon = tone.Icon
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 40 }}
      transition={SPRING.snap}
      role={t.tone === "error" ? "alert" : undefined}
      className="pointer-events-auto relative overflow-hidden w-[340px] max-w-[calc(100vw-2rem)] rounded-2xl bg-white border border-line shadow-xl pl-5 pr-3 py-3 flex gap-3"
    >
      <span className={`absolute left-0 top-0 bottom-0 w-1.5 ${tone.bar}`} />
      <Icon size={20} className={`shrink-0 mt-0.5 ${tone.icon}`} />
      <div className="flex-1 min-w-0">
        <p className="font-display font-bold text-sm">{t.title}</p>
        {t.body && <p className="text-[13px] text-slate">{t.body}</p>}
        {t.action && (
          <button
            onClick={() => {
              dispatch({ type: "DISMISS", id: t.id })
              t.action.onClick()
            }}
            className="mt-2 h-8 px-3 rounded-full bg-white border border-line text-xs font-semibold text-ink inline-flex items-center gap-1.5 hover:bg-mint-2"
          >
            <RotateCw size={13} />
            {t.action.label}
          </button>
        )}
      </div>
      <button
        aria-label="Dismiss"
        onClick={() => dispatch({ type: "DISMISS", id: t.id })}
        className="h-7 w-7 shrink-0 grid place-items-center rounded-full hover:bg-mint"
      >
        <X size={14} />
      </button>
      <motion.span
        className={`absolute left-0 bottom-0 h-0.5 ${
          t.tone === "error" ? "bg-red-500" : "bg-parrot"
        }`}
        initial={{ width: "100%" }}
        animate={{ width: 0 }}
        transition={{ duration: duration / 1000, ease: "linear" }}
      />
    </motion.div>
  )
}
export function Toasts() {
  const { state } = useStore()
  return (
    <div
      aria-live="polite"
      className="fixed z-[1100] top-4 left-1/2 -translate-x-1/2 md:left-auto md:translate-x-0 md:right-4 flex flex-col gap-2 pointer-events-none"
    >
      <AnimatePresence>
        {state.toasts.map((t) => (
          <Toast key={t.id} t={t} />
        ))}
      </AnimatePresence>
    </div>
  )
}

// image with fallback chain, ending in a mint block with an icon
export function Img({ srcs, alt, className = "" }) {
  const [i, setI] = useState(0)
  if (i >= srcs.length)
    return (
      <div
        className={`grid place-items-center bg-mint text-parrot-ink ${className}`}
      >
        <PlugZap size={32} />
      </div>
    )
  return (
    <img
      src={srcs[i]}
      alt={alt}
      loading="lazy"
      draggable={false}
      onError={() => setI(i + 1)}
      className={`object-cover ${className}`}
    />
  )
}

export class ErrorBoundary extends Component {
  state = { err: null }
  static getDerivedStateFromError(err) {
    return { err }
  }
  render() {
    if (this.state.err)
      return (
        <div className="min-h-[50vh] grid place-items-center p-8 text-center">
          <div>
            <p className="font-display font-bold text-xl">
              Something hiccuped.
            </p>
            <p className="text-slate mt-1">
              This section failed to render — the rest of PLUG-HOME still works.
            </p>
            <button
              className="mt-4 h-11 px-5 rounded-2xl btn-primary font-bold"
              onClick={() => this.setState({ err: null })}
            >
              Try again
            </button>
          </div>
        </div>
      )
    return this.props.children
  }
}
