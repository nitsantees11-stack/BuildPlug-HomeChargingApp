// Screen-facing data layer: one hook per resource that reads Judge Mode's
// local simulation (`state.demo`, `state.hosts`) during a demo session and the
// live server hooks otherwise. Live hooks are always called (rules of hooks)
// but disabled in a demo session, so they never fetch or subscribe.
import { useStore } from "../store"
import { DEMO_STATS, demoBillUrl } from "../demo"
import { bookingAction } from "./api"
import { billUrl, meterPhotoUrl, photoUrl } from "./cloudinary"
import {
  applyBookingRow,
  useBookingEvents,
  useBookings,
  useHostStats,
  useHosts,
  useMeterReadings,
  usePendingAction,
} from "./live"

const NONE = []
const noop = () => Promise.resolve()

export function useIsDemo() {
  return Boolean(useStore().state.session.demo)
}

// chargers: the server list in live mode, the simulated chargers kept in the
// store in Judge Mode
export function useHostList() {
  const { state } = useStore()
  const demo = Boolean(state.session.demo)
  const live = useHosts(!demo)
  if (demo)
    return { hosts: state.hosts, loading: false, error: null, refresh: noop }
  return live
}

export function useBookingList() {
  const { state } = useStore()
  const demo = Boolean(state.session.demo)
  const live = useBookings(!demo)
  if (demo)
    return {
      bookings: state.demo?.bookings || NONE,
      loading: false,
      error: null,
      refresh: noop,
    }
  return live
}

export function useReadings(bookingId) {
  const { state } = useStore()
  const demo = Boolean(state.session.demo)
  const live = useMeterReadings(bookingId, !demo)
  if (demo) {
    const r = (bookingId && state.demo?.readings?.[bookingId]) || {}
    return {
      start: r.start ?? null,
      end: r.end ?? null,
      loading: false,
      refresh: noop,
    }
  }
  return live
}

export function useStats() {
  const { state } = useStore()
  const demo = Boolean(state.session.demo)
  const live = useHostStats(state.session.userId, !demo)
  if (demo) return { stats: DEMO_STATS, loading: false, error: null }
  return live
}

// booking timeline rows from the database (live only); Judge Mode and older
// databases return [] and the screens derive the timeline from the booking.
export function useTimeline(bookingId) {
  const demo = useIsDemo()
  const live = useBookingEvents(bookingId, !demo)
  return demo ? NONE : live
}

// Booking transitions. Live: server action + pending label until the status
// changes. Judge Mode: the local state machine, applied instantly.
export function useBookingAction(b, onError) {
  const { state, dispatch } = useStore()
  const demo = Boolean(state.session.demo)
  const [pending, run] = usePendingAction(
    b ? `${b.id}|${b.rawStatus}` : "",
    onError,
  )
  const act = (label, action, done) => {
    if (!b) return Promise.resolve(false)
    if (demo) {
      dispatch({ type: "DEMO_ACTION", id: b.id, action })
      done?.()
      return Promise.resolve(true)
    }
    return run(label, async () => {
      const res = await bookingAction(b.id, action)
      applyBookingRow(res?.booking)
    }).then((ok) => {
      if (ok) done?.()
      return ok
    })
  }
  return [demo ? null : pending, act]
}

// composite bill image: Cloudinary in live mode, inline SVG in Judge Mode
export const billFor = (demo, b, start, end) =>
  !b ? null : demo ? demoBillUrl(b) : billUrl(b, start, end)

// image sources for a meter reading, best first; never contains null
export const meterSrcs = (reading, label) =>
  [
    reading?.localUrl,
    reading?.publicId && meterPhotoUrl(reading.publicId, label),
    reading?.publicId && photoUrl(reading.publicId),
    reading?.photoUrl,
  ].filter(Boolean)
