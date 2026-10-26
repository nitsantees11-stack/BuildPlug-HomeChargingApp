// @ts-nocheck
import { createContext, useContext, useReducer } from "react"
import {
  DEMO_AREA,
  DEMO_LOC,
  DEMO_USERS,
  demoHosts,
  demoState,
  demoStep,
} from "./demo"
import { getSavedAvatar, saveAvatarPersistent } from "./lib/supabase"

const STORAGE_PREFIX = "plughome:user_prefs:"
const LAST_USER_KEY = "plughome:last_user_prefs"
const FALLBACK_AVATAR_KEY = "plughome:avatar_backup"

function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

export function loadPersistedUserPrefs(userId, email, name) {
  if (typeof window === "undefined") return null
  try {
    const keysToTry = [
      userId && `${STORAGE_PREFIX}${userId}`,
      email && `${STORAGE_PREFIX}email:${email.trim().toLowerCase()}`,
      name && `${STORAGE_PREFIX}name:${name.trim().toLowerCase()}`,
      LAST_USER_KEY,
    ].filter(Boolean)

    let merged = null
    for (const k of keysToTry) {
      const raw = localStorage.getItem(k)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === "object") {
          if (!merged) {
            merged = { ...parsed }
          } else {
            if (!merged.photoUrl && parsed.photoUrl) merged.photoUrl = parsed.photoUrl
            if (!merged.driverDetails && parsed.driverDetails)
              merged.driverDetails = parsed.driverDetails
            if (!merged.hostDetails && parsed.hostDetails)
              merged.hostDetails = parsed.hostDetails
            if (!merged.phone && parsed.phone) merged.phone = parsed.phone
            if (!merged.email && parsed.email) merged.email = parsed.email
          }
        }
      }
    }

    // Agar kisi purani plughome key mein photo पड़ी ho toh use bhi recover karo
    if (merged && !merged.photoUrl) {
      const backupPhoto =
        getSavedAvatar() || localStorage.getItem(FALLBACK_AVATAR_KEY) || ""
      if (backupPhoto) {
        merged.photoUrl = backupPhoto
      } else {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (key && key.startsWith(STORAGE_PREFIX)) {
            try {
              const p = JSON.parse(localStorage.getItem(key) || "{}")
              if (p?.photoUrl) {
                merged.photoUrl = p.photoUrl
                break
              }
            } catch {}
          }
        }
      }
    }

    return merged
  } catch {
    return null
  }
}

export function savePersistedUserPrefs(userId, data) {
  if (typeof window === "undefined" || !data) return
  try {
    const existing = loadPersistedUserPrefs(userId, data.email, data.name)
    const finalPhoto =
      data.photoUrl !== undefined && data.photoUrl !== ""
        ? data.photoUrl
        : data.photoUrl === ""
          ? existing?.photoUrl || getSavedAvatar() || ""
          : existing?.photoUrl || getSavedAvatar() || ""

    if (finalPhoto) {
      saveAvatarPersistent(finalPhoto)
      safeSetItem(FALLBACK_AVATAR_KEY, finalPhoto)
    }

    const fullData = { ...data, photoUrl: finalPhoto }
    const payload = JSON.stringify(fullData)
    // Agar Base64 photo badi hone se 5MB quota full ho, toh lightweight copy save karo
    const lightPayload = JSON.stringify({ ...fullData, photoUrl: "" })

    const writeKey = (k) => {
      if (!k) return
      if (!safeSetItem(k, payload)) {
        safeSetItem(k, lightPayload)
      }
    }

    if (userId) writeKey(`${STORAGE_PREFIX}${userId}`)
    if (data.email) {
      writeKey(`${STORAGE_PREFIX}email:${data.email.trim().toLowerCase()}`)
    }
    if (data.name) {
      writeKey(`${STORAGE_PREFIX}name:${data.name.trim().toLowerCase()}`)
    }
    writeKey(LAST_USER_KEY)
  } catch {}
}

let tid = 0
const SIGNED_OUT = {
  role: null,
  name: "",
  phone: "",
  email: "",
  userId: null,
  demo: false,
}
const NO_LOC = { lat: null, lng: null, areaName: "", located: false }

