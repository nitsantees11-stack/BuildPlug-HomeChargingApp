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
import { getHostPhotoCache } from "./lib/api"

// Helper to load/save persistent user profile, photo, and app settings
const STORAGE_PREFIX = "plughome:user_prefs:"

export function loadPersistedUserPrefs(userId) {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${userId || "guest"}`)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function savePersistedUserPrefs(userId, data) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(
      `${STORAGE_PREFIX}${userId || "guest"}`,
      JSON.stringify(data),
    )
  } catch {}
}

// Merge cached host photos back into server host list so photos never disappear
function attachHostPhotos(hosts = [], existingHosts = []) {
  const cache = getHostPhotoCache()
  return hosts.map((h) => {
    const prev = existingHosts.find((x) => x.id === h.id)
    const keyFull = `${(h.name || "").trim().toLowerCase()}|${(h.locality || "").trim().toLowerCase()}`
    const keyName = (h.name || "").trim().toLowerCase()
    const savedPhoto =
      h.photo ||
      h.photoUrl ||
      h.img ||
      h.image ||
      prev?.photo ||
      prev?.photoUrl ||
      prev?.img ||
      prev?.image ||
      cache[h.id] ||
      cache[keyFull] ||
      cache[keyName]

    if (!savedPhoto) return h
    return {
      ...h,
      photo: h.photo || savedPhoto,
      photoUrl: h.photoUrl || savedPhoto,
      img: h.img || savedPhoto,
      image: h.image || savedPhoto,
      photos: h.photos?.length ? h.photos : [savedPhoto],
    }
  })
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
// no position until the driver shares GPS — never a stand-in location
const NO_LOC = { lat: null, lng: null, areaName: "", located: false }

const DEFAULT_SETTINGS = {
  notifications: true,
  soundEffects: true,
  autoGps: true,
  lowSocAlert: 20,
  preferredRadiusKm: 5,
  autoSaveReceipts: true,
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
  profile: {
    photoUrl: "",
    email: "",
    driverDetails: null,
    hostDetails: null,
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
      const saved = loadPersistedUserPrefs(a.userId)
      return {
        ...s,
        session: {
          role: a.role,
          name: saved?.name || a.name,
          phone: saved?.phone || a.phone,
          email: saved?.email || a.email || "",
          userId: a.userId,
          demo: false,
        },
        driverTab: a.tab || "find",
        hostTab: "overview",
        demo: null,
        profile: {
          photoUrl: saved?.photoUrl || "",
          email: saved?.email || a.email || "",
          driverDetails: saved?.driverDetails || null,
          hostDetails: saved?.hostDetails || null,
        },
        settings: { ...DEFAULT_SETTINGS, ...(saved?.settings || {}) },
        savedRecords: saved?.savedRecords || [],
      }
    }
    case "DEMO_LOGIN": {
      const who = DEMO_USERS[a.role]
      const saved = loadPersistedUserPrefs(who.id)
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
        // fixed, labelled simulated location — browser GPS isn't used
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
          photoUrl: saved?.photoUrl || "",
          email: saved?.email || "demo@plughome.in",
          driverDetails: saved?.driverDetails || null,
          hostDetails: saved?.hostDetails || null,
        },
        settings: { ...DEFAULT_SETTINGS, ...(saved?.settings || {}) },
        savedRecords: saved?.savedRecords || [],
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
      // Judge Mode has one persona per side
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
      const nextSession = {
        ...s.session,
        name: a.name !== undefined ? a.name : s.session.name,
        phone: a.phone !== undefined ? a.phone : s.session.phone,
        email: a.email !== undefined ? a.email : s.session.email,
      }
      const nextProfile = {
        ...s.profile,
        photoUrl: a.photoUrl !== undefined ? a.photoUrl : s.profile.photoUrl,
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
      // the server list never replaces Judge Mode's local chargers
      return s.session.demo
        ? s
        : { ...s, hosts: attachHostPhotos(a.hosts, s.hosts) }
    case "SELECT":
      return { ...s, selectedHostId: a.id }
    case "ROUTE":
      return { ...s, route: a.route }
    // ---- Judge Mode only (ignored outside a demo session) ----
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
        // the simulated other party confirms the same number
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
