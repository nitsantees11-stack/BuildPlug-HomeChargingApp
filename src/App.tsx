// @ts-nocheck
import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  BatteryCharging, Camera, Check, CheckCircle2, Cloud, Compass, Download,
  FileText, History, Home, Inbox, Leaf, Loader2, LogOut, Map as MapIcon,
  MapPin, Menu, PhoneCall, Plus, PlusCircle, RefreshCw, Save, Settings,
  ShieldCheck, Sliders, Trash2, User, WifiOff, X, Zap,
} from "lucide-react"
import { EASE, SPRING, co2, fetchRoute, hasLoc } from "./lib"
import { StoreProvider, useStore, useToast } from "./store"
import { Btn, ErrorBoundary, Logo, Toasts, Wordmark } from "./ui"
import Login from "./screens/Login"
import DriverFind from "./screens/DriverFind"
import DriverCharge from "./screens/DriverCharge"
import DriverHistory from "./screens/DriverHistory"
import { TripSheet } from "./screens/Trip"
import { HostBookings, HostList, HostOverview } from "./screens/Host"
import Proof from "./screens/Proof"
import { LiveNotifier } from "./screens/LiveMeter"
import {
  checkEmailRedirectCallback, getLiveUser, getSavedAvatar, getSavedOnboarding,
  isLive, saveAvatarPersistent, saveUserOnboarding, signInAs, signOut, supabase,
} from "./lib/supabase"
import { saveMyProfile } from "./lib/api"
import {
  probeBackend, resetLive, setJudgeMode, useBookings, useHosts, useRealtimeStatus,
} from "./lib/live"
import { revokeDemoMedia } from "./demo"