const DEFAULT_SETTINGS = {
  notifications: true,
  soundEffects: true,
  autoGps: true,
  lowSocAlert: 20,
  preferredRadiusKm: 5,
  autoSaveReceipts: true,
}

const initialSaved =
  typeof window !== "undefined" ? loadPersistedUserPrefs(null, null, null) : null

const initial = {
  session: SIGNED_OUT,
  driverTab: "find",
  hostTab: "overview",
  user: { ...NO_LOC, soc: 14 },
  hosts: [],
  selectedHostId: null,
  route: null,
  toasts: [],
  demo: null,
  profile: {
    photoUrl:
      getSavedAvatar() ||
      initialSaved?.photoUrl ||
      (typeof window !== "undefined"
        ? localStorage.getItem(FALLBACK_AVATAR_KEY) || ""
        : ""),
    email: initialSaved?.email || "",
    driverDetails: initialSaved?.driverDetails || null,
    hostDetails: initialSaved?.hostDetails || null,
  },
  settings: DEFAULT_SETTINGS,
  savedRecords: [],
}

const upsert = (list, item) =>
  list.some((x) => x.id === item.id)
    ? list.map((x) => (x.id === item.id ? item : x))
    : [item, ...list]

function reducer(s, a) {
  switch (a.type) {
    case "LOGIN": {
      const saved = loadPersistedUserPrefs(a.userId, a.email, a.name)
      const resolvedName = saved?.name || a.name
      const resolvedPhone = saved?.phone || a.phone
      const resolvedEmail = saved?.email || a.email || ""
      const resolvedPhoto =
        a.photoUrl ||
        a.onboarding?.photoUrl ||
        saved?.photoUrl ||
        getSavedAvatar() ||
        s.profile.photoUrl ||
        (typeof window !== "undefined"
          ? localStorage.getItem(FALLBACK_AVATAR_KEY) || ""
          : "")
      const resolvedDriver =
        saved?.driverDetails ||
        (a.role === "driver" ? a.onboarding : null) ||
        s.profile.driverDetails ||
        null
      const resolvedHost =
        saved?.hostDetails ||
        (a.role === "host" ? a.onboarding : null) ||
        s.profile.hostDetails ||
        null

      savePersistedUserPrefs(a.userId, {
        name: resolvedName,
        phone: resolvedPhone,
        email: resolvedEmail,
        photoUrl: resolvedPhoto,
        driverDetails: resolvedDriver,
        hostDetails: resolvedHost,
        settings: saved?.settings || s.settings,
        savedRecords: saved?.savedRecords || s.savedRecords,
      })

      return {
        ...s,
        session: {
          role: a.role,
          name: resolvedName,
          phone: resolvedPhone,
          email: resolvedEmail,
          userId: a.userId,
          demo: false,
        },
        driverTab: a.tab || "find",
        hostTab: "overview",
        demo: null,
        profile: {
          photoUrl: resolvedPhoto,
          email: resolvedEmail,
          driverDetails: resolvedDriver,
          hostDetails: resolvedHost,
        },
        settings: { ...DEFAULT_SETTINGS, ...(saved?.settings || {}) },
        savedRecords: saved?.savedRecords || [],
      }
    }
    case "DEMO_LOGIN": {
      const who = DEMO_USERS[a.role]
      const saved = loadPersistedUserPrefs(who.id, "demo@plughome.in", who.name)
      const resolvedPhoto =
        saved?.photoUrl ||
        getSavedAvatar() ||
        s.profile.photoUrl ||
        (typeof window !== "undefined"
          ? localStorage.getItem(FALLBACK_AVATAR_KEY) || ""
          : "")
      return {
        ...s,
        session: {
          role: a.role,
          name: saved?.name || who.name,
          phone: saved?.phone || "9876543210",
          email: saved?.email || "demo@plughome.in",
          userId: who.id,
          demo: true,
        },
        driverTab: "find",
        hostTab: "overview",
        user: {
          ...DEMO_LOC,
          areaName: DEMO_AREA,
          located: true,
          simulated: true,
          soc: 14,
        },
        hosts: demoHosts(),
        selectedHostId: null,
        route: null,
        demo: demoState(),
        profile: {
          photoUrl: resolvedPhoto,
          email: saved?.email || "demo@plughome.in",
          driverDetails: saved?.driverDetails || null,
          hostDetails: saved?.hostDetails || null,
        },
        settings: { ...DEFAULT_SETTINGS, ...(saved?.settings || {}) },
        savedRecords: saved?.savedRecords || [],
      }
    }
    case "HYDRATE_BACKEND_PROFILE": {
      const meta = a.meta || {}
      const nextName = meta.name || s.session.name
      const nextPhone = meta.phone || s.session.phone
      const nextEmail =
        a.email || meta.email || s.profile.email || s.session.email
      const saved = loadPersistedUserPrefs(
        s.session.userId,
        nextEmail,
        nextName,
      )
      const nextPhoto =
        meta.photoUrl ||
        meta.avatar_url ||
        meta.avatar ||
        s.profile.photoUrl ||
        saved?.photoUrl ||
        getSavedAvatar() ||
        (typeof window !== "undefined"
          ? localStorage.getItem(FALLBACK_AVATAR_KEY) || ""
          : "")
      const nextDriver = meta.driverDetails
        ? { ...(s.profile.driverDetails || {}), ...meta.driverDetails }
        : s.profile.driverDetails || saved?.driverDetails || null
      const nextHost = meta.hostDetails
        ? { ...(s.profile.hostDetails || {}), ...meta.hostDetails }
        : s.profile.hostDetails || saved?.hostDetails || null

      savePersistedUserPrefs(s.session.userId, {
        name: nextName,
        phone: nextPhone,
        email: nextEmail,
        photoUrl: nextPhoto,
        driverDetails: nextDriver,
        hostDetails: nextHost,
        settings: s.settings,
        savedRecords: s.savedRecords,
      })

      return {
        ...s,
        session: {
          ...s.session,
          name: nextName,
          phone: nextPhone,
          email: nextEmail,
        },
        profile: {
          ...s.profile,
          photoUrl: nextPhoto,
          email: nextEmail,
          driverDetails: nextDriver,
          hostDetails: nextHost,
        },
      }
    }
    case "LOGOUT":
      return {
        ...s,
        session: SIGNED_OUT,
        driverTab: "find",
        hostTab: "overview",
        user: { ...NO_LOC, soc: s.user.soc },
        hosts: [],
        route: null,
        selectedHostId: null,
        demo: null,
      }
    case "SET_ROLE":
      if (!s.session.demo)
        return { ...s, session: { ...s.session, role: a.role } }
      return {
        ...s,
        session: {
          ...s.session,
          role: a.role,
          name: DEMO_USERS[a.role].name,
          userId: DEMO_USERS[a.role].id,
        },
      }
    case "UPDATE_PROFILE": {
      if (a.photoUrl === "") {
        saveAvatarPersistent("")
        try {
          localStorage.removeItem(FALLBACK_AVATAR_KEY)
        } catch {}
      } else if (a.photoUrl) {
        saveAvatarPersistent(a.photoUrl)
        safeSetItem(FALLBACK_AVATAR_KEY, a.photoUrl)
      }

      const nextSession = {
        ...s.session,
        name: a.name !== undefined ? a.name : s.session.name,
        phone: a.phone !== undefined ? a.phone : s.session.phone,
        email: a.email !== undefined ? a.email : s.session.email,
      }
      const nextProfile = {
        ...s.profile,
        photoUrl:
          a.photoUrl !== undefined
            ? a.photoUrl
            : s.profile.photoUrl ||
              getSavedAvatar() ||
              (typeof window !== "undefined"
                ? localStorage.getItem(FALLBACK_AVATAR_KEY) || ""
                : ""),
        email: a.email !== undefined ? a.email : s.profile.email,
        driverDetails:
          a.driverDetails !== undefined
            ? { ...(s.profile.driverDetails || {}), ...a.driverDetails }
            : s.profile.driverDetails,
        hostDetails:
          a.hostDetails !== undefined
            ? { ...(s.profile.hostDetails || {}), ...a.hostDetails }
            : s.profile.hostDetails,
      }
      const nextUser =
        a.soc !== undefined ? { ...s.user, soc: Number(a.soc) } : s.user
      savePersistedUserPrefs(s.session.userId, {
        name: nextSession.name,
        phone: nextSession.phone,
        email: nextSession.email,
        photoUrl: nextProfile.photoUrl,
        driverDetails: nextProfile.driverDetails,
        hostDetails: nextProfile.hostDetails,
        settings: s.settings,
        savedRecords: s.savedRecords,
      })
      return {
        ...s,
        session: nextSession,
        profile: nextProfile,
        user: nextUser,
      }
    }
    case "UPDATE_SETTINGS": {
      const nextSettings = { ...s.settings, ...a.patch }
      savePersistedUserPrefs(s.session.userId, {
        name: s.session.name,
        phone: s.session.phone,
        email: s.session.email,
        photoUrl: s.profile.photoUrl,
        driverDetails: s.profile.driverDetails,
        hostDetails: s.profile.hostDetails,
        settings: nextSettings,
        savedRecords: s.savedRecords,
      })
      return { ...s, settings: nextSettings }
    }
    case "SOC":
      return { ...s, user: { ...s.user, soc: Number(a.soc) || s.user.soc } }
    case "TAB":
      return a.role === "host"
        ? { ...s, hostTab: a.tab }
        : { ...s, driverTab: a.tab }
    case "USER":
      return { ...s, user: { ...s.user, ...a.patch } }
    case "HOSTS":
      return s.session.demo ? s : { ...s, hosts: a.hosts || [] }
    case "SELECT":
      return { ...s, selectedHostId: a.id }
    case "ROUTE":
      return { ...s, route: a.route }
    case "DEMO_HOST":
      if (!s.demo) return s
      return {
        ...s,
        hosts: a.host
          ? upsert(s.hosts, a.host)
          : a.remove
            ? s.hosts.filter((h) => h.id !== a.id)
            : s.hosts.map((h) =>
                (a.id ? h.id === a.id : h.ownerId === a.ownerId)
                  ? { ...h, ...a.patch }
                  : h,
              ),
      }
    case "DEMO_BOOK":
      if (!s.demo) return s
      return {
        ...s,
        demo: { ...s.demo, bookings: upsert(s.demo.bookings, a.booking) },
      }
    case "DEMO_READING":
      if (!s.demo) return s
      return {
        ...s,
        demo: {
          ...s.demo,
          readings: {
            ...s.demo.readings,
            [a.bookingId]: {
              ...s.demo.readings[a.bookingId],
              [a.stage]: a.reading,
            },
          },
        },
      }
    case "DEMO_ACTION": {
      const b = s.demo?.bookings.find((x) => x.id === a.id)
      if (!b) return s
      const next = demoStep(b, a.action, a.value)
      if (next === b) return s
      let readings = s.demo.readings
      const stage = { confirm_start: "start", confirm_end: "end" }[a.action]
      if (stage) {
        const r = readings[b.id]?.[stage]
        readings = {
          ...readings,
          [b.id]: {
            ...readings[b.id],
            [stage]: r && {
              ...r,
              driverValue: a.value,
              hostValue: a.value,
              status: "confirmed",
            },
          },
        }
      }
      return {
        ...s,
        demo: {
          ...s.demo,
          bookings: upsert(s.demo.bookings, next),
          readings,
        },
      }
    }
    case "TOAST":
      return {
        ...s,
        toasts: [...s.toasts, { id: ++tid, tone: "ok", ...a.toast }],
      }
    case "DISMISS":
      return { ...s, toasts: s.toasts.filter((t) => t.id !== a.id) }
    default:
      return s
  }
}

const Ctx = createContext(null)
export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initial)
  return <Ctx.Provider value={{ state, dispatch }}>{children}</Ctx.Provider>
}
export const useStore = () => useContext(Ctx)
export const useToast = () => {
  const { dispatch } = useStore()
  return (title, body, extra = {}) =>
    dispatch({ type: "TOAST", toast: { title, body, ...extra } })
}
