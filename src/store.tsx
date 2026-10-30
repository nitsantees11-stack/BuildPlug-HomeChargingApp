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

export function loadPersistedUserPrefs(userId, email) {
  if (typeof window === "undefined") return null
  try {
    if (userId) {
      const raw = localStorage.getItem(`${STORAGE_PREFIX}${userId}`)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === "object") return parsed
      }
    }
    if (email) {
      const cleanEm = String(email).trim().toLowerCase()
      const rawEm = localStorage.getItem(`${STORAGE_PREFIX}email:${cleanEm}`)
      if (rawEm) {
        const parsedEm = JSON.parse(rawEm)
        // never hand one account's saved details/photo to a different account
        const sameUser = !userId || !parsedEm?.userId || parsedEm.userId === userId
        if (parsedEm && typeof parsedEm === "object" && sameUser) return parsedEm
      }
    }
    return null
  } catch {
    return null
  }
}

export function savePersistedUserPrefs(userId, data) {
  if (typeof window === "undefined" || !data) return
  try {
    if (data.photoUrl !== undefined) {
      saveAvatarPersistent(data.photoUrl || "", userId, data.email)
    }
    const payload = JSON.stringify({ ...data, userId })
    if (userId) {
      localStorage.setItem(`${STORAGE_PREFIX}${userId}`, payload)
    }
    if (data.email) {
      localStorage.setItem(
        `${STORAGE_PREFIX}email:${String(data.email).trim().toLowerCase()}`,
        payload,
      )
    }
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

const EMPTY_PROFILE = {
  photoUrl: "",
  email: "",
  driverDetails: null,
  hostDetails: null,
}

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
  profile: EMPTY_PROFILE,
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
      const uid = a.userId
      const saved = loadPersistedUserPrefs(uid, a.email)
      const resolvedName = a.name || saved?.name || "EV User"
      const resolvedPhone = a.phone || saved?.phone || ""
      const resolvedEmail = a.email || saved?.email || ""
      const resolvedPhoto =
        a.photoUrl ||
        saved?.photoUrl ||
        getSavedAvatar(uid, resolvedEmail) ||
        ""
      const resolvedDriver =
        a.driverDetails ||
        saved?.driverDetails ||
        (a.role === "driver" ? a.onboarding : null) ||
        null
      const resolvedHost =
        a.hostDetails ||
        saved?.hostDetails ||
        (a.role === "host" ? a.onboarding : null) ||
        null

      savePersistedUserPrefs(uid, {
        name: resolvedName,
        phone: resolvedPhone,
        email: resolvedEmail,
        photoUrl: resolvedPhoto,
        driverDetails: resolvedDriver,
        hostDetails: resolvedHost,
        settings: saved?.settings || DEFAULT_SETTINGS,
        savedRecords: saved?.savedRecords || [],
      })

      return {
        ...s,
        session: {
          role: a.role,
          name: resolvedName,
          phone: resolvedPhone,
          email: resolvedEmail,
          userId: uid,
          demo: false,
        },
        driverTab: a.tab || "find",
        hostTab: "overview",
        user: {
          ...NO_LOC,
          soc: resolvedDriver?.currentSoc || a.onboarding?.currentSoc || 26,
        },
        selectedHostId: null,
        route: null,
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
      const saved = loadPersistedUserPrefs(who.id, "demo@plughome.in")
      const resolvedPhoto =
        saved?.photoUrl || getSavedAvatar(who.id, "demo@plughome.in") || ""
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
      const uid = s.session.userId
      if (!uid) return s
      const meta = a.meta || {}
      if (meta.id && meta.id !== uid) return s

      const nextName = meta.name || meta.full_name || s.session.name
      const nextPhone = meta.phone || s.session.phone
      const nextEmail =
        a.email || meta.email || s.profile.email || s.session.email
      const nextPhoto =
        meta.photoUrl ||
        meta.avatarThumb ||
        s.profile.photoUrl ||
        getSavedAvatar(uid, nextEmail) ||
        ""
      const nextDriver = meta.driverDetails
        ? { ...(s.profile.driverDetails || {}), ...meta.driverDetails }
        : s.profile.driverDetails
      const nextHost = meta.hostDetails
        ? { ...(s.profile.hostDetails || {}), ...meta.hostDetails }
        : s.profile.hostDetails

      savePersistedUserPrefs(uid, {
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
        user: { ...NO_LOC, soc: 14 },
        hosts: [],
        route: null,
        selectedHostId: null,
        demo: null,
        profile: EMPTY_PROFILE,
        settings: DEFAULT_SETTINGS,
        savedRecords: [],
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
      const uid = s.session.userId
      const em = a.email !== undefined ? a.email : s.session.email
      if (a.photoUrl === "") saveAvatarPersistent("", uid, em)
      else if (a.photoUrl) saveAvatarPersistent(a.photoUrl, uid, em)

      const nextSession = {
        ...s.session,
        name: a.name !== undefined ? a.name : s.session.name,
        phone: a.phone !== undefined ? a.phone : s.session.phone,
        email: em,
      }
      const nextProfile = {
        ...s.profile,
        photoUrl:
          a.photoUrl !== undefined
            ? a.photoUrl
            : s.profile.photoUrl || getSavedAvatar(uid, em),
        email: em,
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
      savePersistedUserPrefs(uid, {
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
      const uid = s.session.userId
      const nextSettings = { ...s.settings, ...a.patch }
      savePersistedUserPrefs(uid, {
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
