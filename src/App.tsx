// @ts-nocheck
import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  BatteryCharging,
  Camera,
  Check,
  CheckCircle2,
  Cloud,
  Compass,
  Download,
  FileText,
  History,
  Home,
  Inbox,
  Leaf,
  Loader2,
  LogOut,
  Map as MapIcon,
  MapPin,
  Menu,
  PhoneCall,
  PlusCircle,
  RefreshCw,
  Save,
  Settings,
  ShieldCheck,
  Sliders,
  Trash2,
  User,
  WifiOff,
  X,
  Zap,
} from "lucide-react"
import { EASE, SPRING, co2, fetchRoute, hasLoc } from "./lib"
import { StoreProvider, useStore, useToast } from "./store"
import { Btn, ErrorBoundary, Logo, Toasts, Wordmark } from "./ui"
import Login from "./screens/Login"
import DriverFind from "./screens/DriverFind"
import DriverCharge from "./screens/DriverCharge"
import { HostBookings, HostList, HostOverview } from "./screens/Host"
import Proof from "./screens/Proof"
import { LiveNotifier } from "./screens/LiveMeter"
import {
  checkEmailRedirectCallback,
  getSavedOnboarding,
  isLive,
  signInAs,
  signOut,
} from "./lib/supabase"
import {
  probeBackend,
  resetLive,
  setJudgeMode,
  useBookings,
  useHosts,
  useRealtimeStatus,
} from "./lib/live"
import { revokeDemoMedia } from "./demo"

const TABS = {
  driver: [
    ["find", "Find Chargers", MapIcon],
    ["charge", "My Charge", Zap],
    ["proof", "ProofEngine", Cloud],
  ],
  host: [
    ["overview", "Overview", Home],
    ["list", "List My Socket", PlusCircle],
    ["bookings", "Bookings & Proof", Inbox],
    ["proof", "ProofEngine", Cloud],
  ],
}

const EV_MODELS = [
  ["Tata Tigor.ev", 26],
  ["Tata Nexon.ev", 40.5],
  ["Tata Punch.ev", 35],
  ["MG ZS EV", 50.3],
  ["MG Comet EV", 17.3],
  ["Mahindra XUV400", 39.4],
]

const ALL_PERKS = [
  "Family Verified",
  "CCTV Guarded",
  "Restroom",
  "Shaded canopy",
  "Free Chai",
  "Solar",
]

// Sync updated onboarding details back into any matching localStorage keys used by supabase.js
function syncOnboardingStorage(userId, role, updatedDetails) {
  if (typeof window === "undefined") return
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (
        k &&
        (k.includes("onboarding") || (userId && k.includes(String(userId))))
      ) {
        try {
          const parsed = JSON.parse(localStorage.getItem(k))
          if (parsed && typeof parsed === "object") {
            localStorage.setItem(
              k,
              JSON.stringify({ ...parsed, ...updatedDetails }),
            )
          }
        } catch {}
      }
    }
  } catch {}
}

function DemoPill() {
  return (
    <span
      role="status"
      title="Judge demo — simulated on this device, nothing is sent to the server"
      className="h-7 px-2.5 rounded-full bg-amber/15 text-[11px] font-bold inline-flex items-center gap-1.5"
    >
      <span aria-hidden className="h-2 w-2 rounded-full bg-amber" />
      <span className="hidden sm:inline">Judge demo</span>
      <span className="sr-only sm:hidden">Judge demo · simulated</span>
    </span>
  )
}

function RealtimePill() {
  const rt = useRealtimeStatus()
  const live = rt === "live"
  return (
    <span
      role="status"
      title={
        live
          ? "Realtime connected — updates arrive instantly"
          : "Connecting to realtime — updates may take a few seconds"
      }
      className="h-7 px-2.5 rounded-full bg-mint text-[11px] font-bold inline-flex items-center gap-1.5"
    >
      <span
        aria-hidden
        className={`h-2 w-2 rounded-full ${
          live ? "bg-parrot" : "bg-amber animate-pulse"
        }`}
      />
      <span className="hidden sm:inline">{live ? "Live" : "Connecting…"}</span>
      <span className="sr-only sm:hidden">
        {live ? "Realtime connected" : "Connecting to realtime"}
      </span>
    </span>
  )
}

