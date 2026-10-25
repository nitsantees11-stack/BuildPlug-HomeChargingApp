// @ts-nocheck
import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  ArrowRight,
  Car,
  Home,
  Loader2,
  Check,
  ShieldCheck,
  Zap,
  Leaf,
  ChevronLeft,
  Info,
  Lock,
  Mail,
  BatteryCharging,
  MapPin,
  IndianRupee,
  UserCheck,
  CheckCircle2,
  RefreshCw,
} from "lucide-react"
import { EASE, SPRING } from "../lib"
import { Btn, Logo } from "../ui"
import { useToast } from "../store"
import {
  checkEmailVerificationStatus,
  resendVerificationMail,
  startEmailSignUp,
} from "../lib/supabase"

const word = "PLUG-HOME".split("")

function DriverArt() {
  return (
    <svg viewBox="0 0 320 150" className="w-full h-full">
      <defs>
        <linearGradient id="pg" x1="0" x2="1">
          <stop stopColor="#72D600" />
          <stop offset="1" stopColor="#84CC16" />
        </linearGradient>
      </defs>
      <rect
        x="20"
        y="40"
        width="34"
        height="56"
        rx="8"
        fill="#fff"
        stroke="#D9EFC4"
        strokeWidth="2"
      />
      <motion.circle
        cx="37"
        cy="58"
        r="6"
        fill="#72D600"
        animate={{ opacity: [0.4, 1, 0.4] }}
        transition={{ duration: 1.6, repeat: Infinity }}
      />
      <motion.path
        d="M54 80 C80 120 110 120 128 98"
        stroke="#72D600"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
        animate={{ pathLength: [0, 0, 1, 1, 0] }}
        transition={{
          duration: 6,
          times: [0, 0.25, 0.35, 0.95, 1],
          repeat: Infinity,
        }}
      />
      <motion.g
        animate={{ x: [-140, 0, 0, 0], opacity: [0, 1, 1, 0] }}
        transition={{
          duration: 6,
          times: [0, 0.23, 0.92, 1],
          ease: EASE.out,
          repeat: Infinity,
        }}
      >
        <path
          d="M110 112 L110 96 C110 90 114 87 120 86 L140 82 C150 68 162 62 180 62 L250 62 C266 63 278 72 290 84 L300 88 C306 90 308 94 308 100 L308 112 Z"
          fill="#fff"
          stroke="#CBD5E1"
          strokeWidth="2"
        />
        <path
          d="M146 82 C154 72 164 68 180 68 L214 68 L214 82 Z M220 68 L250 68 C262 69 272 75 282 82 L220 82 Z"
          fill="#E2EBE0"
        />
        {[150, 270].map((cx) => (
          <g key={cx}>
            <circle cx={cx} cy="114" r="15" fill="#0F172A" />
            <circle cx={cx} cy="114" r="7" fill="#fff" />
          </g>
        ))}
        {Array.from({ length: 12 }).map((_, i) => (
          <motion.rect
            key={i}
            x={168 + i * 8.5}
            y="94"
            width="7"
            height="9"
            rx="2"
            animate={{
              fill: ["#EAF6DC", "#EAF6DC", "#F59E0B", "#72D600", "#72D600"],
            }}
            transition={{
              duration: 6,
              times: [0, 0.36 + i * 0.012, 0.4 + i * 0.012, 0.6 + i * 0.01, 1],
              repeat: Infinity,
            }}
          />
        ))}
      </motion.g>
      <motion.g
        animate={{ scale: [0, 0, 1.1, 1, 0], opacity: [0, 0, 1, 1, 0] }}
        transition={{
          duration: 6,
          times: [0, 0.62, 0.68, 0.92, 1],
          repeat: Infinity,
        }}
        style={{ originX: "260px", originY: "30px" }}
      >
        <rect x="224" y="16" width="72" height="28" rx="14" fill="url(#pg)" />
        <text
          x="260"
          y="35"
          textAnchor="middle"
          fontFamily="JetBrains Mono"
          fontWeight="700"
          fontSize="14"
          fill="#0F172A"
        >
          ⚡ 85%
        </text>
      </motion.g>
    </svg>
  )
}

function HostArt() {
  return (
    <svg viewBox="0 0 320 150" className="w-full h-full">
      <defs>
        <linearGradient id="pg2" x1="0" x2="1">
          <stop stopColor="#72D600" />
          <stop offset="1" stopColor="#84CC16" />
        </linearGradient>
      </defs>
      <path
        d="M90 70 L160 22 L230 70 L230 130 L90 130 Z"
        fill="#fff"
        stroke="#D9EFC4"
        strokeWidth="2"
      />
      <path
        d="M80 74 L160 18 L240 74"
        stroke="#3F8F00"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
      />
      <rect x="110" y="86" width="30" height="28" rx="4" fill="#EAF6DC" />
      <rect x="178" y="92" width="26" height="38" rx="4" fill="#EAF6DC" />
      <circle
        cx="160"
        cy="80"
        r="9"
        fill="#fff"
        stroke="#72D600"
        strokeWidth="3"
      />
      <motion.circle
        cx="160"
        cy="80"
        r="9"
        stroke="#72D600"
        strokeWidth="2"
        fill="none"
        animate={{ scale: [1, 2.6], opacity: [0.7, 0] }}
        transition={{ duration: 1.8, repeat: Infinity }}
        style={{ originX: "160px", originY: "80px" }}
      />
      {[0, 1, 2, 3, 4].map((i) => (
        <motion.g
          key={i}
          animate={{
            y: [0, -80],
            x: [0, i % 2 ? 10 : -10, 0],
            opacity: [0, 1, 0],
          }}
          transition={{
            duration: 2.4,
            delay: i * 0.45,
            repeat: Infinity,
            ease: "easeOut",
          }}
        >
          <circle
            cx={150 + i * 5}
            cy="74"
            r="8"
            fill="#F5D547"
            stroke="#E0B400"
            strokeWidth="1.5"
          />
          <text
            x={150 + i * 5}
            y="78"
            textAnchor="middle"
            fontSize="10"
            fontWeight="700"
            fill="#7A5A00"
          >
            ₹
          </text>
        </motion.g>
      ))}
      <rect x="238" y="20" width="76" height="28" rx="14" fill="url(#pg2)" />
      <motion.text
        x="276"
        y="39"
        textAnchor="middle"
        fontFamily="JetBrains Mono"
        fontWeight="700"
        fontSize="13"
        fill="#0F172A"
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        ₹ +222
      </motion.text>
    </svg>
  )
}