const TABS = {
  driver: [
    ["find", "Find Chargers", MapIcon],
    ["charge", "My Charge", Zap],
    ["history", "History", History],
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
  "Family Verified", "CCTV Guarded", "Restroom", "Shaded canopy", "Free Chai", "Solar",
]

function syncOnboardingStorage(userId, role, updatedDetails) {
  if (!userId) return
  saveUserOnboarding(userId, role, updatedDetails)
}

// Saves profile details & compact avatarThumb directly to Supabase Auth Cloud for this user
async function syncProfileToSupabaseCloud(patch) {
  if (!isLive || !supabase?.auth?.updateUser) return
  try {
    await supabase.auth.updateUser({ data: patch })
    await supabase.auth.refreshSession()
  } catch {}
  try {
    if (patch.name) await saveMyProfile({ name: patch.name })
  } catch {}
}

function DemoPill() {
  return (
    <span role="status" className="h-7 px-2.5 rounded-full bg-amber/15 text-[11px] font-bold inline-flex items-center gap-1.5">
      <span aria-hidden className="h-2 w-2 rounded-full bg-amber" />
      <span className="hidden sm:inline">Judge demo</span>
    </span>
  )
}

function RealtimePill() {
  const rt = useRealtimeStatus()
  const live = rt === "live"
  return (
    <span role="status" className="h-7 px-2.5 rounded-full bg-mint text-[11px] font-bold inline-flex items-center gap-1.5">
      <span aria-hidden className={`h-2 w-2 rounded-full ${live ? "bg-parrot" : "bg-amber animate-pulse"}`} />
      <span className="hidden sm:inline">{live ? "Live" : "Connecting…"}</span>
    </span>
  )
}

function SideDrawer({ open, onClose, activeSection, setActiveSection, onLogout, bookings }) {
  const { state, dispatch } = useStore()
  const toast = useToast()
  const fileInputRef = useRef(null)
  const [savingBackend, setSavingBackend] = useState(false)

  const role = state.session.role
  const userId = state.session.userId
  const baseOnboarding = getSavedOnboarding(userId, role) || {}
  const customDetails = role === "host" ? state.profile.hostDetails : state.profile.driverDetails
  const mergedProfile = { ...baseOnboarding, ...(customDetails || {}) }

  const [name, setName] = useState(state.session.name || "")
  const [phone, setPhone] = useState(state.session.phone || "")
  const [email, setEmail] = useState(state.profile.email || state.session.email || "")

  const [evModel, setEvModel] = useState(mergedProfile.evModel || "Tata Tigor.ev")
  const [batteryKwh, setBatteryKwh] = useState(mergedProfile.batteryKwh || 26)
  const [regNumber, setRegNumber] = useState(mergedProfile.regNumber || "DL01EV2026")
  const [currentSoc, setCurrentSoc] = useState(mergedProfile.currentSoc || state.user.soc || 26)
  const [connectorType, setConnectorType] = useState(mergedProfile.connectorType || "Both 15A & Type-2")
  const [carriesCable, setCarriesCable] = useState(mergedProfile.carriesCable || "Yes, in boot")
  const [maxDetourKm, setMaxDetourKm] = useState(mergedProfile.maxDetourKm || "2 km")
  const [upiId, setUpiId] = useState(mergedProfile.upiId || "")
  const [emergencyPhone, setEmergencyPhone] = useState(mergedProfile.emergencyPhone || "")
  const [perks, setPerks] = useState(mergedProfile.preferredPerks || mergedProfile.perks || ["Family Verified", "CCTV Guarded"])
  const [customPerkInput, setCustomPerkInput] = useState("")

  const [homeTitle, setHomeTitle] = useState(mergedProfile.homeTitle || `${state.session.name || "My"}'s Home Socket`)
  const [locality, setLocality] = useState(mergedProfile.locality || "Sector 62, Noida")
  const [socketType, setSocketType] = useState(mergedProfile.socketType || "7.2kW Fast")
  const [powerKw, setPowerKw] = useState(mergedProfile.powerKw || 7.2)
  const [ratePerKwh, setRatePerKwh] = useState(mergedProfile.ratePerKwh || 12)
  const [availabilitySlot, setAvailabilitySlot] = useState(mergedProfile.availabilitySlot || "24×7 Anytime")

  const [recordFilter, setRecordFilter] = useState("all")
  const [calcStartSoc, setCalcStartSoc] = useState(state.user.soc || 20)
  const [calcTargetSoc, setCalcTargetSoc] = useState(85)
  const [calcRate, setCalcRate] = useState(mergedProfile.ratePerKwh || 12)

  useEffect(() => {
    if (!open || !userId) return
    const saved = getSavedOnboarding(userId, role) || {}
    const roleSpecific = role === "host" ? state.profile.hostDetails : state.profile.driverDetails
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
    setMaxDetourKm(m.maxDetourKm || "2 km")
    setUpiId(m.upiId || "")
    setEmergencyPhone(m.emergencyPhone || "")
    setPerks(m.preferredPerks || m.perks || ["Family Verified", "CCTV Guarded"])
    setHomeTitle(m.homeTitle || `${state.session.name || "My"}'s Home Socket`)
    setLocality(m.locality || "Sector 62, Noida")
    setSocketType(m.socketType || "7.2kW Fast")
    setPowerKw(m.powerKw || 7.2)
    setRatePerKwh(m.ratePerKwh || 12)
    setAvailabilitySlot(m.availabilitySlot || "24×7 Anytime")
  }, [open, role, userId, state.session.name, state.profile.driverDetails, state.profile.hostDetails])

  const initials = (state.session.name || "U").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()

  const handlePhotoUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file || !userId) return
    if (file.size > 10 * 1024 * 1024) {
      return toast("Image too large", "Please choose a photo under 10 MB.", { tone: "warn" })
    }
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = async () => {
        // 1. Crisp 200x200 image for local account cache
        const c1 = document.createElement("canvas")
        let w1 = img.width, h1 = img.height
        if (w1 > h1) { if (w1 > 200) { h1 = Math.round((h1 * 200) / w1); w1 = 200 } }
        else if (h1 > 200) { w1 = Math.round((w1 * 200) / h1); h1 = 200 }
        c1.width = w1
        c1.height = h1
        c1.getContext("2d").drawImage(img, 0, 0, w1, h1)
        const displayDataUrl = c1.toDataURL("image/jpeg", 0.82)

        // 2. Ultra-compact <1.8KB thumbnail for Supabase Auth Cloud (so it survives browser quit & keeps JWT small)
        const c2 = document.createElement("canvas")
        let w2 = img.width, h2 = img.height
        if (w2 > h2) { if (w2 > 76) { h2 = Math.round((h2 * 76) / w2); w2 = 76 } }
        else if (h2 > 76) { w2 = Math.round((w2 * 76) / h2); h2 = 76 }
        c2.width = w2
        c2.height = h2
        c2.getContext("2d").drawImage(img, 0, 0, w2, h2)
        let cloudThumb = c2.toDataURL("image/jpeg", 0.58)
        if (cloudThumb.length > 2200) {
          cloudThumb = c2.toDataURL("image/jpeg", 0.42)
        }

        const userEmail = state.profile.email || state.session.email
        saveAvatarPersistent(displayDataUrl, userId, userEmail)
        dispatch({ type: "UPDATE_PROFILE", photoUrl: displayDataUrl })

        if (!state.session.demo && isLive) {
          await syncProfileToSupabaseCloud({ avatarThumb: cloudThumb, photoUrl: null })
          toast("Profile photo saved to Cloud!", "Tied permanently to your account ID.")
          return
        }
        toast("Profile photo updated", "Saved to your profile.")
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  }

  const handleRemovePhoto = async () => {
    if (!userId) return
    const userEmail = state.profile.email || state.session.email
    saveAvatarPersistent("", userId, userEmail)
    dispatch({ type: "UPDATE_PROFILE", photoUrl: "" })
    await syncProfileToSupabaseCloud({ avatarThumb: "", photoUrl: null })
    toast("Profile photo removed", "Switched back to your initials avatar.")
  }

  const togglePerk = (p) => {
    setPerks((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]))
  }

  const handleAddCustomPerk = () => {
    const clean = customPerkInput.trim()
    if (!clean) return
    if (!perks.includes(clean)) setPerks((prev) => [...prev, clean])
    setCustomPerkInput("")
  }

  const handleSaveProfile = async (e) => {
    e.preventDefault()
    if (!userId) return
    setSavingBackend(true)
    const cleanName = name.trim() || "User"
    try {
      if (role === "driver") {
        const driverDetails = {
          evModel: evModel.trim() || "Tata Tigor.ev",
          batteryKwh: Number(batteryKwh) || 26,
          regNumber: regNumber.trim().toUpperCase(),
          currentSoc: Number(currentSoc) || 26,
          connectorType: connectorType.trim() || "Both 15A & Type-2",
          carriesCable: carriesCable.trim() || "Yes, in boot",
          maxDetourKm: maxDetourKm.trim() || "2 km",
          preferredPerks: perks,
          upiId: upiId.trim(),
          emergencyPhone: emergencyPhone.trim(),
          updatedAt: new Date().toISOString(),
        }
        syncOnboardingStorage(userId, "driver", driverDetails)
        dispatch({
          type: "UPDATE_PROFILE", name: cleanName, phone: phone.trim(), email: email.trim(),
          soc: Number(currentSoc) || 26, driverDetails,
        })
        await syncProfileToSupabaseCloud({
          name: cleanName, full_name: cleanName, phone: phone.trim(),
          driverDetails, onboarding: driverDetails,
        })
      } else {
        const hostDetails = {
          homeTitle: homeTitle.trim(),
          locality: locality.trim(),
          socketType: socketType.trim() || "7.2kW Fast",
          powerKw: Number(powerKw) || 7.2,
          ratePerKwh: Number(ratePerKwh) || 12,
          availabilitySlot: availabilitySlot.trim() || "24×7 Anytime",
          perks,
          upiId: upiId.trim(),
          updatedAt: new Date().toISOString(),
        }
        syncOnboardingStorage(userId, "host", hostDetails)
        dispatch({
          type: "UPDATE_PROFILE", name: cleanName, phone: phone.trim(), email: email.trim(), hostDetails,
        })
        await syncProfileToSupabaseCloud({
          name: cleanName, full_name: cleanName, phone: phone.trim(),
          hostDetails, onboarding: hostDetails,
        })
      }
      toast("Profile synced to Cloud!", "Saved permanently to your account.")
    } finally {
      setSavingBackend(false)
    }
  }

  const myRecords = (bookings || []).filter(
    (b) => b.driverId === userId || b.hostOwnerId === userId || state.session.demo,
  )
  const filteredRecords = myRecords.filter((b) => {
    if (recordFilter === "all") return true
    if (recordFilter === "paid") return b.status === "paid"
    if (recordFilter === "active") return !["paid", "cancelled", "declined"].includes(b.status)
    return ["cancelled", "declined", "disputed"].includes(b.status)
  })

  const totalKwh = myRecords.reduce((acc, b) => acc + (Number(b.kwhUsed) || Number(b.estimateKwh) || 0), 0)
  const totalAmount = myRecords.reduce((acc, b) => acc + (Number(b.amount) || Number(b.estimateAmount) || 0), 0)
  const totalCo2 = co2(totalKwh)

  const exportRecordsCsv = () => {
    if (!myRecords.length) return toast("No records to export", "Complete a booking first.", { tone: "warn" })
    const headers = ["Booking ID", "Host Name", "Status", "kWh", "Rate", "Amount", "Ref", "Date"]
    const rows = myRecords.map((b) => [
      b.id || "", (b.hostName || "Host").replace(/,/g, " "), b.status || "",
      b.kwhUsed ?? b.estimateKwh ?? 0, b.rate ?? 12, b.amount ?? b.estimateAmount ?? 0,
      b.ref || "", new Date(b.paidAt || b.updatedAt || b.createdAt || Date.now()).toISOString(),
    ])
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n")
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }))
    const a = document.createElement("a")
    a.href = url
    a.download = `plughome-records-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast("Records exported", "Downloaded CSV file of your sessions.")
  }

  const neededSoc = Math.max(0, calcTargetSoc - calcStartSoc)
  const calcKwhNeeded = ((neededSoc / 100) * (Number(batteryKwh) || 26)).toFixed(1)
  const calcCost = Math.round(Number(calcKwhNeeded) * (Number(calcRate) || 12))
  const calcHoursFast = (Number(calcKwhNeeded) / 7.2).toFixed(1)
  const calcHours15A = (Number(calcKwhNeeded) / 3.3).toFixed(1)

  const MENU_TABS = [
    ["profile", "Edit Profile", User],
    ["records", "All Records", History],
    ["toolkit", "EV Toolkit", Compass],
    ["settings", "Settings", Settings],
  ]
  const displayedPerks = Array.from(new Set([...ALL_PERKS, ...perks]))

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose} className="fixed inset-0 z-[900] bg-ink/40 backdrop-blur-xs"
          />
          <motion.aside
            initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }}
            transition={{ duration: 0.32, ease: EASE.out }}
            className="fixed top-0 left-0 bottom-0 z-[910] w-full max-w-md bg-white border-r border-line shadow-2xl flex flex-col overflow-hidden"
          >
            <div className="p-5 bg-mint border-b border-line/70">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="relative shrink-0">
                    {state.profile.photoUrl ? (
                      <img src={state.profile.photoUrl} alt="Profile" className="h-16 w-16 rounded-2xl object-cover border-2 border-parrot shadow-sm" />
                    ) : (
                      <div className="h-16 w-16 rounded-2xl font-display font-extrabold text-xl grid place-items-center border-2 border-parrot/50 shadow-sm" style={{ background: "linear-gradient(135deg,#EAF6DC,#B5E86B)" }}>
                        {initials}
                      </div>
                    )}
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="absolute -bottom-1.5 -right-1.5 h-7 w-7 rounded-full btn-primary grid place-items-center shadow-md">
                      <Camera size={13} />
                    </button>
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="h-5 px-2 rounded-full btn-primary text-[10px] font-bold uppercase inline-flex items-center">{role}</span>
                      {state.profile.photoUrl && (
                        <button type="button" onClick={handleRemovePhoto} className="text-[11px] text-slate hover:text-ink inline-flex items-center gap-0.5">
                          <Trash2 size={11} /> Remove
                        </button>
                      )}
                    </div>
                    <h2 className="mt-1 font-display text-lg font-extrabold text-ink truncate">{state.session.name || "PLUG-HOME User"}</h2>
                    <p className="text-xs text-slate truncate">
                      {role === "driver" ? `🚗 ${evModel} · ${connectorType}` : `🏡 ${homeTitle} · ₹${ratePerKwh}/kWh`}
                    </p>
                  </div>
                </div>
                <button type="button" onClick={onClose} className="h-9 w-9 rounded-full bg-white hover:bg-mint-2 grid place-items-center text-slate hover:text-ink border border-line">
                  <X size={18} />
                </button>
              </div>
              <div className="mt-4 grid grid-cols-4 gap-1.5 bg-white p-1 rounded-2xl border border-line/70">
                {MENU_TABS.map(([id, label, Icon]) => (
                  <button
                    key={id} type="button" onClick={() => setActiveSection(id)}
                    className={`py-2 px-1.5 rounded-xl text-[11px] font-display font-bold flex flex-col items-center gap-1 transition-all ${activeSection === id ? "btn-primary shadow-xs" : "text-slate hover:text-ink hover:bg-mint"}`}
                  >
                    <Icon size={15} />
                    <span className="truncate max-w-full">{label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {activeSection === "profile" && (
                <form onSubmit={handleSaveProfile} className="space-y-4">
                  <div className="rounded-2xl bg-mint/60 border border-line p-3.5 flex items-center justify-between gap-3">
                    <div className="text-xs">
                      <p className="font-display font-bold text-ink">Profile Photo (Cloud Synced)</p>
                      <p className="text-slate mt-0.5">Tied strictly to {state.session.email || "your ID"}.</p>
                    </div>
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="h-9 px-3 rounded-xl bg-white border border-line text-xs font-display font-bold inline-flex items-center gap-1.5 hover:bg-mint shrink-0">
                      <Camera size={14} className="text-parrot-ink" /> Upload Photo
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="block text-xs font-semibold text-slate">
                      Full Name
                      <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full h-10 rounded-xl bg-mint px-3 text-sm text-ink font-medium outline-none focus:border-parrot border border-transparent" />
                    </label>
                    <label className="block text-xs font-semibold text-slate">
                      Mobile Number (+91)
                      <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} className="mt-1 w-full h-10 rounded-xl bg-mint px-3 text-sm text-ink font-mono outline-none focus:border-parrot border border-transparent" />
                    </label>
                  </div>

                  <label className="block text-xs font-semibold text-slate">
                    Email Address
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full h-10 rounded-xl bg-mint px-3 text-sm text-ink outline-none focus:border-parrot border border-transparent" />
                  </label>

                  {role === "driver" ? (
                    <div className="pt-2 border-t border-line space-y-3.5">
                      <p className="text-xs font-bold uppercase tracking-wider text-parrot-ink">EV Vehicle & Charging Details</p>
                      <div>
                        <span className="block text-xs font-semibold text-slate mb-1.5">Select or Type Your EV Model</span>
                        <div className="grid grid-cols-2 gap-1.5 mb-2">
                          {EV_MODELS.map(([m, kwh]) => (
                            <button
                              key={m} type="button" onClick={() => { setEvModel(m); setBatteryKwh(kwh) }}
                              className={`h-8 px-2.5 rounded-xl text-xs font-display font-bold border text-left truncate flex items-center gap-1.5 ${evModel === m ? "bg-parrot/20 border-parrot text-ink" : "bg-mint border-transparent text-slate"}`}
                            >
                              {evModel === m && <Check size={12} className="text-parrot-ink shrink-0" />}
                              <span className="truncate">{m}</span>
                            </button>
                          ))}
                        </div>
                        <input value={evModel} onChange={(e) => setEvModel(e.target.value)} placeholder="Or type custom EV model..." className="w-full h-10 rounded-xl bg-mint px-3 text-sm text-ink font-medium border border-line focus:border-parrot outline-none" />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <label className="block text-xs font-semibold text-slate">
                          Battery Size (kWh)
                          <input type="number" step="0.5" value={batteryKwh} onChange={(e) => setBatteryKwh(e.target.value)} className="mt-1 w-full h-10 rounded-xl bg-mint px-3 font-mono text-sm text-ink outline-none" />
                        </label>
                        <label className="block text-xs font-semibold text-slate">
                          Vehicle Reg. Plate
                          <input value={regNumber} onChange={(e) => setRegNumber(e.target.value.toUpperCase())} className="mt-1 w-full h-10 rounded-xl bg-mint px-3 font-mono text-sm uppercase text-ink outline-none" />
                        </label>
                      </div>

                      <div className="rounded-xl bg-mint p-3">
                        <div className="flex justify-between text-xs font-bold">
                          <span className="text-parrot-ink flex items-center gap-1"><BatteryCharging size={14} /> Current Battery SoC</span>
                          <span className="font-mono text-ink">{currentSoc}%</span>
                        </div>
                        <input type="range" min="5" max="95" value={currentSoc} onChange={(e) => setCurrentSoc(Number(e.target.value))} className="mt-1.5 w-full accent-[#72D600]" />
                      </div>

                      <div>
                        <span className="block text-xs font-semibold text-slate mb-1.5">Supported Charging Connector</span>
                        <div className="grid grid-cols-3 gap-1.5 mb-2">
                          {["15A Plug", "7.2kW Fast", "Both 15A & Type-2"].map((c) => (
                            <button
                              key={c} type="button" onClick={() => setConnectorType(c)}
                              className={`h-8 px-2 rounded-xl text-[11px] font-display font-bold border truncate ${connectorType === c ? "bg-parrot/20 border-parrot text-ink" : "bg-mint border-transparent text-slate"}`}
                            >
                              {c}
                            </button>
                          ))}
                        </div>
                        <input value={connectorType} onChange={(e) => setConnectorType(e.target.value)} placeholder="Or type connector spec..." className="w-full h-10 rounded-xl bg-mint px-3 text-sm text-ink border border-line focus:border-parrot outline-none" />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <label className="block text-xs font-semibold text-slate">
                          Your UPI ID
                          <input value={upiId} onChange={(e) => setUpiId(e.target.value)} placeholder="user@okaxis" className="mt-1 w-full h-10 rounded-xl bg-mint px-3 font-mono text-xs text-ink outline-none" />
                        </label>
                        <label className="block text-xs font-semibold text-slate">
                          Emergency Contact
                          <input value={emergencyPhone} onChange={(e) => setEmergencyPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="98XXXXXX00" className="mt-1 w-full h-10 rounded-xl bg-mint px-3 font-mono text-xs text-ink outline-none" />
                        </label>
                      </div>
                    </div>
                  ) : (
                    <div className="pt-2 border-t border-line space-y-3">
                      <p className="text-xs font-bold uppercase tracking-wider text-parrot-ink">Home Socket & Charging Details</p>
                      <label className="block text-xs font-semibold text-slate">
                        Home / Driveway Listing Title
                        <input value={homeTitle} onChange={(e) => setHomeTitle(e.target.value)} className="mt-1 w-full h-10 rounded-xl bg-mint px-3 text-sm text-ink outline-none" />
                      </label>
                      <label className="block text-xs font-semibold text-slate">
                        Sector / Locality
                        <input value={locality} onChange={(e) => setLocality(e.target.value)} className="mt-1 w-full h-10 rounded-xl bg-mint px-3 text-sm text-ink outline-none" />
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="block text-xs font-semibold text-slate">
                          Socket Type
                          <input value={socketType} onChange={(e) => setSocketType(e.target.value)} className="mt-1 w-full h-10 rounded-xl bg-mint px-3 text-xs text-ink border border-line outline-none" />
                        </label>
                        <label className="block text-xs font-semibold text-slate">
                          Power (kW)
                          <input type="number" step="0.1" value={powerKw} onChange={(e) => setPowerKw(e.target.value)} className="mt-1 w-full h-10 rounded-xl bg-mint px-3 font-mono text-xs text-ink border border-line outline-none" />
                        </label>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <label className="block text-xs font-semibold text-slate">
                          Tariff Rate (₹/kWh)
                          <input type="number" value={ratePerKwh} onChange={(e) => setRatePerKwh(e.target.value)} className="mt-1 w-full h-10 rounded-xl bg-mint px-3 font-mono text-sm text-ink outline-none" />
                        </label>
                        <label className="block text-xs font-semibold text-slate">
                          Host Payout UPI ID
                          <input value={upiId} onChange={(e) => setUpiId(e.target.value)} className="mt-1 w-full h-10 rounded-xl bg-mint px-3 font-mono text-xs text-ink outline-none" />
                        </label>
                      </div>
                    </div>
                  )}

                  <div>
                    <span className="block text-xs font-semibold text-slate mb-1.5">Safety & Hospitality Perks</span>
                    <div className="grid grid-cols-2 gap-1.5 mb-2">
                      {displayedPerks.map((p) => (
                        <button
                          key={p} type="button" onClick={() => togglePerk(p)}
                          className={`h-8 px-2.5 rounded-xl text-xs font-display font-bold border flex items-center gap-1.5 ${perks.includes(p) ? "bg-parrot/20 border-parrot text-ink" : "bg-mint border-transparent text-slate"}`}
                        >
                          {perks.includes(p) && <Check size={12} className="text-parrot-ink shrink-0" />}
                          <span className="truncate">{p}</span>
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-1.5">
                      <input
                        value={customPerkInput} onChange={(e) => setCustomPerkInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddCustomPerk() } }}
                        placeholder="Type custom perk (e.g. WiFi, Air Pump)..."
                        className="flex-1 h-9 rounded-xl bg-mint px-3 text-xs text-ink border border-line outline-none"
                      />
                      <button type="button" onClick={handleAddCustomPerk} className="h-9 px-3 rounded-xl bg-mint-2 hover:bg-parrot/30 text-xs font-display font-bold text-ink inline-flex items-center gap-1">
                        <Plus size={13} /> Add
                      </button>
                    </div>
                  </div>

                  <Btn type="submit" icon={savingBackend ? Loader2 : Save} disabled={savingBackend} className="w-full">
                    {savingBackend ? "Saving to Cloud…" : "Save All Profile Details"}
                  </Btn>
                </form>
              )}

              {activeSection === "records" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-2.5">
                    <div className="rounded-2xl bg-mint p-3 border border-line/60">
                      <p className="text-[11px] text-slate">Sessions</p>
                      <p className="font-mono text-xl font-bold text-ink">{myRecords.length}</p>
                    </div>
                    <div className="rounded-2xl bg-mint p-3 border border-line/60">
                      <p className="text-[11px] text-slate">Energy</p>
                      <p className="font-mono text-xl font-bold text-ink">{totalKwh.toFixed(1)} kWh</p>
                    </div>
                    <div className="rounded-2xl bg-mint p-3 border border-line/60">
                      <p className="text-[11px] text-slate">{role === "host" ? "Earned" : "Spent"}</p>
                      <p className="font-mono text-xl font-bold text-parrot-ink">₹{Math.round(totalAmount)}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex gap-1 bg-mint p-1 rounded-xl">
                      {[["all", "All"], ["active", "Active"], ["paid", "Paid"]].map(([id, label]) => (
                        <button key={id} type="button" onClick={() => setRecordFilter(id)} className={`h-7 px-2.5 rounded-lg text-xs font-display font-bold ${recordFilter === id ? "bg-white text-ink" : "text-slate"}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                    <button type="button" onClick={exportRecordsCsv} className="h-8 px-3 rounded-xl bg-mint text-xs font-display font-bold inline-flex items-center gap-1.5 text-ink">
                      <Download size={13} /> Export CSV
                    </button>
                  </div>
                  {filteredRecords.length === 0 ? (
                    <div className="rounded-2xl border border-line p-8 text-center space-y-2">
                      <FileText size={28} className="mx-auto text-mute" />
                      <p className="font-display font-bold text-sm text-ink">No records yet</p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {filteredRecords.map((b) => (
                        <div key={b.id} className="rounded-2xl border border-line p-3.5 bg-white space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="font-display font-bold text-sm text-ink">{b.hostName || "Home Charger"}</p>
                            <span className="h-6 px-2.5 rounded-full text-[11px] font-bold uppercase bg-parrot/20 text-parrot-ink inline-flex items-center">{b.status}</span>
                          </div>
                          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-line/60 text-xs font-mono">
                            <span>{(b.kwhUsed ?? b.estimateKwh ?? 0).toFixed(1)} kWh</span>
                            <span>₹{b.amount ?? b.estimateAmount ?? 0}</span>
                            <span className="text-parrot-ink">{co2(b.kwhUsed ?? b.estimateKwh ?? 0).toFixed(1)} kg CO₂</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeSection === "toolkit" && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-line p-4 space-y-3 bg-mint/40">
                    <h3 className="font-display font-bold text-sm text-ink flex items-center gap-2"><Zap size={16} className="text-parrot-ink" /> Charge Time & Bill Estimator</h3>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <label>Start %<input type="number" value={calcStartSoc} onChange={(e) => setCalcStartSoc(Number(e.target.value))} className="mt-1 w-full h-9 rounded-xl bg-white px-2.5 font-mono border border-line" /></label>
                      <label>Target %<input type="number" value={calcTargetSoc} onChange={(e) => setCalcTargetSoc(Number(e.target.value))} className="mt-1 w-full h-9 rounded-xl bg-white px-2.5 font-mono border border-line" /></label>
                      <label>₹/kWh<input type="number" value={calcRate} onChange={(e) => setCalcRate(Number(e.target.value))} className="mt-1 w-full h-9 rounded-xl bg-white px-2.5 font-mono border border-line" /></label>
                    </div>
                    <div className="grid grid-cols-3 gap-2 rounded-xl bg-white p-3 border border-line text-center font-mono text-xs font-bold">
                      <div><p className="text-[10px] text-slate">Energy</p>{calcKwhNeeded} kWh</div>
                      <div className="text-parrot-ink"><p className="text-[10px] text-slate">Est. Bill</p>₹{calcCost}</div>
                      <div><p className="text-[10px] text-slate">7.2kW / 15A</p>{calcHoursFast}h / {calcHours15A}h</div>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-line p-4 space-y-2">
                    <h3 className="font-display font-bold text-sm text-ink flex items-center gap-2"><Leaf size={16} className="text-parrot-ink" /> Green Carbon Passbook</h3>
                    <p className="text-xs text-slate">Total CO₂ Saved: <strong className="font-mono text-ink">{totalCo2.toFixed(1)} kg</strong> (🌳 {(totalCo2 / 21).toFixed(1)} tree-years)</p>
                  </div>
                </div>
              )}

              {activeSection === "settings" && (
                <div className="space-y-3">
                  {[
                    ["notifications", "Live Booking & Meter Alerts", "Instant alerts on session updates"],
                    ["soundEffects", "Charging Sound Effects", "Audio feedback on meter confirmation"],
                    ["autoGps", "Auto-Detect GPS on Launch", "Center map on your current locality"],
                  ].map(([key, title, sub]) => (
                    <label key={key} className="flex items-center justify-between gap-3 rounded-2xl bg-mint p-3.5 cursor-pointer text-xs">
                      <div><p className="font-semibold text-ink">{title}</p><p className="text-slate text-[11px]">{sub}</p></div>
                      <input type="checkbox" checked={Boolean(state.settings[key])} onChange={(e) => dispatch({ type: "UPDATE_SETTINGS", patch: { [key]: e.target.checked } })} className="h-4 w-4 rounded accent-[#72D600]" />
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-line bg-mint/40 flex items-center justify-between gap-2">
              <button type="button" onClick={() => dispatch({ type: "SET_ROLE", role: role === "host" ? "driver" : "host" })} className="h-10 px-3.5 rounded-xl bg-white border border-line text-xs font-display font-bold inline-flex items-center gap-1.5 hover:bg-mint">
                <RefreshCw size={14} /> Switch to {role === "host" ? "Driver" : "Host"}
              </button>
              <button type="button" onClick={() => { onClose(); onLogout() }} className="h-10 px-3.5 rounded-xl bg-white border border-line text-xs font-display font-bold text-ink inline-flex items-center gap-1.5 hover:bg-mint">
                <LogOut size={14} /> Log out
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
  const pending = allBookings.filter((b) => b.hostOwnerId === state.session.userId && b.status === "requested").length

  const savedOnboarding = getSavedOnboarding(state.session.userId, role) || {}
  const customRoleDetails = role === "host" ? state.profile.hostDetails : state.profile.driverDetails
  const profileDetails = { ...savedOnboarding, ...(customRoleDetails || {}) }

  useEffect(() => {
    const f = () => setScrolled(window.scrollY > 8)
    window.addEventListener("scroll", f)
    return () => window.removeEventListener("scroll", f)
  }, [])

  const initials = (state.session.name || "U").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()
  const go = (t) => dispatch({ type: "TAB", role, tab: t })
  const openDrawerSection = (sec) => { setDrawerSection(sec); setMenu(false); setDrawerOpen(true) }

  return (
    <>
      <SideDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} activeSection={drawerSection} setActiveSection={setDrawerSection} onLogout={onLogout} bookings={allBookings} />
      <motion.header initial={{ y: -64 }} animate={{ y: 0 }} transition={{ duration: 0.4, ease: EASE.out }} className={`sticky top-0 z-[700] h-16 bg-white/85 backdrop-blur border-b border-line/60 ${scrolled ? "shadow-md" : ""}`}>
        <div className="h-full px-4 md:px-6 flex items-center gap-3 md:gap-4">
          <button type="button" aria-label="Open menu" onClick={() => setDrawerOpen(true)} className="h-10 w-10 rounded-xl bg-mint hover:bg-mint-2 border border-line/80 grid place-items-center text-ink shrink-0">
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2 shrink-0">
            <Logo size={30} />
            <Wordmark className="text-lg hidden sm:inline" />
          </div>
          <nav role="tablist" className="hidden md:flex flex-1 justify-center gap-1">
            {TABS[role].map(([id, label, Icon]) => (
              <button key={id} role="tab" aria-selected={tab === id} onClick={() => go(id)} className={`relative h-11 px-4 rounded-full text-sm font-display font-bold inline-flex items-center gap-2 ${tab === id ? "text-ink" : "text-slate hover:text-ink hover:bg-mint"}`}>
                <Icon size={17} /> {label}
                {id === "bookings" && pending > 0 && <span className="h-5 min-w-5 px-1 rounded-full btn-primary text-[11px] font-mono grid place-items-center">{pending}</span>}
                {tab === id && <motion.span layoutId="tab-underline" transition={SPRING.snap} className="absolute left-3 right-3 -bottom-[10px] h-1 rounded-full bg-parrot" />}
              </button>
            ))}
          </nav>
          <div className="ml-auto md:ml-0 flex items-center gap-2 shrink-0">
            {demo ? <DemoPill /> : <RealtimePill />}
            {role === "driver" && (
              <span className="hidden lg:inline-flex h-9 px-3 rounded-full bg-mint text-sm font-medium items-center gap-1.5 max-w-[220px]">
                <MapPin size={15} className="text-parrot-ink shrink-0" />
                <span className="truncate">{state.user.areaName || "Location not shared"}</span>
              </span>
            )}
            <span className="h-7 px-3 rounded-full btn-primary text-[11px] font-bold tracking-wider inline-flex items-center">{role.toUpperCase()}</span>
            <div className="relative">
              <button aria-label="Account menu" onClick={() => setMenu((m) => !m)} className="h-11 w-11 rounded-full font-display font-bold text-sm grid place-items-center overflow-hidden border border-parrot/40" style={{ background: "linear-gradient(135deg,#EAF6DC,#B5E86B)" }}>
                {state.profile.photoUrl ? <img src={state.profile.photoUrl} alt="User" className="h-full w-full object-cover" /> : initials}
              </button>
              <AnimatePresence>
                {menu && (
                  <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="absolute right-0 mt-2 w-64 rounded-2xl bg-white border border-line shadow-xl p-2">
                    <div className="px-3 py-2 rounded-xl bg-mint mb-1 text-xs">
                      <p className="font-display font-bold text-sm text-ink truncate">{state.session.name || "User"}</p>
                      {profileDetails?.evModel && role === "driver" && <p className="text-slate mt-0.5 truncate">🚗 {profileDetails.evModel}</p>}
                    </div>
                    <button onClick={() => openDrawerSection("profile")} className="w-full h-10 px-3 rounded-xl text-sm font-semibold flex items-center gap-2 hover:bg-mint"><User size={16} /> Edit Profile & Photo</button>
                    <button onClick={() => openDrawerSection("records")} className="w-full h-10 px-3 rounded-xl text-sm font-semibold flex items-center gap-2 hover:bg-mint"><History size={16} /> All Records</button>
                    <button onClick={() => openDrawerSection("toolkit")} className="w-full h-10 px-3 rounded-xl text-sm font-semibold flex items-center gap-2 hover:bg-mint"><Compass size={16} /> EV Toolkit</button>
                    <button onClick={() => { dispatch({ type: "SET_ROLE", role: role === "host" ? "driver" : "host" }); setMenu(false) }} className="w-full h-10 px-3 rounded-xl text-sm font-semibold flex items-center gap-2 hover:bg-mint"><RefreshCw size={16} /> Switch to {role === "host" ? "Driver" : "Host"}</button>
                    <button onClick={() => { setMenu(false); onLogout() }} className="w-full h-10 px-3 rounded-xl text-sm font-semibold flex items-center gap-2 hover:bg-mint"><LogOut size={16} /> Log out</button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </motion.header>
      <nav role="tablist" className="md:hidden fixed bottom-0 inset-x-0 z-[700] bg-white border-t border-line flex pb-[env(safe-area-inset-bottom)]">
        {TABS[role].map(([id, label, Icon]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => go(id)} className={`relative flex-1 h-16 flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${tab === id ? "text-ink" : "text-mute"}`}>
            <Icon size={20} /> {label.split(" ")[0]}
          </button>
        ))}
      </nav>
    </>
  )
}

function HostSync() {
  const { dispatch } = useStore()
  const { hosts, loading, error } = useHosts(true)
  useEffect(() => {
    if (loading || (error && !hosts.length)) return
    dispatch({ type: "HOSTS", hosts })
  }, [hosts, loading])
  useEffect(() => () => dispatch({ type: "HOSTS", hosts: [] }), [])
  return null
}

function Portal({ onLogout }) {
  const { state, dispatch } = useStore()
  const role = state.session.role
  const demo = state.session.demo
  const uid = state.session.userId
  const tab = role === "host" ? state.hostTab : state.driverTab

  useEffect(() => {
    if (!isLive || demo || !uid || !supabase?.auth?.getUser) return
    let active = true
    ;(async () => {
      try {
        const { data } = await supabase.auth.getUser()
        const user = data?.user
        if (!active || !user || user.id !== uid) return

        const meta = user.user_metadata || {}
        const email = user.email || state.session.email || ""
        const exactPhoto =
          getSavedAvatar(uid, email) || meta.avatarThumb || meta.photoUrl || ""

        if (exactPhoto) saveAvatarPersistent(exactPhoto, uid, email)
        if (meta.driverDetails) saveUserOnboarding(uid, "driver", meta.driverDetails)
        if (meta.hostDetails) saveUserOnboarding(uid, "host", meta.hostDetails)

        dispatch({
          type: "HYDRATE_BACKEND_PROFILE",
          meta: {
            id: user.id,
            name: meta.name || meta.full_name || state.session.name,
            phone: meta.phone || state.session.phone,
            photoUrl: exactPhoto,
            driverDetails: meta.driverDetails || (role === "driver" ? meta.onboarding : null),
            hostDetails: meta.hostDetails || (role === "host" ? meta.onboarding : null),
          },
          email,
        })
      } catch {}
    })()
    return () => { active = false }
  }, [uid, demo])

  const goDriver = async (h) => {
    dispatch({ type: "SET_ROLE", role: "driver" })
    dispatch({ type: "TAB", role: "driver", tab: "find" })
    dispatch({ type: "SELECT", id: h.id })
    if (!hasLoc(h) || !hasLoc(state.user)) return
    const r = await fetchRoute(state.user, h)
    if (r) dispatch({ type: "ROUTE", route: { hostId: h.id, ...r } })
  }

  const screens = {
    "driver:find": <DriverFind />,
    "driver:charge": <DriverCharge />,
    "driver:history": <DriverHistory />,
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
        <motion.main key={`${role}:${tab}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
          <ErrorBoundary>{screens[`${role}:${tab}`]}</ErrorBoundary>
        </motion.main>
      </AnimatePresence>
      <ErrorBoundary>
        <TripSheet />
      </ErrorBoundary>
    </div>
  )
}

function useOnline() {
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine !== false)
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false)
    window.addEventListener("online", on)
    window.addEventListener("offline", off)
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off) }
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

  useEffect(() => { if (isLive) probeBackend() }, [])

  useEffect(() => {
    if (!isLive) return
    let mounted = true
    checkEmailRedirectCallback().then((user) => {
      if (!mounted || !user) return
      setRedirectVerifiedUser(user)
      setTimeout(() => {
        if (!mounted) return
        setRedirectVerifiedUser(null)
        enter({
          role: user.role || "driver",
          name: user.name || "Verified User",
          phone: user.phone || "",
          email: user.email || "",
          userId: user.id,
          photoUrl: user.photoUrl || "",
          driverDetails: user.driverDetails || null,
          hostDetails: user.hostDetails || null,
          onboarding: user.onboarding,
        })
      }, 1800)
    }).catch(() => {})
    return () => { mounted = false }
  }, [])

  const authenticate = async ({ role, name, phone, email, password, onboarding }) => {
    if (!isLive) {
      toast("Backend not configured", "No Supabase project connected.", { tone: "error" })
      return null
    }
    try {
      const user = await signInAs({ name, role, phone, email, password, onboarding })
      return {
        userId: user.id,
        name: user.name,
        phone: user.phone,
        email: user.email || email,
        photoUrl: user.photoUrl || "",
        driverDetails: user.driverDetails || null,
        hostDetails: user.hostDetails || null,
        onboarding: user.onboarding,
      }
    } catch (e) {
      toast("Couldn't sign you in", e?.message || "Please try again.", { tone: "error" })
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

  const enter = ({ role, name, phone, email, x, y, userId, photoUrl, driverDetails, hostDetails, onboarding }) => {
    const liveUser = getLiveUser()
    const matchedLive = liveUser && liveUser.id === userId ? liveUser : null
    const finalName = matchedLive?.name || name
    const finalPhone = matchedLive?.phone || phone || ""
    const finalEmail = matchedLive?.email || email || ""
    const finalPhoto =
      photoUrl ||
      matchedLive?.photoUrl ||
      getSavedAvatar(userId, finalEmail) ||
      ""
    const finalDriver = driverDetails || matchedLive?.driverDetails || (role === "driver" ? onboarding : null)
    const finalHost = hostDetails || matchedLive?.hostDetails || (role === "host" ? onboarding : null)

    setWipe({ x: x ?? window.innerWidth / 2, y: y ?? window.innerHeight / 2, phase: "in" })
    setTimeout(() => {
      dispatch({
        type: "LOGIN",
        role,
        name: finalName,
        phone: finalPhone,
        email: finalEmail,
        userId,
        photoUrl: finalPhoto,
        driverDetails: finalDriver,
        hostDetails: finalHost,
        onboarding: matchedLive?.onboarding || onboarding,
      })
      if (role === "driver" && (finalDriver?.currentSoc || onboarding?.currentSoc)) {
        dispatch({ type: "SOC", soc: finalDriver?.currentSoc || onboarding?.currentSoc })
      }
      setWipe((w) => w && { ...w, phase: "out" })
      toast(`Welcome, ${finalName}`, "Your PLUG-HOME portal is ready.")
    }, 650)
    setTimeout(() => setWipe(null), 1000)
  }

  const enterDemo = ({ role, x, y }) => {
    setJudgeMode(true)
    revokeDemoMedia()
    setWipe({ x: x ?? window.innerWidth / 2, y: y ?? window.innerHeight / 2, phase: "in" })
    setTimeout(() => {
      dispatch({ type: "DEMO_LOGIN", role })
      setWipe((w) => w && { ...w, phase: "out" })
      toast("Judge demo · simulated", "Sample chargers and bookings on this device only.", { tone: "warn" })
    }, 650)
    setTimeout(() => setWipe(null), 1000)
  }

  return (
    <div className="relative min-h-screen overflow-x-clip">
      <div className="relative">
        <ErrorBoundary>
          {state.session.role ? <Portal onLogout={logout} /> : <Login onEnter={enter} onAuth={authenticate} onDemo={enterDemo} />}
        </ErrorBoundary>
      </div>
      <AnimatePresence>
        {!online && (
          <motion.div role="status" initial={{ y: -12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -12, opacity: 0 }} className="fixed z-[800] top-[72px] left-1/2 -translate-x-1/2 h-9 px-4 rounded-full bg-ink text-white text-sm font-semibold inline-flex items-center gap-2 shadow-lg">
            <WifiOff size={15} /> You're offline
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