function SideDrawer({
  open,
  onClose,
  activeSection,
  setActiveSection,
  onLogout,
  bookings,
}) {
  const { state, dispatch } = useStore()
  const toast = useToast()
  const fileInputRef = useRef(null)

  const role = state.session.role
  const userId = state.session.userId
  const baseOnboarding = getSavedOnboarding(userId, role) || {}
  const customDetails =
    role === "host" ? state.profile.hostDetails : state.profile.driverDetails
  const mergedProfile = { ...baseOnboarding, ...(customDetails || {}) }

  // Form state for editing personal + onboarding details
  const [name, setName] = useState(state.session.name || "")
  const [phone, setPhone] = useState(state.session.phone || "")
  const [email, setEmail] = useState(
    state.profile.email || state.session.email || "",
  )

  // Driver fields
  const [evModel, setEvModel] = useState(
    mergedProfile.evModel || "Tata Tigor.ev",
  )
  const [batteryKwh, setBatteryKwh] = useState(mergedProfile.batteryKwh || 26)
  const [regNumber, setRegNumber] = useState(
    mergedProfile.regNumber || "DL01EV2026",
  )
  const [currentSoc, setCurrentSoc] = useState(
    mergedProfile.currentSoc || state.user.soc || 26,
  )
  const [connectorType, setConnectorType] = useState(
    mergedProfile.connectorType || "Both 15A & Type-2",
  )
  const [carriesCable, setCarriesCable] = useState(
    mergedProfile.carriesCable || "Yes, in boot",
  )
  const [upiId, setUpiId] = useState(mergedProfile.upiId || "")
  const [emergencyPhone, setEmergencyPhone] = useState(
    mergedProfile.emergencyPhone || "",
  )
  const [perks, setPerks] = useState(
    mergedProfile.preferredPerks ||
      mergedProfile.perks || ["Family Verified", "CCTV Guarded"],
  )

  // Host fields
  const [homeTitle, setHomeTitle] = useState(
    mergedProfile.homeTitle || `${state.session.name || "My"}'s Home Socket`,
  )
  const [locality, setLocality] = useState(
    mergedProfile.locality || "Sector 62, Noida",
  )
  const [socketType, setSocketType] = useState(
    mergedProfile.socketType || "7.2kW Fast",
  )
  const [powerKw, setPowerKw] = useState(mergedProfile.powerKw || 7.2)
  const [ratePerKwh, setRatePerKwh] = useState(mergedProfile.ratePerKwh || 12)
  const [availabilitySlot, setAvailabilitySlot] = useState(
    mergedProfile.availabilitySlot || "24×7 Anytime",
  )

  // Records filter
  const [recordFilter, setRecordFilter] = useState("all")

  // EV Toolkit: Trip & Charge Calculator state
  const [calcStartSoc, setCalcStartSoc] = useState(state.user.soc || 20)
  const [calcTargetSoc, setCalcTargetSoc] = useState(85)
  const [calcRate, setCalcRate] = useState(mergedProfile.ratePerKwh || 12)

  // Keep local form synced when drawer opens or role changes
  useEffect(() => {
    if (!open) return
    const saved = getSavedOnboarding(userId, role) || {}
    const roleSpecific =
      role === "host" ? state.profile.hostDetails : state.profile.driverDetails
    const m = { ...saved, ...(roleSpecific || {}) }

    setName(state.session.name || "")
    setPhone(state.session.phone || "")
    setEmail(state.profile.email || state.session.email || "")
    setEvModel(m.evModel || "Tata Tigor.ev")
    setBatteryKwh(m.batteryKwh || 26)
    setRegNumber(m.regNumber || "DL01EV2026")
    setCurrentSoc(m.currentSoc || state.user.soc || 26)
    setConnectorType(m.connectorType || "Both 15A & Type-2")
    setCarriesCable(m.carriesCable || "Yes, in boot")
    setUpiId(m.upiId || "")
    setEmergencyPhone(m.emergencyPhone || "")
    setPerks(
      m.preferredPerks || m.perks || ["Family Verified", "CCTV Guarded"],
    )
    setHomeTitle(m.homeTitle || `${state.session.name || "My"}'s Home Socket`)
    setLocality(m.locality || "Sector 62, Noida")
    setSocketType(m.socketType || "7.2kW Fast")
    setPowerKw(m.powerKw || 7.2)
    setRatePerKwh(m.ratePerKwh || 12)
    setAvailabilitySlot(m.availabilitySlot || "24×7 Anytime")
  }, [open, role, userId])

  const initials = (state.session.name || "U")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()

  const handlePhotoUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      return toast("Image too large", "Please choose a photo under 5 MB.", {
        tone: "warn",
      })
    }
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement("canvas")
        const maxDim = 256
        let w = img.width
        let h = img.height
        if (w > h) {
          if (w > maxDim) {
            h = Math.round((h * maxDim) / w)
            w = maxDim
          }
        } else if (h > maxDim) {
          w = Math.round((w * maxDim) / h)
          h = maxDim
        }
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext("2d")
        ctx.drawImage(img, 0, 0, w, h)
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85)
        dispatch({ type: "UPDATE_PROFILE", photoUrl: dataUrl })
        toast("Profile photo updated", "Your new avatar is saved.")
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  }

  const handleRemovePhoto = () => {
    dispatch({ type: "UPDATE_PROFILE", photoUrl: "" })
    toast("Profile photo removed", "Switched back to your initials avatar.")
  }

  const togglePerk = (p) => {
    setPerks((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    )
  }

  const handleSaveProfile = (e) => {
    e.preventDefault()
    const cleanName = name.trim() || "User"
    if (role === "driver") {
      const driverDetails = {
        evModel,
        batteryKwh: Number(batteryKwh) || 26,
        regNumber: regNumber.trim().toUpperCase(),
        currentSoc: Number(currentSoc) || 26,
        connectorType,
        carriesCable,
        preferredPerks: perks,
        upiId: upiId.trim(),
        emergencyPhone: emergencyPhone.trim(),
        updatedAt: new Date().toISOString(),
      }
      syncOnboardingStorage(userId, "driver", driverDetails)
      dispatch({
        type: "UPDATE_PROFILE",
        name: cleanName,
        phone: phone.trim(),
        email: email.trim(),
        soc: Number(currentSoc) || 26,
        driverDetails,
      })
    } else {
      const hostDetails = {
        homeTitle: homeTitle.trim(),
        locality: locality.trim(),
        socketType,
        powerKw: Number(powerKw) || 7.2,
        ratePerKwh: Number(ratePerKwh) || 12,
        availabilitySlot,
        perks,
        upiId: upiId.trim(),
        updatedAt: new Date().toISOString(),
      }
      syncOnboardingStorage(userId, "host", hostDetails)
      dispatch({
        type: "UPDATE_PROFILE",
        name: cleanName,
        phone: phone.trim(),
        email: email.trim(),
        hostDetails,
      })
    }
    toast(
      "Profile details saved!",
      "Your updated details are now active across PLUG-HOME.",
    )
  }

  // Filter user's records
  const myRecords = (bookings || []).filter(
    (b) =>
      b.driverId === userId ||
      b.hostOwnerId === userId ||
      state.session.demo,
  )
  const filteredRecords = myRecords.filter((b) => {
    if (recordFilter === "all") return true
    if (recordFilter === "paid") return b.status === "paid"
    if (recordFilter === "active")
      return !["paid", "cancelled", "declined"].includes(b.status)
    return ["cancelled", "declined", "disputed"].includes(b.status)
  })

  const totalKwh = myRecords.reduce(
    (acc, b) => acc + (Number(b.kwhUsed) || Number(b.estimateKwh) || 0),
    0,
  )
  const totalAmount = myRecords.reduce(
    (acc, b) => acc + (Number(b.amount) || Number(b.estimateAmount) || 0),
    0,
  )
  const totalCo2 = co2(totalKwh)

  const exportRecordsCsv = () => {
    if (!myRecords.length) {
      return toast("No records to export", "Complete a booking first.", {
        tone: "warn",
      })
    }
    const headers = [
      "Booking ID",
      "Host Name",
      "Status",
      "kWh",
      "Rate (INR/kWh)",
      "Amount (INR)",
      "Reference",
      "Date",
    ]
    const rows = myRecords.map((b) => [
      b.id || "",
      (b.hostName || "Host").replace(/,/g, " "),
      b.status || "",
      b.kwhUsed ?? b.estimateKwh ?? 0,
      b.rate ?? 12,
      b.amount ?? b.estimateAmount ?? 0,
      b.ref || "",
      new Date(
        b.paidAt || b.updatedAt || b.createdAt || Date.now(),
      ).toISOString(),
    ])
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `plughome-records-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast("Records exported", "Downloaded CSV file of your sessions.")
  }

  // Calculator math
  const neededSoc = Math.max(0, calcTargetSoc - calcStartSoc)
  const calcKwhNeeded = ((neededSoc / 100) * (Number(batteryKwh) || 26)).toFixed(
    1,
  )
  const calcCost = Math.round(Number(calcKwhNeeded) * (Number(calcRate) || 12))
  const calcHoursFast = (Number(calcKwhNeeded) / 7.2).toFixed(1)
  const calcHours15A = (Number(calcKwhNeeded) / 3.3).toFixed(1)

  const MENU_TABS = [
    ["profile", "Edit Profile", User],
    ["records", "All Records", History],
    ["toolkit", "EV Toolkit", Compass],
    ["settings", "Settings", Settings],
  ]

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[900] bg-ink/40 backdrop-blur-xs"
          />
          <motion.aside
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ duration: 0.32, ease: EASE.out }}
            aria-label="Main Menu & Profile Drawer"
            className="fixed top-0 left-0 bottom-0 z-[910] w-full max-w-md bg-white border-r border-line shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Drawer Top Profile Banner */}
            <div className="p-5 bg-mint border-b border-line/70">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="relative shrink-0">
                    {state.profile.photoUrl ? (
                      <img
                        src={state.profile.photoUrl}
                        alt={state.session.name || "Profile"}
                        className="h-16 w-16 rounded-2xl object-cover border-2 border-parrot shadow-sm"
                      />
                    ) : (
                      <div
                        className="h-16 w-16 rounded-2xl font-display font-extrabold text-xl grid place-items-center border-2 border-parrot/50 shadow-sm"
                        style={{
                          background: "linear-gradient(135deg,#EAF6DC,#B5E86B)",
                        }}
                      >
                        {initials}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      title="Upload or change profile photo"
                      className="absolute -bottom-1.5 -right-1.5 h-7 w-7 rounded-full btn-primary grid place-items-center shadow-md"
                    >
                      <Camera size={13} />
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      className="hidden"
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="h-5 px-2 rounded-full btn-primary text-[10px] font-bold tracking-wider uppercase inline-flex items-center">
                        {role}
                      </span>
                      {state.profile.photoUrl && (
                        <button
                          type="button"
                          onClick={handleRemovePhoto}
                          className="text-[11px] text-slate hover:text-ink inline-flex items-center gap-0.5"
                          title="Remove photo"
                        >
                          <Trash2 size={11} /> Remove
                        </button>
                      )}
                    </div>
                    <h2 className="mt-1 font-display text-lg font-extrabold text-ink truncate">
                      {state.session.name || "PLUG-HOME User"}
                    </h2>
                    <p className="text-xs text-slate truncate">
                      {role === "driver"
                        ? `🚗 ${evModel} · ${connectorType}`
                        : `🏡 ${homeTitle} · ₹${ratePerKwh}/kWh`}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close drawer"
                  className="h-9 w-9 rounded-full bg-white hover:bg-mint-2 grid place-items-center text-slate hover:text-ink border border-line transition"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Drawer Navigation Tabs */}
              <div className="mt-4 grid grid-cols-4 gap-1.5 bg-white p-1 rounded-2xl border border-line/70">
                {MENU_TABS.map(([id, label, Icon]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setActiveSection(id)}
                    className={`py-2 px-1.5 rounded-xl text-[11px] font-display font-bold flex flex-col items-center gap-1 transition-all ${
                      activeSection === id
                        ? "btn-primary shadow-xs"
                        : "text-slate hover:text-ink hover:bg-mint"
                    }`}
                  >
                    <Icon size={15} />
                    <span className="truncate max-w-full">{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Drawer Body Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* ================= TAB 1: EDIT PROFILE & DETAILS ================= */}
              {activeSection === "profile" && (
                <form onSubmit={handleSaveProfile} className="space-y-4">
                  <div className="rounded-2xl bg-mint/60 border border-line p-3.5 flex items-center justify-between gap-3">
                    <div className="text-xs">
                      <p className="font-display font-bold text-ink">
                        Profile Photo & Identity
                      </p>
                      <p className="text-slate mt-0.5">
                        Tap the camera icon or button to change your photo.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="h-9 px-3 rounded-xl bg-white border border-line text-xs font-display font-bold inline-flex items-center gap-1.5 hover:bg-mint shrink-0"
                    >
                      <Camera size={14} className="text-parrot-ink" />
                      Upload Photo
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="block text-xs font-semibold text-slate">
                      Full Name
                      <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Your full name"
                        className="mt-1 w-full h-10 rounded-xl bg-mint px-3 text-sm text-ink font-medium border border-transparent focus:border-parrot outline-none"
                      />
                    </label>
                    <label className="block text-xs font-semibold text-slate">
                      Mobile Number (+91)
                      <input
                        value={phone}
                        onChange={(e) =>
                          setPhone(
                            e.target.value.replace(/\D/g, "").slice(0, 10),
                          )
                        }
                        placeholder="98XXXXXX10"
                        className="mt-1 w-full h-10 rounded-xl bg-mint px-3 text-sm text-ink font-mono border border-transparent focus:border-parrot outline-none"
                      />
                    </label>
                  </div>

                  <label className="block text-xs font-semibold text-slate">
                    Email Address
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@gmail.com"
                      className="mt-1 w-full h-10 rounded-xl bg-mint px-3 text-sm text-ink border border-transparent focus:border-parrot outline-none"
                    />
                  </label>

                  {role === "driver" ? (
                    <>
                      <div className="pt-2 border-t border-line">
                        <p className="text-xs font-bold uppercase tracking-wider text-parrot-ink mb-2.5">
                          EV Vehicle & Charging Details
                        </p>
                        <div className="grid grid-cols-2 gap-2 mb-3">
                          {EV_MODELS.map(([m, kwh]) => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => {
                                setEvModel(m)
                                setBatteryKwh(kwh)
                              }}
                              className={`h-9 px-2.5 rounded-xl text-xs font-display font-bold border text-left truncate flex items-center gap-1.5 ${
                                evModel === m
                                  ? "bg-parrot/20 border-parrot text-ink"
                                  : "bg-mint border-transparent text-slate hover:text-ink"
                              }`}
                            >
                              {evModel === m && (
                                <Check
                                  size={12}
                                  className="text-parrot-ink shrink-0"
                                />
                              )}
                              <span className="truncate">{m}</span>
                            </button>
                          ))}
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <label className="block text-xs font-semibold text-slate">
                            Battery Size (kWh)
                            <input
                              type="number"
                              step="0.5"
                              value={batteryKwh}
                              onChange={(e) => setBatteryKwh(e.target.value)}
                              className="mt-1 w-full h-10 rounded-xl bg-mint px-3 font-mono text-sm text-ink border border-transparent focus:border-parrot outline-none"
                            />
                          </label>
                          <label className="block text-xs font-semibold text-slate">
                            Vehicle Reg. Plate
                            <input
                              value={regNumber}
                              onChange={(e) =>
                                setRegNumber(e.target.value.toUpperCase())
                              }
                              placeholder="DL01EV2026"
                              className="mt-1 w-full h-10 rounded-xl bg-mint px-3 font-mono text-sm uppercase text-ink border border-transparent focus:border-parrot outline-none"
                            />
                          </label>
                        </div>

                        <div className="mt-3 rounded-xl bg-mint p-3">
                          <div className="flex justify-between text-xs font-bold">
                            <span className="text-parrot-ink flex items-center gap-1">
                              <BatteryCharging size={14} /> Current Battery SoC
                            </span>
                            <span className="font-mono text-ink">
                              {currentSoc}%
                            </span>
                          </div>
                          <input
                            type="range"
                            min="5"
                            max="95"
                            value={currentSoc}
                            onChange={(e) =>
                              setCurrentSoc(Number(e.target.value))
                            }
                            className="mt-1.5 w-full accent-[#72D600]"
                          />
                        </div>

                        <div className="mt-3">
                          <span className="block text-xs font-semibold text-slate mb-1.5">
                            Supported Connector Type
                          </span>
                          <div className="grid grid-cols-3 gap-1.5">
                            {[
                              "15A Plug",
                              "7.2kW Fast",
                              "Both 15A & Type-2",
                            ].map((c) => (
                              <button
                                key={c}
                                type="button"
                                onClick={() => setConnectorType(c)}
                                className={`h-9 px-2 rounded-xl text-[11px] font-display font-bold border truncate ${
                                  connectorType === c
                                    ? "bg-parrot/20 border-parrot text-ink"
                                    : "bg-mint border-transparent text-slate"
                                }`}
                              >
                                {c}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-3">
                          <label className="block text-xs font-semibold text-slate">
                            Your UPI ID
                            <input
                              value={upiId}
                              onChange={(e) => setUpiId(e.target.value)}
                              placeholder="user@okaxis"
                              className="mt-1 w-full h-10 rounded-xl bg-mint px-3 font-mono text-xs text-ink border border-transparent focus:border-parrot outline-none"
                            />
                          </label>
                          <label className="block text-xs font-semibold text-slate">
                            Emergency Contact
                            <input
                              value={emergencyPhone}
                              onChange={(e) =>
                                setEmergencyPhone(
                                  e.target.value
                                    .replace(/\D/g, "")
                                    .slice(0, 10),
                                )
                              }
                              placeholder="98XXXXXX00"
                              className="mt-1 w-full h-10 rounded-xl bg-mint px-3 font-mono text-xs text-ink border border-transparent focus:border-parrot outline-none"
                            />
                          </label>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="pt-2 border-t border-line space-y-3">
                        <p className="text-xs font-bold uppercase tracking-wider text-parrot-ink">
                          Home Socket & Tariff Details
                        </p>
                        <label className="block text-xs font-semibold text-slate">
                          Home / Driveway Listing Title
                          <input
                            value={homeTitle}
                            onChange={(e) => setHomeTitle(e.target.value)}
                            className="mt-1 w-full h-10 rounded-xl bg-mint px-3 text-sm text-ink border border-transparent focus:border-parrot outline-none"
                          />
                        </label>
                        <label className="block text-xs font-semibold text-slate">
                          Sector / Locality
                          <input
                            value={locality}
                            onChange={(e) => setLocality(e.target.value)}
                            className="mt-1 w-full h-10 rounded-xl bg-mint px-3 text-sm text-ink border border-transparent focus:border-parrot outline-none"
                          />
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                          <label className="block text-xs font-semibold text-slate">
                            Tariff Rate (₹/kWh)
                            <input
                              type="number"
                              min="5"
                              max="30"
                              value={ratePerKwh}
                              onChange={(e) => setRatePerKwh(e.target.value)}
                              className="mt-1 w-full h-10 rounded-xl bg-mint px-3 font-mono text-sm text-ink border border-transparent focus:border-parrot outline-none"
                            />
                          </label>
                          <label className="block text-xs font-semibold text-slate">
                            Host Payout UPI ID
                            <input
                              value={upiId}
                              onChange={(e) => setUpiId(e.target.value)}
                              placeholder="host@okicici"
                              className="mt-1 w-full h-10 rounded-xl bg-mint px-3 font-mono text-xs text-ink border border-transparent focus:border-parrot outline-none"
                            />
                          </label>
                        </div>
                      </div>
                    </>
                  )}

                  <div>
                    <span className="block text-xs font-semibold text-slate mb-1.5">
                      {role === "driver"
                        ? "Preferred Safety & Hospitality Perks"
                        : "Hospitality Perks Offered"}
                    </span>
                    <div className="grid grid-cols-2 gap-1.5">
                      {ALL_PERKS.map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => togglePerk(p)}
                          className={`h-9 px-2.5 rounded-xl text-xs font-display font-bold border flex items-center gap-1.5 ${
                            perks.includes(p)
                              ? "bg-parrot/20 border-parrot text-ink"
                              : "bg-mint border-transparent text-slate"
                          }`}
                        >
                          {perks.includes(p) && (
                            <Check
                              size={12}
                              className="text-parrot-ink shrink-0"
                            />
                          )}
                          <span className="truncate">{p}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <Btn type="submit" icon={Save} className="w-full">
                    Save All Profile Details
                  </Btn>
                </form>
              )}

              {/* ================= TAB 2: ALL RECORDS & HISTORY ================= */}
              {activeSection === "records" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-2.5">
                    <div className="rounded-2xl bg-mint p-3 border border-line/60">
                      <p className="text-[11px] text-slate">Sessions</p>
                      <p className="font-mono text-xl font-bold text-ink">
                        {myRecords.length}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-mint p-3 border border-line/60">
                      <p className="text-[11px] text-slate">Total Energy</p>
                      <p className="font-mono text-xl font-bold text-ink">
                        {totalKwh.toFixed(1)}{" "}
                        <span className="text-xs font-normal">kWh</span>
                      </p>
                    </div>
                    <div className="rounded-2xl bg-mint p-3 border border-line/60">
                      <p className="text-[11px] text-slate">
                        {role === "host" ? "Earned" : "Spent"}
                      </p>
                      <p className="font-mono text-xl font-bold text-parrot-ink">
                        ₹{Math.round(totalAmount)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <div className="flex gap-1 bg-mint p-1 rounded-xl">
                      {[
                        ["all", "All"],
                        ["active", "Active"],
                        ["paid", "Paid"],
                      ].map(([id, label]) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setRecordFilter(id)}
                          className={`h-7 px-2.5 rounded-lg text-xs font-display font-bold transition ${
                            recordFilter === id
                              ? "bg-white text-ink shadow-2xs"
                              : "text-slate hover:text-ink"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={exportRecordsCsv}
                      className="h-8 px-3 rounded-xl bg-mint hover:bg-mint-2 text-xs font-display font-bold inline-flex items-center gap-1.5 text-ink"
                    >
                      <Download size={13} /> Export CSV
                    </button>
                  </div>

                  {filteredRecords.length === 0 ? (
                    <div className="rounded-2xl border border-line p-8 text-center space-y-2">
                      <FileText size={28} className="mx-auto text-mute" />
                      <p className="font-display font-bold text-sm text-ink">
                        No records in this view yet
                      </p>
                      <p className="text-xs text-slate">
                        Every charging session, meter reading, and receipt is
                        automatically recorded here.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {filteredRecords.map((b) => (
                        <div
                          key={b.id}
                          className="rounded-2xl border border-line p-3.5 bg-white hover:border-parrot transition space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <p className="font-display font-bold text-sm text-ink">
                                {b.hostName || "Home Charger Session"}
                              </p>
                              <p className="text-[11px] font-mono text-slate">
                                {new Date(
                                  b.paidAt ||
                                    b.updatedAt ||
                                    b.createdAt ||
                                    Date.now(),
                                ).toLocaleString("en-IN", {
                                  dateStyle: "medium",
                                  timeStyle: "short",
                                })}
                              </p>
                            </div>
                            <span
                              className={`h-6 px-2.5 rounded-full text-[11px] font-bold uppercase inline-flex items-center ${
                                b.status === "paid"
                                  ? "bg-parrot/20 text-parrot-ink"
                                  : "bg-amber/20 text-ink"
                              }`}
                            >
                              {b.status}
                            </span>
                          </div>
                          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-line/60 text-xs">
                            <div>
                              <span className="text-mute block text-[10px]">
                                Energy
                              </span>
                              <span className="font-mono font-bold">
                                {(b.kwhUsed ?? b.estimateKwh ?? 0).toFixed(1)}{" "}
                                kWh
                              </span>
                            </div>
                            <div>
                              <span className="text-mute block text-[10px]">
                                Bill Amount
                              </span>
                              <span className="font-mono font-bold">
                                ₹{b.amount ?? b.estimateAmount ?? 0}
                              </span>
                            </div>
                            <div>
                              <span className="text-mute block text-[10px]">
                                CO₂ Saved
                              </span>
                              <span className="font-mono font-bold text-parrot-ink">
                                {co2(b.kwhUsed ?? b.estimateKwh ?? 0).toFixed(
                                  1,
                                )}{" "}
                                kg
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ================= TAB 3: EV TOOLKIT ================= */}
              {activeSection === "toolkit" && (
                <div className="space-y-4">
                  {/* Tool 1: Charge Time & Bill Estimator */}
                  <div className="rounded-2xl border border-line p-4 space-y-3 bg-mint/40">
                    <div className="flex items-center gap-2 text-parrot-ink">
                      <Zap size={16} />
                      <h3 className="font-display font-bold text-sm text-ink">
                        Charge Time & Bill Estimator
                      </h3>
                    </div>
                    <p className="text-xs text-slate">
                      Configured for{" "}
                      <strong>
                        {evModel} ({batteryKwh} kWh)
                      </strong>
                    </p>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <label className="block">
                        Start SoC (%)
                        <input
                          type="number"
                          min="0"
                          max="95"
                          value={calcStartSoc}
                          onChange={(e) =>
                            setCalcStartSoc(Number(e.target.value))
                          }
                          className="mt-1 w-full h-9 rounded-xl bg-white px-2.5 font-mono border border-line"
                        />
                      </label>
                      <label className="block">
                        Target SoC (%)
                        <input
                          type="number"
                          min="10"
                          max="100"
                          value={calcTargetSoc}
                          onChange={(e) =>
                            setCalcTargetSoc(Number(e.target.value))
                          }
                          className="mt-1 w-full h-9 rounded-xl bg-white px-2.5 font-mono border border-line"
                        />
                      </label>
                      <label className="block">
                        Rate (₹/kWh)
                        <input
                          type="number"
                          min="5"
                          max="30"
                          value={calcRate}
                          onChange={(e) => setCalcRate(Number(e.target.value))}
                          className="mt-1 w-full h-9 rounded-xl bg-white px-2.5 font-mono border border-line"
                        />
                      </label>
                    </div>
                    <div className="grid grid-cols-3 gap-2 rounded-xl bg-white p-3 border border-line text-center">
                      <div>
                        <p className="text-[10px] text-slate">Energy Needed</p>
                        <p className="font-mono font-bold text-sm">
                          {calcKwhNeeded} kWh
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate">Est. Bill</p>
                        <p className="font-mono font-bold text-sm text-parrot-ink">
                          ₹{calcCost}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate">7.2kW / 15A</p>
                        <p className="font-mono font-bold text-xs">
                          {calcHoursFast}h / {calcHours15A}h
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Tool 2: Green Impact Passbook */}
                  <div className="rounded-2xl border border-line p-4 space-y-2.5">
                    <div className="flex items-center gap-2 text-parrot-ink">
                      <Leaf size={16} />
                      <h3 className="font-display font-bold text-sm text-ink">
                        Green Carbon Passbook
                      </h3>
                    </div>
                    <div className="grid grid-cols-2 gap-2.5 text-xs">
                      <div className="rounded-xl bg-mint p-3">
                        <p className="text-slate">Total CO₂ Offset</p>
                        <p className="font-mono text-lg font-bold text-ink">
                          {totalCo2.toFixed(1)} kg
                        </p>
                      </div>
                      <div className="rounded-xl bg-mint p-3">
                        <p className="text-slate">Tree Equivalent</p>
                        <p className="font-mono text-lg font-bold text-parrot-ink">
                          🌳 {(totalCo2 / 21).toFixed(1)} yrs
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Tool 3: Safety & Emergency SOS */}
                  <div className="rounded-2xl border border-line p-4 space-y-2.5">
                    <div className="flex items-center gap-2 text-parrot-ink">
                      <ShieldCheck size={16} />
                      <h3 className="font-display font-bold text-sm text-ink">
                        Safety & Emergency SOS Kit
                      </h3>
                    </div>
                    <p className="text-xs text-slate">
                      Emergency Contact:{" "}
                      <strong className="font-mono text-ink">
                        {emergencyPhone || "Not set (Add in Edit Profile)"}
                      </strong>
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          toast(
                            "SOS Alert Prepared",
                            emergencyPhone
                              ? `Sharing live GPS pin with +91 ${emergencyPhone}`
                              : "Add an emergency phone in Edit Profile first.",
                          )
                        }
                        className="h-9 px-3 rounded-xl btn-primary text-xs font-display font-bold inline-flex items-center gap-1.5"
                      >
                        <PhoneCall size={13} /> Share Live Location SOS
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          dispatch({
                            type: "SET_ROLE",
                            role: role === "host" ? "driver" : "host",
                          })
                          toast(
                            "Switched Portal",
                            `Now viewing ${role === "host" ? "Driver" : "Host"} mode.`,
                          )
                        }}
                        className="h-9 px-3 rounded-xl bg-mint hover:bg-mint-2 text-xs font-display font-bold inline-flex items-center gap-1.5"
                      >
                        <RefreshCw size={13} /> Switch to{" "}
                        {role === "host" ? "Driver" : "Host"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ================= TAB 4: APP SETTINGS ================= */}
              {activeSection === "settings" && (
                <div className="space-y-5">
                  <div className="space-y-2.5">
                    <p className="text-xs font-bold uppercase tracking-wider text-parrot-ink flex items-center gap-1.5">
                      <Sliders size={13} /> App Preferences
                    </p>
                    {[
                      [
                        "notifications",
                        "Live Booking & Meter Alerts",
                        "Instant alerts when host or driver updates session status",
                      ],
                      [
                        "soundEffects",
                        "Charging & Meter Sound Effects",
                        "Play subtle audio feedback on meter confirmation",
                      ],
                      [
                        "autoGps",
                        "Auto-Detect GPS on Launch",
                        "Automatically center the map on your current locality",
                      ],
                      [
                        "autoSaveReceipts",
                        "Auto-Save Meter Receipts",
                        "Keep a local copy of all Zero-Fight meter bills",
                      ],
                    ].map(([key, title, sub]) => (
                      <label
                        key={key}
                        className="flex items-center justify-between gap-3 rounded-2xl bg-mint p-3.5 cursor-pointer"
                      >
                        <div className="text-xs">
                          <p className="font-semibold text-ink">{title}</p>
                          <p className="text-slate text-[11px]">{sub}</p>
                        </div>
                        <input
                          type="checkbox"
                          checked={Boolean(state.settings[key])}
                          onChange={(e) =>
                            dispatch({
                              type: "UPDATE_SETTINGS",
                              patch: { [key]: e.target.checked },
                            })
                          }
                          className="h-4 w-4 rounded accent-[#72D600]"
                        />
                      </label>
                    ))}
                  </div>

                  <div className="rounded-2xl bg-mint p-3.5 space-y-2">
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-ink">
                        Low Battery Warning Threshold
                      </span>
                      <span className="font-mono text-parrot-ink">
                        {state.settings.lowSocAlert || 20}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="40"
                      step="5"
                      value={state.settings.lowSocAlert || 20}
                      onChange={(e) =>
                        dispatch({
                          type: "UPDATE_SETTINGS",
                          patch: { lowSocAlert: Number(e.target.value) },
                        })
                      }
                      className="w-full accent-[#72D600]"
                    />
                    <p className="text-[11px] text-slate">
                      Highlights nearby fast sockets when your EV battery drops
                      below this level.
                    </p>
                  </div>

                  <div className="rounded-2xl bg-mint p-3.5 space-y-2">
                    <span className="block text-xs font-bold text-ink">
                      Default Charger Search Radius
                    </span>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[2, 5, 10, 25].map((km) => (
                        <button
                          key={km}
                          type="button"
                          onClick={() =>
                            dispatch({
                              type: "UPDATE_SETTINGS",
                              patch: { preferredRadiusKm: km },
                            })
                          }
                          className={`h-9 rounded-xl text-xs font-mono font-bold border transition ${
                            (state.settings.preferredRadiusKm || 5) === km
                              ? "bg-parrot/20 border-parrot text-ink"
                              : "bg-white border-line text-slate hover:text-ink"
                          }`}
                        >
                          {km} km
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Drawer Footer */}
            <div className="p-4 border-t border-line bg-mint/40 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  dispatch({
                    type: "SET_ROLE",
                    role: role === "host" ? "driver" : "host",
                  })
                }}
                className="h-10 px-3.5 rounded-xl bg-white border border-line text-xs font-display font-bold inline-flex items-center gap-1.5 hover:bg-mint"
              >
                <RefreshCw size={14} />
                Switch to {role === "host" ? "Driver" : "Host"}
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose()
                  onLogout()
                }}
                className="h-10 px-3.5 rounded-xl bg-white border border-line text-xs font-display font-bold text-ink inline-flex items-center gap-1.5 hover:bg-mint"
              >
                <LogOut size={14} />
                Log out
              </button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}