const ROLES = {
  driver: {
    icon: Car,
    title: "I am an EV Driver",
    sub: "Find & Charge",
    desc: "Find a home charger near you in seconds.",
    cta: "Continue as Driver",
    Art: DriverArt,
  },
  host: {
    icon: Home,
    title: "I am a Home Host",
    sub: "Share Socket & Earn",
    desc: "Turn your idle plug into passive income.",
    cta: "Continue as Host",
    Art: HostArt,
  },
}

const EV_MODELS = [
  ["Tata Tigor.ev", 26],
  ["Tata Nexon.ev", 40.5],
  ["Tata Punch.ev", 35],
  ["MG ZS EV", 50.3],
  ["MG Comet EV", 17.3],
  ["Mahindra XUV400", 39.4],
]

const DRIVER_PERKS = [
  "Family Verified",
  "CCTV Guarded",
  "Restroom",
  "Shaded canopy",
  "Free Chai",
  "Solar",
]

const HOST_PERKS = [
  "Free Chai",
  "Shaded canopy",
  "Restroom",
  "Solar",
  "Family Verified",
  "CCTV Guarded",
]

function RoleCard({ role, i, onPick }) {
  const r = ROLES[role]
  const [hover, setHover] = useState(false)
  return (
    <motion.button
      layoutId={`card-${role}`}
      onClick={onPick}
      initial={{ y: 60, scale: 0.96, opacity: 0 }}
      animate={{ y: 0, scale: 1, opacity: 1 }}
      exit={{
        opacity: 0,
        filter: "blur(8px)",
        x: role === "driver" ? -60 : 60,
        transition: { duration: 0.35 },
      }}
      transition={{ ...SPRING.soft, delay: 1.1 + i * 0.14 }}
      whileHover={{ y: -8 }}
      whileTap={{ scale: 0.98 }}
      onHoverStart={() => setHover(true)}
      onHoverEnd={() => setHover(false)}
      className="group relative text-left min-h-[340px] rounded-[2rem] bg-white border border-line overflow-hidden shadow-sm hover:shadow-[0_24px_50px_-18px_rgba(114,214,0,.5)] transition-shadow"
    >
      <svg className="pointer-events-none absolute inset-0 w-full h-full z-10">
        <motion.rect
          x="1"
          y="1"
          rx="31"
          fill="none"
          stroke="#72D600"
          strokeWidth="2"
          style={{ width: "calc(100% - 2px)", height: "calc(100% - 2px)" }}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: hover ? 1 : 0 }}
          transition={{ duration: 0.6, ease: EASE.inOut }}
        />
      </svg>
      <div className="h-44 bg-mint px-6 pt-4">
        <r.Art />
      </div>
      <div className="p-6">
        <div className="flex items-center gap-2 text-parrot-ink">
          <r.icon size={18} />
          <span className="text-xs font-bold uppercase tracking-wider">
            {r.sub}
          </span>
        </div>
        <h3 className="mt-1 font-display text-2xl font-extrabold tracking-tight">
          {r.title}
        </h3>
        <p className="text-slate mt-1">{r.desc}</p>
        <div className="mt-4 inline-flex items-center gap-2 font-display font-bold text-parrot-ink">
          {r.cta}{" "}
          <ArrowRight
            size={18}
            className="transition-transform group-hover:translate-x-1.5"
          />
        </div>
      </div>
    </motion.button>
  )
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