function Navbar({ onLogout }) {
  const { state, dispatch } = useStore()
  const [menu, setMenu] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerSection, setDrawerSection] = useState("profile")
  const [scrolled, setScrolled] = useState(false)
  const role = state.session.role
  const demo = state.session.demo
  const tab = role === "host" ? state.hostTab : state.driverTab
  const { bookings } = useBookings(!demo)
  const allBookings = demo ? state.demo?.bookings || [] : bookings
  const pending = allBookings.filter(
    (b) => b.hostOwnerId === state.session.userId && b.status === "requested",
  ).length

  const savedOnboarding = getSavedOnboarding(state.session.userId, role) || {}
  const customRoleDetails =
    role === "host" ? state.profile.hostDetails : state.profile.driverDetails
  const profileDetails = { ...savedOnboarding, ...(customRoleDetails || {}) }

  useEffect(() => {
    const f = () => setScrolled(window.scrollY > 8)
    window.addEventListener("scroll", f)
    return () => window.removeEventListener("scroll", f)
  }, [])
  useEffect(() => {
    if (!menu && !drawerOpen) return
    const k = (e) => {
      if (e.key === "Escape") {
        setMenu(false)
        setDrawerOpen(false)
      }
    }
    window.addEventListener("keydown", k)
    return () => window.removeEventListener("keydown", k)
  }, [menu, drawerOpen])

  const initials = (state.session.name || "U")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
  const go = (t) => dispatch({ type: "TAB", role, tab: t })

  const openDrawerSection = (sec) => {
    setDrawerSection(sec)
    setMenu(false)
    setDrawerOpen(true)
  }

  return (
    <>
      <SideDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        activeSection={drawerSection}
        setActiveSection={setDrawerSection}
        onLogout={onLogout}
        bookings={allBookings}
      />
      <motion.header
        initial={{ y: -64 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.4, ease: EASE.out }}
        className={`sticky top-0 z-[700] h-16 bg-white/85 backdrop-blur border-b border-line/60 transition-shadow ${
          scrolled ? "shadow-[0_8px_24px_-16px_rgba(15,23,42,.2)]" : ""
        }`}
      >
        <div className="h-full px-4 md:px-6 flex items-center gap-3 md:gap-4">
          {/* 3-LINE HAMBURGER BUTTON IN TOP-LEFT CORNER */}
          <button
            type="button"
            aria-label="Open menu, profile, records and settings"
            onClick={() => setDrawerOpen(true)}
            className="h-10 w-10 rounded-xl bg-mint hover:bg-mint-2 border border-line/80 grid place-items-center text-ink transition shrink-0"
          >
            <Menu size={20} />
          </button>

          <div className="flex items-center gap-2 shrink-0">
            <motion.span
              initial={{ rotate: -90, scale: 0.6 }}
              animate={{ rotate: 0, scale: 1 }}
              transition={SPRING.bouncy}
              className="inline-flex"
            >
              <Logo size={30} />
            </motion.span>
            <Wordmark className="text-lg hidden sm:inline" />
          </div>
          <nav
            role="tablist"
            aria-label="Portal sections"
            className="hidden md:flex flex-1 justify-center gap-1"
          >
            {TABS[role].map(([id, label, Icon]) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                onClick={() => go(id)}
                className={`relative h-11 px-4 rounded-full text-sm font-display font-bold inline-flex items-center gap-2 ${
                  tab === id
                    ? "text-ink"
                    : "text-slate hover:text-ink hover:bg-mint"
                }`}
              >
                <Icon size={17} />
                {label}
                {id === "bookings" && pending > 0 && (
                  <motion.span
                    key={pending}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={SPRING.bouncy}
                    className="h-5 min-w-5 px-1 rounded-full btn-primary text-[11px] font-mono grid place-items-center"
                  >
                    {pending}
                  </motion.span>
                )}
                {tab === id && (
                  <motion.span
                    layoutId="tab-underline"
                    transition={SPRING.snap}
                    className="absolute left-3 right-3 -bottom-[10px] h-1 rounded-full bg-parrot"
                  />
                )}
              </button>
            ))}
          </nav>
          <div className="ml-auto md:ml-0 flex items-center gap-2 shrink-0">
            {demo ? <DemoPill /> : <RealtimePill />}
            {role === "driver" && (
              <span className="hidden lg:inline-flex h-9 px-3 rounded-full bg-mint text-sm font-medium items-center gap-1.5 max-w-[220px]">
                <MapPin size={15} className="text-parrot-ink shrink-0" />
                <span className="truncate">
                  {state.user.areaName || "Location not shared"}
                </span>
              </span>
            )}
            <AnimatePresence mode="wait">
              <motion.span
                key={role}
                initial={{ rotateX: 90 }}
                animate={{ rotateX: 0 }}
                exit={{ rotateX: -90 }}
                transition={{ duration: 0.25 }}
                className="h-7 px-3 rounded-full btn-primary text-[11px] font-bold tracking-wider inline-flex items-center"
              >
                {role.toUpperCase()}
              </motion.span>
            </AnimatePresence>
            <div className="relative">
              <button
                aria-label="Account menu"
                aria-expanded={menu}
                onClick={() => setMenu((m) => !m)}
                className="h-11 w-11 rounded-full font-display font-bold text-sm grid place-items-center overflow-hidden border border-parrot/40"
                style={{
                  background: "linear-gradient(135deg,#EAF6DC,#B5E86B)",
                }}
              >
                {state.profile.photoUrl ? (
                  <img
                    src={state.profile.photoUrl}
                    alt={state.session.name || "User"}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  initials
                )}
              </button>
              <AnimatePresence>
                {menu && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="absolute right-0 mt-2 w-64 rounded-2xl bg-white border border-line shadow-xl p-2"
                  >
                    <div className="px-3 py-2 rounded-xl bg-mint mb-1 text-xs">
                      <p className="font-display font-bold text-sm text-ink truncate">
                        {state.session.name || "User"}
                      </p>
                      {profileDetails &&
                        role === "driver" &&
                        profileDetails.evModel && (
                          <p className="text-slate mt-0.5 truncate">
                            🚗 {profileDetails.evModel} ·{" "}
                            {profileDetails.connectorType}
                          </p>
                        )}
                      {profileDetails &&
                        role === "host" &&
                        profileDetails.homeTitle && (
                          <p className="text-slate mt-0.5 truncate">
                            🏡 {profileDetails.homeTitle} · ₹
                            {profileDetails.ratePerKwh}/kWh
                          </p>
                        )}
                    </div>
                    <button
                      onClick={() => openDrawerSection("profile")}
                      className="w-full h-10 px-3 rounded-xl text-sm font-semibold flex items-center gap-2 hover:bg-mint"
                    >
                      <User size={16} />
                      Edit Profile & Photo
                    </button>
                    <button
                      onClick={() => openDrawerSection("records")}
                      className="w-full h-10 px-3 rounded-xl text-sm font-semibold flex items-center gap-2 hover:bg-mint"
                    >
                      <History size={16} />
                      All Records & History
                    </button>
                    <button
                      onClick={() => openDrawerSection("toolkit")}
                      className="w-full h-10 px-3 rounded-xl text-sm font-semibold flex items-center gap-2 hover:bg-mint"
                    >
                      <Compass size={16} />
                      EV Toolkit
                    </button>
                    <button
                      onClick={() => openDrawerSection("settings")}
                      className="w-full h-10 px-3 rounded-xl text-sm font-semibold flex items-center gap-2 hover:bg-mint"
                    >
                      <Settings size={16} />
                      Settings
                    </button>
                    <button
                      onClick={() => {
                        dispatch({
                          type: "SET_ROLE",
                          role: role === "host" ? "driver" : "host",
                        })
                        setMenu(false)
                      }}
                      className="w-full h-10 px-3 rounded-xl text-sm font-semibold flex items-center gap-2 hover:bg-mint"
                    >
                      <RefreshCw size={16} />
                      Switch to {role === "host" ? "Driver" : "Host"}
                    </button>
                    <button
                      onClick={() => {
                        setMenu(false)
                        onLogout()
                      }}
                      className="w-full h-10 px-3 rounded-xl text-sm font-semibold flex items-center gap-2 hover:bg-mint"
                    >
                      <LogOut size={16} />
                      Log out
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </motion.header>
      <nav
        role="tablist"
        aria-label="Portal sections"
        className="md:hidden fixed bottom-0 inset-x-0 z-[700] bg-white border-t border-line flex pb-[env(safe-area-inset-bottom)]"
      >
        {TABS[role].map(([id, label, Icon]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => go(id)}
            className={`relative flex-1 h-16 flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${
              tab === id ? "text-ink" : "text-mute"
            }`}
          >
            {tab === id && (
              <motion.span
                layoutId="tab-dot"
                className="absolute top-1.5 h-1.5 w-1.5 rounded-full bg-parrot"
              />
            )}
            <Icon size={20} />
            {label.split(" ")[0]}
            {id === "bookings" && pending > 0 && (
              <span className="absolute top-2 right-1/4 h-4 min-w-4 px-1 rounded-full btn-primary text-[10px] font-mono grid place-items-center">
                {pending}
              </span>
            )}
          </button>
        ))}
      </nav>
    </>
  )
}

function HostSync() {
  const { dispatch } = useStore()
  const toast = useToast()
  const { hosts, loading, error, refresh: retry } = useHosts(true)
  const warned = useRef(false)
  useEffect(() => {
    if (loading || (error && !hosts.length)) return
    dispatch({ type: "HOSTS", hosts })
  }, [hosts, loading])
  useEffect(() => {
    if (!error) {
      warned.current = false
      return
    }
    if (warned.current) return
    warned.current = true
    toast(
      "Couldn't load chargers",
      error.message || "The server is unavailable — try again shortly.",
      { tone: "error", action: { label: "Retry", onClick: retry } },
    )
  }, [error])
  useEffect(() => () => dispatch({ type: "HOSTS", hosts: [] }), [])
  return null
}

function Portal({ onLogout }) {
  const { state, dispatch } = useStore()
  const toast = useToast()
  const role = state.session.role
  const demo = state.session.demo
  const tab = role === "host" ? state.hostTab : state.driverTab
  const goDriver = async (h) => {
    dispatch({ type: "SET_ROLE", role: "driver" })
    dispatch({ type: "TAB", role: "driver", tab: "find" })
    dispatch({ type: "SELECT", id: h.id })
    if (!hasLoc(h)) return
    if (!hasLoc(state.user))
      return toast(
        "Share your location for directions",
        "Tap Detect on Find Chargers to see the route to this socket.",
        { tone: "warn" },
      )
    const r = await fetchRoute(state.user, h)
    if (r) dispatch({ type: "ROUTE", route: { hostId: h.id, ...r } })
  }
  const screens = {
    "driver:find": <DriverFind />,
    "driver:charge": <DriverCharge />,
    "driver:proof": <Proof />,
    "host:overview": <HostOverview />,
    "host:list": <HostList goDriver={goDriver} />,
    "host:bookings": <HostBookings />,
    "host:proof": <Proof />,
  }
  return (
    <div className="min-h-screen">
      {!demo && <HostSync />}
      {!demo && <LiveNotifier />}
      <Navbar onLogout={onLogout} />
      <AnimatePresence mode="wait">
        <motion.main
          key={`${role}:${tab}`}
          initial={{ opacity: 0, y: 12 }}
          animate={{
            opacity: 1,
            y: 0,
            transition: { duration: 0.35, ease: EASE.out },
          }}
          exit={{ opacity: 0, y: -8, transition: { duration: 0.15 } }}
        >
          <ErrorBoundary>{screens[`${role}:${tab}`]}</ErrorBoundary>
        </motion.main>
      </AnimatePresence>
    </div>
  )
}