function PillOption({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-10 px-3.5 rounded-xl text-xs font-display font-bold border transition-all inline-flex items-center justify-center gap-1.5 ${
        active
          ? "bg-parrot/20 border-parrot text-ink shadow-sm"
          : "bg-mint border-transparent text-slate hover:text-ink"
      }`}
    >
      {active && <Check size={13} className="text-parrot-ink shrink-0" />}
      <span className="truncate">{children}</span>
    </button>
  )
}

function SignIn({ role, onBack, onEnter, onAuth }) {
  const r = ROLES[role]
  const toast = useToast()

  // Mode: "signup" | "signin" | "verify_email" | "verified_success"
  const [mode, setMode] = useState("signup")
  const [step, setStep] = useState(1)
  const [phase, setPhase] = useState("idle")
  const [resending, setResending] = useState(false)
  const [savedOnboardingData, setSavedOnboardingData] = useState(null)

  // Step 1: Common Account Fields
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  // Driver Onboarding State (Steps 2-4)
  const [evModel, setEvModel] = useState("Tata Tigor.ev")
  const [batteryKwh, setBatteryKwh] = useState(26)
  const [regNumber, setRegNumber] = useState("")
  const [currentSoc, setCurrentSoc] = useState(26)
  const [connectorType, setConnectorType] = useState("Both 15A & Type-2")
  const [carriesCable, setCarriesCable] = useState("Yes, in boot")
  const [maxDetourKm, setMaxDetourKm] = useState("2 km")
  const [driverPerks, setDriverPerks] = useState([
    "Family Verified",
    "CCTV Guarded",
  ])
  const [driverUpi, setDriverUpi] = useState("")
  const [emergencyPhone, setEmergencyPhone] = useState("")

  // Host Onboarding State (Steps 2-4)
  const [homeTitle, setHomeTitle] = useState("")
  const [locality, setLocality] = useState("")
  const [propertyType, setPropertyType] = useState("Independent House / Villa")
  const [parkingType, setParkingType] = useState("Inside Gated Driveway")
  const [socketType, setSocketType] = useState("7.2kW Fast")
  const [powerKw, setPowerKw] = useState(7.2)
  const [ratePerKwh, setRatePerKwh] = useState(12)
  const [availabilitySlot, setAvailabilitySlot] = useState("24×7 Anytime")
  const [meterType, setMeterType] = useState("Dedicated Sub-Meter")
  const [mcbVerified, setMcbVerified] = useState(true)
  const [earthingVerified, setEarthingVerified] = useState(true)
  const [hostPerks, setHostPerks] = useState([
    "Free Chai",
    "Shaded canopy",
    "Family Verified",
  ])
  const [hostUpi, setHostUpi] = useState("")

  const toggleItem = (list, setList, item) => {
    setList((prev) =>
      prev.includes(item) ? prev.filter((x) => x !== item) : [...prev, item],
    )
  }

  // Auto-poll every 3.5 seconds while waiting for the user to click the link in their email
  useEffect(() => {
    if (mode !== "verify_email") return
    let active = true
    const timer = setInterval(async () => {
      try {
        const res = await checkEmailVerificationStatus({
          email,
          password,
          name: name.trim(),
          role,
          phone,
          onboarding: savedOnboardingData,
        })
        if (active && res?.verified && res?.user) {
          clearInterval(timer)
          setMode("verified_success")
          toast(
            "Email verified!",
            "Redirecting you to your PLUG-HOME cockpit...",
          )
          await wait(1400)
          onEnter({
            role,
            name: res.user.name,
            phone: res.user.phone,
            userId: res.user.id,
            onboarding: savedOnboardingData,
            x: window.innerWidth / 2,
            y: window.innerHeight / 2,
          })
        }
      } catch {
        /* keep polling quietly until user clicks email link */
      }
    }, 3500)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [mode, email, password, name, role, phone, savedOnboardingData])

  const stepTitles =
    role === "driver"
      ? [
          "Account & Email Setup",
          "Your EV Vehicle Specs",
          "Charger & Cable Setup",
          "Safety & Billing Prefs",
        ]
      : [
          "Host Account & Email",
          "Home & Driveway Details",
          "Socket, Power & Tariff",
          "Safety & UPI Payouts",
        ]

  const validateCurrentStep = () => {
    const cleanName = name.trim().replace(/\s+/g, " ")
    if (mode === "signin") {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        toast("Enter your email", "Use the email you verified with Supabase.", {
          tone: "warn",
        })
        return false
      }
      if (!password || password.length < 6) {
        toast("Enter your password", "Password must be at least 6 characters.", {
          tone: "warn",
        })
        return false
      }
      return true
    }

    if (step === 1) {
      if (cleanName.length < 2) {
        toast("Add your full name", "Hosts and drivers see it on bookings.", {
          tone: "warn",
        })
        return false
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        toast(
          "Valid email required",
          "Supabase will send a verification link to this email.",
          { tone: "warn" },
        )
        return false
      }
      if (!password || password.length < 6) {
        toast(
          "Create a password (min 6 chars)",
          "You'll use this with your verified email.",
          { tone: "warn" },
        )
        return false
      }
      if (phone && !/^[6-9]\d{9}$/.test(phone)) {
        toast(
          "Check your mobile number",
          "Enter a valid 10-digit Indian mobile number.",
          { tone: "warn" },
        )
        return false
      }
    }

    if (step === 2 && role === "host") {
      if (homeTitle.trim().length < 3) {
        toast("Name your home socket", "e.g. Sharma Villa Driveway", {
          tone: "warn",
        })
        return false
      }
      if (locality.trim().length < 3) {
        toast("Add your sector or area", "e.g. Sector 62, Noida", {
          tone: "warn",
        })
        return false
      }
    }

    if (step === 4 && role === "host") {
      if (!mcbVerified || !earthingVerified) {
        toast(
          "Confirm electrical safety",
          "MCB cut-off and proper earthing are required.",
          { tone: "warn" },
        )
        return false
      }
    }

    return true
  }

  const nextStep = () => {
    if (!validateCurrentStep()) return
    setStep((s) => Math.min(4, s + 1))
  }

  const buildOnboardingPayload = (cleanName) =>
    role === "driver"
      ? {
          evModel,
          batteryKwh: Number(batteryKwh) || 26,
          regNumber: regNumber.trim().toUpperCase() || "DL01EV2026",
          currentSoc: Number(currentSoc) || 26,
          connectorType,
          carriesCable,
          maxDetourKm,
          preferredPerks: driverPerks,
          upiId: driverUpi.trim(),
          emergencyPhone: emergencyPhone.trim(),
          completedAt: new Date().toISOString(),
        }
      : {
          homeTitle: homeTitle.trim() || `${cleanName}'s Home Socket`,
          locality: locality.trim() || "Sector 62, Noida",
          propertyType,
          parkingType,
          socketType,
          powerKw: Number(powerKw) || 7.2,
          ratePerKwh: Number(ratePerKwh) || 12,
          availabilitySlot,
          meterType,
          mcbVerified,
          earthingVerified,
          perks: hostPerks,
          upiId: hostUpi.trim(),
          completedAt: new Date().toISOString(),
        }

  const submit = async (e) => {
    if (!validateCurrentStep()) return
    const cleanName = name.trim().replace(/\s+/g, " ") || email.split("@")[0]
    const onboarding = buildOnboardingPayload(cleanName)
    setSavedOnboardingData(onboarding)

    const rect = e.currentTarget.getBoundingClientRect()
    setPhase("load")

    // SIGN IN FLOW (Existing Verified User)
    if (mode === "signin") {
      const auth = await onAuth({
        role,
        name: cleanName,
        phone,
        email: email.trim(),
        password,
        onboarding,
      })
      if (!auth) return setPhase("idle")
      setPhase("done")
      await wait(300)
      onEnter({
        name: auth.name || cleanName,
        phone: auth.phone || phone,
        userId: auth.userId,
        onboarding,
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      })
      return
    }

    // SIGN UP FLOW -> SEND SUPABASE VERIFICATION EMAIL
    try {
      const res = await startEmailSignUp({
        name: cleanName,
        role,
        phone,
        email: email.trim(),
        password,
        onboarding,
      })
      setPhase("idle")

      if (res.status === "verified" && res.user) {
        setMode("verified_success")
        await wait(1200)
        onEnter({
          name: res.user.name,
          phone: res.user.phone,
          userId: res.user.id,
          onboarding,
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        })
        return
      }

      // Show "Check Your Inbox for Verification Link" screen
      setMode("verify_email")
      toast(
        "Verification email sent!",
        `Check ${email.trim()} and click the verification link.`,
      )
    } catch (err) {
      setPhase("idle")
      toast(
        "Couldn't send verification email",
        err?.message || "Please check your email and try again.",
        { tone: "error" },
      )
    }
  }

  const handleManualCheckVerified = async (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setPhase("load")
    try {
      const res = await checkEmailVerificationStatus({
        email,
        password,
        name: name.trim(),
        role,
        phone,
        onboarding: savedOnboardingData,
      })
      if (!res?.verified) {
        setPhase("idle")
        return toast(
          "Not verified yet",
          "Please click the verification link in your email inbox first.",
          { tone: "warn" },
        )
      }
      setPhase("done")
      setMode("verified_success")
      await wait(1200)
      onEnter({
        role,
        name: res.user.name,
        phone: res.user.phone,
        userId: res.user.id,
        onboarding: savedOnboardingData,
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      })
    } catch (err) {
      setPhase("idle")
      toast("Verification check failed", err?.message || "Please try again.", {
        tone: "error",
      })
    }
  }

  const handleResend = async () => {
    setResending(true)
    try {
      await resendVerificationMail(email)
      toast("Verification link resent!", `Sent again to ${email.trim()}`)
    } catch (err) {
      toast("Couldn't resend email", err?.message || "Please wait a moment.", {
        tone: "error",
      })
    } finally {
      setResending(false)
    }
  }

  return (
    <motion.div
      layoutId={`card-${role}`}
      transition={SPRING.soft}
      className="w-full max-w-lg mx-auto rounded-[2rem] bg-white border border-line shadow-[0_24px_50px_-18px_rgba(114,214,0,.45)] p-6 sm:p-7"
    >
      {/* ================= SCREEN A: VERIFIED SUCCESS BANNER ================= */}
      {mode === "verified_success" && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="py-8 text-center space-y-4"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={SPRING.bouncy}
            className="h-16 w-16 rounded-full bg-parrot/20 text-parrot-ink mx-auto grid place-items-center"
          >
            <CheckCircle2 size={36} className="text-parrot-ink" />
          </motion.div>
          <h3 className="font-display text-2xl font-extrabold text-ink">
            Email Verified Successfully!
          </h3>
          <p className="text-sm text-slate max-w-sm mx-auto">
            Your Supabase account is verified. Redirecting you to your{" "}
            <strong className="text-ink">
              {role === "host" ? "Home Host Cockpit" : "EV Driver Map"}
            </strong>
            …
          </p>
          <div className="flex justify-center pt-2">
            <Loader2 className="animate-spin text-parrot-ink" size={24} />
          </div>
        </motion.div>
      )}

      {/* ================= SCREEN B: WAITING FOR EMAIL VERIFICATION ================= */}
      {mode === "verify_email" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-5"
        >
          <button
            type="button"
            onClick={() => setMode("signup")}
            className="inline-flex items-center gap-1 text-sm font-medium text-slate hover:text-ink"
          >
            <ChevronLeft size={16} /> Edit email
          </button>

          <div className="text-center space-y-2">
            <div className="h-14 w-14 rounded-2xl btn-primary mx-auto grid place-items-center shadow-sm">
              <Mail size={26} />
            </div>
            <p className="text-xs font-bold uppercase tracking-wider text-parrot-ink">
              Supabase Email Verification
            </p>
            <h3 className="font-display text-2xl font-extrabold">
              Check your inbox
            </h3>
            <p className="text-sm text-slate">
              We sent a verification link to{" "}
              <span className="font-mono font-bold text-ink">{email}</span>
            </p>
          </div>

          <div className="rounded-2xl bg-mint p-4 text-xs text-slate space-y-2 border border-line/60">
            <p className="font-bold text-ink flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-parrot animate-ping" />
              Waiting for you to click the link in your email…
            </p>
            <p>
              1. Open your email inbox (check Spam/Promotions if needed).
              <br />
              2. Click <strong>"Confirm your mail"</strong> in the Supabase
              email.
              <br />
              3. You will be automatically verified and redirected to PLUG-HOME!
            </p>
          </div>

          <div className="space-y-2.5">
            <Btn
              type="button"
              onClick={handleManualCheckVerified}
              className="w-full"
              magnetic
              disabled={phase !== "idle"}
            >
              {phase === "load" ? (
                <Loader2 className="animate-spin" size={20} />
              ) : (
                <>
                  I've Verified My Email — Continue <ArrowRight size={18} />
                </>
              )}
            </Btn>

            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              className="w-full h-11 rounded-xl bg-mint hover:bg-mint-2 text-xs font-display font-bold text-ink inline-flex items-center justify-center gap-2 transition-colors"
            >
              <RefreshCw
                size={14}
                className={resending ? "animate-spin" : ""}
              />
              {resending
                ? "Sending again…"
                : "Didn't get the mail? Resend Verification Link"}
            </button>
          </div>
        </motion.div>
      )}

      {/* ================= SCREEN C: SIGN UP (4 STEPS) OR SIGN IN ================= */}
      {(mode === "signup" || mode === "signin") && (
        <>
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                if (mode === "signup" && step > 1) setStep((s) => s - 1)
                else onBack()
              }}
              className="inline-flex items-center gap-1 text-sm font-medium text-slate hover:text-ink"
            >
              <ChevronLeft size={16} />
              {mode === "signup" && step > 1
                ? `Back to Step ${step - 1}`
                : "Roles"}
            </button>

            <div className="inline-flex rounded-full bg-mint p-1 border border-line/60">
              <button
                type="button"
                onClick={() => {
                  setMode("signup")
                  setStep(1)
                }}
                className={`h-8 px-3 rounded-full text-xs font-display font-bold transition-all ${
                  mode === "signup"
                    ? "bg-white text-ink shadow-sm"
                    : "text-slate hover:text-ink"
                }`}
              >
                New Account
              </button>
              <button
                type="button"
                onClick={() => setMode("signin")}
                className={`h-8 px-3 rounded-full text-xs font-display font-bold transition-all ${
                  mode === "signin"
                    ? "bg-white text-ink shadow-sm"
                    : "text-slate hover:text-ink"
                }`}
              >
                Sign In
              </button>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl btn-primary grid place-items-center shrink-0">
              <r.icon size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-wider text-parrot-ink">
                {mode === "signin"
                  ? `${r.sub} · Verified Sign In`
                  : `Step ${step} of 4 · ${stepTitles[step - 1]}`}
              </p>
              <h3 className="font-display text-xl font-extrabold truncate">
                {r.title}
              </h3>
            </div>
          </div>

          {mode === "signup" && (
            <div className="mt-4 grid grid-cols-4 gap-1.5">
              {[1, 2, 3, 4].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => {
                    if (n < step) setStep(n)
                  }}
                  className={`h-2 rounded-full transition-all ${
                    n <= step ? "bg-parrot" : "bg-mint-2"
                  }`}
                  aria-label={`Step ${n}`}
                />
              ))}
            </div>
          )}

          <AnimatePresence mode="wait">
            {(mode === "signin" || step === 1) && (
              <motion.div
                key={mode === "signin" ? "signin-form" : "step-1"}
                initial={{ opacity: 0, x: 14 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -14 }}
                transition={{ duration: 0.22, ease: EASE.out }}
                className="mt-5 space-y-3.5"
              >
                {mode === "signup" && (
                  <label className="block text-sm font-medium">
                    Your full name
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value.slice(0, 60))}
                      autoComplete="name"
                      required
                      placeholder={
                        role === "host"
                          ? "e.g. Sunita Sharma"
                          : "e.g. Aarav Mehta"
                      }
                      className="mt-1.5 w-full h-11 rounded-xl bg-mint px-4 border border-transparent outline-none focus:border-parrot focus:ring-4 focus:ring-parrot/20"
                    />
                  </label>
                )}

                <div className="grid sm:grid-cols-2 gap-3">
                  <label className="block text-sm font-medium">
                    Email address <span className="text-parrot-ink">*</span>
                    <div className="mt-1.5 relative">
                      <Mail
                        size={15}
                        className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate"
                      />
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@gmail.com"
                        className="w-full h-11 rounded-xl bg-mint pl-9 pr-3 text-sm border border-transparent outline-none focus:border-parrot focus:ring-4 focus:ring-parrot/20"
                      />
                    </div>
                  </label>

                  <label className="block text-sm font-medium">
                    Password <span className="text-parrot-ink">*</span>
                    <div className="mt-1.5 relative">
                      <Lock
                        size={15}
                        className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate"
                      />
                      <input
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Min 6 characters"
                        className="w-full h-11 rounded-xl bg-mint pl-9 pr-3 text-sm border border-transparent outline-none focus:border-parrot focus:ring-4 focus:ring-parrot/20"
                      />
                    </div>
                  </label>
                </div>

                {mode === "signup" && (
                  <label className="block text-sm font-medium">
                    Mobile number{" "}
                    <span className="text-mute font-normal">(optional)</span>
                    <div className="mt-1.5 flex gap-2">
                      <span className="h-11 px-3 rounded-xl bg-mint-2 grid place-items-center font-mono font-bold text-sm">
                        +91
                      </span>
                      <input
                        inputMode="numeric"
                        autoComplete="tel-national"
                        value={phone}
                        onChange={(e) =>
                          setPhone(
                            e.target.value.replace(/\D/g, "").slice(0, 10),
                          )
                        }
                        placeholder="98XXXXXX10"
                        className="flex-1 min-w-0 h-11 rounded-xl bg-mint px-4 font-mono border border-transparent outline-none focus:border-parrot focus:ring-4 focus:ring-parrot/20"
                      />
                    </div>
                  </label>
                )}

                <p className="flex gap-2 rounded-xl bg-mint p-3 text-xs text-slate">
                  <Info size={15} className="mt-px shrink-0 text-parrot-ink" />
                  <span>
                    {mode === "signin"
                      ? "Sign in with your verified email & password."
                      : "After completing the 4 steps, Supabase will send a verification link to your email before redirecting you into the app."}
                  </span>
                </p>
              </motion.div>
            )}

            {/* DRIVER STEP 2 */}
            {mode === "signup" && step === 2 && role === "driver" && (
              <motion.div
                key="driver-step-2"
                initial={{ opacity: 0, x: 14 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -14 }}
                transition={{ duration: 0.22, ease: EASE.out }}
                className="mt-5 space-y-4"
              >
                <div>
                  <span className="block text-sm font-medium mb-2">
                    Select your EV model
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {EV_MODELS.map(([m, kwh]) => (
                      <PillOption
                        key={m}
                        active={evModel === m}
                        onClick={() => {
                          setEvModel(m)
                          setBatteryKwh(kwh)
                        }}
                      >
                        {m}
                      </PillOption>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-sm font-medium">
                    Battery size (kWh)
                    <input
                      type="number"
                      step="0.5"
                      min="5"
                      max="120"
                      value={batteryKwh}
                      onChange={(e) => setBatteryKwh(e.target.value)}
                      className="mt-1.5 w-full h-11 rounded-xl bg-mint px-3.5 font-mono text-sm border border-transparent outline-none focus:border-parrot"
                    />
                  </label>

                  <label className="block text-sm font-medium">
                    Vehicle Reg. Plate
                    <input
                      value={regNumber}
                      onChange={(e) =>
                        setRegNumber(e.target.value.toUpperCase())
                      }
                      placeholder="DL 01 EV 4021"
                      className="mt-1.5 w-full h-11 rounded-xl bg-mint px-3.5 font-mono text-sm uppercase border border-transparent outline-none focus:border-parrot"
                    />
                  </label>
                </div>

                <div className="rounded-2xl bg-mint p-3.5">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="inline-flex items-center gap-1.5 text-parrot-ink">
                      <BatteryCharging size={15} /> Current Battery Charge (SoC)
                    </span>
                    <span className="font-mono text-sm text-ink">
                      {currentSoc}% · ~{Math.round(currentSoc * 2.7)} km range
                    </span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="95"
                    value={currentSoc}
                    onChange={(e) => setCurrentSoc(Number(e.target.value))}
                    className="mt-2 w-full accent-[#72D600]"
                  />
                </div>
              </motion.div>
            )}

            {/* DRIVER STEP 3 */}
            {mode === "signup" && step === 3 && role === "driver" && (
              <motion.div
                key="driver-step-3"
                initial={{ opacity: 0, x: 14 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -14 }}
                transition={{ duration: 0.22, ease: EASE.out }}
                className="mt-5 space-y-4"
              >
                <div>
                  <span className="block text-sm font-medium mb-2">
                    Supported charging socket on your EV
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    {["15A Plug", "7.2kW Fast", "Both 15A & Type-2"].map(
                      (c) => (
                        <PillOption
                          key={c}
                          active={connectorType === c}
                          onClick={() => setConnectorType(c)}
                        >
                          {c}
                        </PillOption>
                      ),
                    )}
                  </div>
                </div>

                <div>
                  <span className="block text-sm font-medium mb-2">
                    Do you carry your portable 15A charging cable in the car
                    boot?
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {["Yes, in boot", "No, need host cable"].map((c) => (
                      <PillOption
                        key={c}
                        active={carriesCable === c}
                        onClick={() => setCarriesCable(c)}
                      >
                        {c}
                      </PillOption>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="block text-sm font-medium mb-2">
                    Maximum detour you prefer for a home socket
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    {["Within 1 km", "2 km", "Up to 5 km"].map((d) => (
                      <PillOption
                        key={d}
                        active={maxDetourKm === d}
                        onClick={() => setMaxDetourKm(d)}
                      >
                        {d}
                      </PillOption>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {/* DRIVER STEP 4 */}
            {mode === "signup" && step === 4 && role === "driver" && (
              <motion.div
                key="driver-step-4"
                initial={{ opacity: 0, x: 14 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -14 }}
                transition={{ duration: 0.22, ease: EASE.out }}
                className="mt-5 space-y-4"
              >
                <div>
                  <span className="block text-sm font-medium mb-2">
                    Preferred host safety & hospitality perks
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {DRIVER_PERKS.map((p) => (
                      <PillOption
                        key={p}
                        active={driverPerks.includes(p)}
                        onClick={() =>
                          toggleItem(driverPerks, setDriverPerks, p)
                        }
                      >
                        {p}
                      </PillOption>
                    ))}
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <label className="block text-sm font-medium">
                    Your UPI ID{" "}
                    <span className="text-mute font-normal text-xs">
                      (optional)
                    </span>
                    <input
                      value={driverUpi}
                      onChange={(e) => setDriverUpi(e.target.value)}
                      placeholder="aarav@okaxis"
                      className="mt-1.5 w-full h-11 rounded-xl bg-mint px-3.5 font-mono text-sm border border-transparent outline-none focus:border-parrot"
                    />
                  </label>

                  <label className="block text-sm font-medium">
                    Emergency Contact{" "}
                    <span className="text-mute font-normal text-xs">
                      (optional)
                    </span>
                    <input
                      inputMode="numeric"
                      value={emergencyPhone}
                      onChange={(e) =>
                        setEmergencyPhone(
                          e.target.value.replace(/\D/g, "").slice(0, 10),
                        )
                      }
                      placeholder="98XXXXXX00"
                      className="mt-1.5 w-full h-11 rounded-xl bg-mint px-3.5 font-mono text-sm border border-transparent outline-none focus:border-parrot"
                    />
                  </label>
                </div>

                <div className="rounded-xl bg-mint p-3 text-xs text-slate flex items-center gap-2">
                  <UserCheck size={16} className="text-parrot-ink shrink-0" />
                  <span>
                    Clicking below sends a verification email to{" "}
                    <strong>{email || "your inbox"}</strong>.
                  </span>
                </div>
              </motion.div>
            )}

            {/* HOST STEP 2 */}
            {mode === "signup" && step === 2 && role === "host" && (
              <motion.div
                key="host-step-2"
                initial={{ opacity: 0, x: 14 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -14 }}
                transition={{ duration: 0.22, ease: EASE.out }}
                className="mt-5 space-y-3.5"
              >
                <label className="block text-sm font-medium">
                  Home / Driveway Listing Title
                  <input
                    value={homeTitle}
                    onChange={(e) => setHomeTitle(e.target.value)}
                    placeholder="e.g. Sharma Villa Solar Driveway"
                    className="mt-1.5 w-full h-11 rounded-xl bg-mint px-4 border border-transparent outline-none focus:border-parrot"
                  />
                </label>

                <label className="block text-sm font-medium">
                  Sector / Locality / Landmark
                  <div className="mt-1.5 relative">
                    <MapPin
                      size={15}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-parrot-ink"
                    />
                    <input
                      value={locality}
                      onChange={(e) => setLocality(e.target.value)}
                      placeholder="e.g. Sector 62, Noida (Near Metro Gate 2)"
                      className="w-full h-11 rounded-xl bg-mint pl-9 pr-4 border border-transparent outline-none focus:border-parrot"
                    />
                  </div>
                </label>

                <div>
                  <span className="block text-sm font-medium mb-1.5">
                    Property Type
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      "Independent House / Villa",
                      "Ground Floor Flat",
                      "Society Parking",
                      "Highway Shop / Dhaba",
                    ].map((pt) => (
                      <PillOption
                        key={pt}
                        active={propertyType === pt}
                        onClick={() => setPropertyType(pt)}
                      >
                        {pt}
                      </PillOption>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="block text-sm font-medium mb-1.5">
                    Driver Parking Access
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      "Inside Gated Driveway",
                      "Covered Carport / Front Gate",
                    ].map((pk) => (
                      <PillOption
                        key={pk}
                        active={parkingType === pk}
                        onClick={() => setParkingType(pk)}
                      >
                        {pk}
                      </PillOption>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {/* HOST STEP 3 */}
            {mode === "signup" && step === 3 && role === "host" && (
              <motion.div
                key="host-step-3"
                initial={{ opacity: 0, x: 14 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -14 }}
                transition={{ duration: 0.22, ease: EASE.out }}
                className="mt-5 space-y-4"
              >
                <div>
                  <span className="block text-sm font-medium mb-2">
                    Socket / Charger Type Installed at Home
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      ["15A Plug", 3.3],
                      ["7.2kW Fast", 7.2],
                      ["11kW AC", 11.0],
                    ].map(([st, kw]) => (
                      <PillOption
                        key={st}
                        active={socketType === st}
                        onClick={() => {
                          setSocketType(st)
                          setPowerKw(kw)
                        }}
                      >
                        {st} ({kw}kW)
                      </PillOption>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl bg-mint p-3.5">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="inline-flex items-center gap-1 text-parrot-ink">
                      <IndianRupee size={14} /> Your Tariff Rate per Unit (kWh)
                    </span>
                    <span className="font-mono text-sm text-ink">
                      ₹{ratePerKwh} / kWh · Est. ₹{ratePerKwh * 950}/mo
                    </span>
                  </div>
                  <input
                    type="range"
                    min="8"
                    max="20"
                    value={ratePerKwh}
                    onChange={(e) => setRatePerKwh(Number(e.target.value))}
                    className="mt-2 w-full accent-[#72D600]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="block text-xs font-bold uppercase text-slate mb-1.5">
                      Available Hours
                    </span>
                    <div className="grid gap-1.5">
                      {["24×7 Anytime", "Daytime 8AM–8PM", "Night 9PM–7AM"].map(
                        (slot) => (
                          <PillOption
                            key={slot}
                            active={availabilitySlot === slot}
                            onClick={() => setAvailabilitySlot(slot)}
                          >
                            {slot}
                          </PillOption>
                        ),
                      )}
                    </div>
                  </div>

                  <div>
                    <span className="block text-xs font-bold uppercase text-slate mb-1.5">
                      Meter Verification
                    </span>
                    <div className="grid gap-1.5">
                      {[
                        "Dedicated Sub-Meter",
                        "Main Digital Meter",
                        "Smart Plug App",
                      ].map((m) => (
                        <PillOption
                          key={m}
                          active={meterType === m}
                          onClick={() => setMeterType(m)}
                        >
                          {m}
                        </PillOption>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* HOST STEP 4 */}
            {mode === "signup" && step === 4 && role === "host" && (
              <motion.div
                key="host-step-4"
                initial={{ opacity: 0, x: 14 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -14 }}
                transition={{ duration: 0.22, ease: EASE.out }}
                className="mt-5 space-y-3.5"
              >
                <div>
                  <span className="block text-sm font-medium mb-2">
                    Hospitality perks available for visiting drivers
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {HOST_PERKS.map((p) => (
                      <PillOption
                        key={p}
                        active={hostPerks.includes(p)}
                        onClick={() => toggleItem(hostPerks, setHostPerks, p)}
                      >
                        {p}
                      </PillOption>
                    ))}
                  </div>
                </div>

                <div className="space-y-2 rounded-2xl bg-mint p-3.5 text-xs">
                  <label className="flex items-center gap-2.5 cursor-pointer font-semibold text-ink">
                    <input
                      type="checkbox"
                      checked={mcbVerified}
                      onChange={(e) => setMcbVerified(e.target.checked)}
                      className="h-4 w-4 rounded accent-[#72D600]"
                    />
                    32A MCB / RCCB auto-cut breaker is installed on this line
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer font-semibold text-ink">
                    <input
                      type="checkbox"
                      checked={earthingVerified}
                      onChange={(e) => setEarthingVerified(e.target.checked)}
                      className="h-4 w-4 rounded accent-[#72D600]"
                    />
                    Proper earthing & weatherproof socket enclosure verified
                  </label>
                </div>

                <label className="block text-sm font-medium">
                  Host UPI ID for instant bill settlement{" "}
                  <span className="text-mute font-normal text-xs">
                    (optional)
                  </span>
                  <input
                    value={hostUpi}
                    onChange={(e) => setHostUpi(e.target.value)}
                    placeholder="sunita.sharma@okicici"
                    className="mt-1.5 w-full h-11 rounded-xl bg-mint px-4 font-mono text-sm border border-transparent outline-none focus:border-parrot"
                  />
                </label>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-6">
            {mode === "signup" && step < 4 ? (
              <Btn type="button" onClick={nextStep} className="w-full" magnetic>
                Continue to Step {step + 1} <ArrowRight size={18} />
              </Btn>
            ) : (
              <Btn
                type="button"
                onClick={submit}
                className="w-full"
                magnetic
                disabled={phase !== "idle"}
              >
                {phase === "idle" && (
                  <>
                    {mode === "signin"
                      ? "Sign In to Cockpit"
                      : "Send Verification Email & Verify"}{" "}
                    <ArrowRight size={18} />
                  </>
                )}
                {phase === "load" && (
                  <Loader2 className="animate-spin" size={20} />
                )}
                {phase === "done" && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={SPRING.bouncy}
                  >
                    <Check size={22} />
                  </motion.span>
                )}
              </Btn>
            )}
          </div>
        </>
      )}
    </motion.div>
  )
}

function JudgeDemo({ onDemo, role }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 1.6, ease: EASE.out }}
      className="mt-6 flex flex-col items-center gap-1.5"
    >
      <button
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          onDemo({
            role,
            x: r.left + r.width / 2,
            y: r.top + r.height / 2,
          })
        }}
        className="shimmer h-11 px-5 rounded-full bg-white border border-amber/50 text-sm font-display font-bold inline-flex items-center gap-2 hover:bg-amber/10 transition-colors"
      >
        <Zap size={16} className="text-amber" />
        Judge Demo — skip login
      </button>
      <span className="text-xs text-mute">
        Simulated on this device only — nothing is saved to the server.
      </span>
    </motion.div>
  )
}

export default function Login({ onEnter, onAuth, onDemo }) {
  const [picked, setPicked] = useState(null)
  const words = ["Your", "neighbour's", "socket."]
  const words2 = ["Your", "next", "charge."]
  return (
    <div className="relative min-h-screen flex flex-col">
      <main className="flex-1 w-full max-w-5xl mx-auto px-5 pt-12 md:pt-16 pb-10 flex flex-col items-center">
        <div className="flex items-center gap-3">
          <Logo size={44} draw />
          <span className="font-display font-extrabold text-2xl tracking-[-0.02em] flex overflow-hidden">
            {word.map((c, i) => (
              <motion.span
                key={i}
                className={c === "-" ? "text-parrot" : ""}
                initial={{ y: 24, opacity: 0, filter: "blur(6px)" }}
                animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
                transition={{
                  delay: 0.3 + i * 0.04,
                  ease: EASE.out,
                  duration: 0.6,
                }}
              >
                {c}
              </motion.span>
            ))}
          </span>
        </div>
        <h1
          className="mt-8 text-center font-display font-extrabold tracking-[-0.03em] leading-[1.05]"
          style={{ fontSize: "clamp(2.4rem, 6vw, 4.5rem)" }}
        >
          <span className="block">
            {words.map((w, i) => (
              <span
                key={i}
                className="inline-block overflow-hidden align-bottom mr-[0.25em] last:mr-0"
              >
                <motion.span
                  className="inline-block"
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  transition={{
                    delay: 0.7 + i * 0.08,
                    duration: 0.7,
                    ease: EASE.out,
                  }}
                >
                  {w}
                </motion.span>
              </span>
            ))}
          </span>
          <motion.span
            className="marker-hl inline-block px-2"
            initial={{ backgroundSize: "0% 100%" }}
            animate={{ backgroundSize: "100% 100%" }}
            transition={{ delay: 1.05, duration: 0.6, ease: EASE.inOut }}
          >
            {words2.map((w, i) => (
              <span
                key={i}
                className="inline-block overflow-hidden align-bottom mr-[0.25em] last:mr-0"
              >
                <motion.span
                  className="inline-block"
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  transition={{
                    delay: 0.94 + i * 0.08,
                    duration: 0.7,
                    ease: EASE.out,
                  }}
                >
                  {w}
                </motion.span>
              </span>
            ))}
          </motion.span>
        </h1>
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1 }}
          className="mt-4 text-slate text-lg"
        >
          Padosi ka plug, aapki battery.
        </motion.p>

        <div className="mt-10 w-full">
          <AnimatePresence mode="popLayout">
            {!picked ? (
              <motion.div key="cards" className="grid md:grid-cols-2 gap-5">
                <RoleCard
                  role="driver"
                  i={0}
                  onPick={() => setPicked("driver")}
                />
                <RoleCard role="host" i={1} onPick={() => setPicked("host")} />
              </motion.div>
            ) : (
              <SignIn
                key="signin"
                role={picked}
                onBack={() => setPicked(null)}
                onAuth={onAuth}
                onEnter={(d) => onEnter({ role: picked, ...d })}
              />
            )}
          </AnimatePresence>
          {onDemo && <JudgeDemo onDemo={onDemo} role={picked || "driver"} />}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2.2 }}
          className="mt-8 flex flex-wrap justify-center gap-2"
        >
          {[
            [ShieldCheck, "Meter-verified bills"],
            [Zap, "Live booking updates"],
            [Leaf, "CO₂ estimate on every receipt"],
          ].map(([I, t]) => (
            <span
              key={t}
              className="h-9 px-4 rounded-full bg-mint text-sm font-semibold inline-flex items-center gap-2"
            >
              <I size={15} className="text-parrot-ink" />
              {t}
            </span>
          ))}
        </motion.div>
      </main>
      <footer className="pb-6 text-center text-xs text-mute">
        Made for India
      </footer>
    </div>
  )
}