function useOnline() {
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine !== false,
  )
  useEffect(() => {
    const on = () => setOnline(true),
      off = () => setOnline(false)
    window.addEventListener("online", on)
    window.addEventListener("offline", off)
    return () => {
      window.removeEventListener("online", on)
      window.removeEventListener("offline", off)
    }
  }, [])
  return online
}

function Shell() {
  const { state, dispatch } = useStore()
  const toast = useToast()
  const [wipe, setWipe] = useState(null)
  const [redirectVerifiedUser, setRedirectVerifiedUser] = useState(null)
  const online = useOnline()
  const sessionRef = useRef(state.session)
  sessionRef.current = state.session
  const leaving = useRef(false)

  useEffect(() => {
    if (isLive) probeBackend()
  }, [])

  // Handle redirect when user clicks the Supabase verification link in their email
  useEffect(() => {
    if (!isLive) return
    let mounted = true
    checkEmailRedirectCallback()
      .then((user) => {
        if (!mounted || !user) return
        setRedirectVerifiedUser(user)
        setTimeout(() => {
          if (!mounted) return
          setRedirectVerifiedUser(null)
          enter({
            role: user.role || "driver",
            name: user.name || "Verified User",
            phone: user.phone || "",
            userId: user.id,
            onboarding: user.onboarding,
            x: window.innerWidth / 2,
            y: window.innerHeight / 2,
          })
        }, 1800)
      })
      .catch(() => {})
    return () => {
      mounted = false
    }
  }, [])

  const authenticate = async ({
    role,
    name,
    phone,
    email,
    password,
    onboarding,
  }) => {
    if (!isLive) {
      toast(
        "Backend not configured",
        "This build has no Supabase project connected, so sign-in is unavailable.",
        { tone: "error" },
      )
      return null
    }
    try {
      const user = await signInAs({
        name,
        role,
        phone,
        email,
        password,
        onboarding,
      })
      return { userId: user.id, name: user.name, phone: user.phone }
    } catch (e) {
      toast("Couldn't sign you in", e?.message || "Please try again.", {
        tone: "error",
      })
      return null
    }
  }

  const logout = async () => {
    leaving.current = true
    try {
      if (sessionRef.current.demo) {
        revokeDemoMedia()
        setJudgeMode(false)
        dispatch({ type: "LOGOUT" })
        return
      }
      await signOut()
      resetLive()
      dispatch({ type: "LOGOUT" })
    } finally {
      leaving.current = false
    }
  }

  useEffect(() => {
    let busy = false
    const onExpired = async () => {
      if (
        busy ||
        leaving.current ||
        !sessionRef.current.role ||
        sessionRef.current.demo
      )
        return
      busy = true
      try {
        await logout()
        toast("Session expired", "Please log in again to continue.", {
          tone: "warn",
        })
      } finally {
        busy = false
      }
    }
    window.addEventListener("plughome:session-expired", onExpired)
    return () =>
      window.removeEventListener("plughome:session-expired", onExpired)
  }, [])

  const enter = ({ role, name, phone, x, y, userId, onboarding }) => {
    setWipe({
      x: x ?? window.innerWidth / 2,
      y: y ?? window.innerHeight / 2,
      phase: "in",
    })
    setTimeout(() => {
      dispatch({ type: "LOGIN", role, name, phone, userId })
      if (onboarding) {
        dispatch({
          type: "UPDATE_PROFILE",
          ...(role === "host"
            ? { hostDetails: onboarding }
            : { driverDetails: onboarding }),
        })
      }
      if (role === "driver" && onboarding?.currentSoc) {
        dispatch({ type: "SOC", soc: onboarding.currentSoc })
      }
      setWipe((w) => w && { ...w, phase: "out" })
      toast(
        `Welcome, ${name}`,
        role === "host"
          ? onboarding?.homeTitle
            ? `${onboarding.homeTitle} cockpit is ready.`
            : "Your host cockpit is ready."
          : onboarding?.evModel
            ? `Showing sockets compatible with ${onboarding.evModel}.`
            : "Nearby home sockets are on the map.",
      )
    }, 650)
    setTimeout(() => setWipe(null), 1000)
  }

  const enterDemo = ({ role, x, y }) => {
    setJudgeMode(true)
    revokeDemoMedia()
    setWipe({
      x: x ?? window.innerWidth / 2,
      y: y ?? window.innerHeight / 2,
      phase: "in",
    })
    setTimeout(() => {
      dispatch({ type: "DEMO_LOGIN", role })
      setWipe((w) => w && { ...w, phase: "out" })
      toast(
        "Judge demo · simulated",
        "Sample chargers and bookings on this device only — no money is charged and nothing is saved.",
        { tone: "warn" },
      )
    }, 650)
    setTimeout(() => setWipe(null), 1000)
  }

  return (
    <div className="relative min-h-screen overflow-x-clip">
      <div aria-hidden className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 dot-grid" />
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.08 }}
          transition={{ duration: 1 }}
          className="blob absolute -top-40 -left-40 h-[36rem] w-[36rem] rounded-full bg-parrot blur-3xl"
        />
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.08 }}
          transition={{ duration: 1 }}
          className="blob b2 absolute -bottom-40 -right-40 h-[40rem] w-[40rem] rounded-full bg-parrot-2 blur-3xl"
        />
      </div>

      {/* Email Verification Redirect Success Overlay */}
      <AnimatePresence>
        {redirectVerifiedUser && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[950] bg-white/95 backdrop-blur-md grid place-items-center p-6"
          >
            <motion.div
              initial={{ scale: 0.9, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              className="max-w-md w-full rounded-[2rem] bg-white border border-line shadow-2xl p-8 text-center space-y-4"
            >
              <div className="h-16 w-16 rounded-full bg-parrot/25 mx-auto grid place-items-center">
                <CheckCircle2 size={38} className="text-parrot-ink" />
              </div>
              <h2 className="font-display text-2xl font-extrabold text-ink">
                Email Verified Successfully!
              </h2>
              <p className="text-sm text-slate">
                Welcome, <strong>{redirectVerifiedUser.name}</strong>!
                Redirecting you to your PLUG-HOME{" "}
                {redirectVerifiedUser.role === "host" ? "Host" : "Driver"}{" "}
                portal…
              </p>
              <div className="flex justify-center pt-2">
                <Loader2 className="animate-spin text-parrot-ink" size={24} />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative">
        <ErrorBoundary>
          {state.session.role ? (
            <Portal onLogout={logout} />
          ) : (
            <Login onEnter={enter} onAuth={authenticate} onDemo={enterDemo} />
          )}
        </ErrorBoundary>
      </div>
      {wipe && (
        <motion.div
          className="fixed inset-0 z-[1000] bg-parrot pointer-events-none"
          initial={{
            clipPath: `circle(0px at ${wipe.x}px ${wipe.y}px)`,
            opacity: 1,
          }}
          animate={
            wipe.phase === "in"
              ? {
                  clipPath: `circle(150vmax at ${wipe.x}px ${wipe.y}px)`,
                  opacity: 1,
                }
              : {
                  clipPath: `circle(150vmax at ${wipe.x}px ${wipe.y}px)`,
                  opacity: 0,
                }
          }
          transition={
            wipe.phase === "in"
              ? { duration: 0.65, ease: EASE.inOut }
              : { duration: 0.3 }
          }
        />
      )}
      <AnimatePresence>
        {!online && (
          <motion.div
            role="status"
            initial={{ y: -12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -12, opacity: 0 }}
            transition={SPRING.snap}
            className="fixed z-[800] top-[72px] left-1/2 -translate-x-1/2 h-9 px-4 rounded-full bg-ink text-white text-sm font-semibold inline-flex items-center gap-2 shadow-lg whitespace-nowrap"
          >
            <WifiOff size={15} />
            {state.session.demo
              ? "You're offline — the judge demo keeps working"
              : "You're offline — live updates paused until you reconnect"}
          </motion.div>
        )}
      </AnimatePresence>
      <Toasts />
    </div>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  )
}
