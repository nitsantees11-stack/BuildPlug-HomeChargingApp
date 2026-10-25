import { ENV_CLOUD } from "./config"

// Cloud for user uploads. The server's configured cloud wins (it signs the
// uploads), then VITE_CLOUDINARY_CLOUD_NAME. With neither, every helper
// returns null and the UI shows its "no photo" state instead of borrowing
// someone else's assets.
export let CLOUD = ENV_CLOUD || ""
export const setCloud = (name) => {
  if (name) CLOUD = name
}

const base = (type) => `https://res.cloudinary.com/${CLOUD}/${type}/upload`
const text = (t) =>
  encodeURIComponent(t).replace(/%2C/g, "%252C").replace(/%2F/g, "%252F")

// Media in the server's private Supabase Storage buckets ("sb:<bucket>/<path>")
// is served through expiring signed URLs the server attaches to each row.
// Keep the first URL per object for a few hours so a refetch doesn't swap the
// src (and reload the image) every time the server signs a fresh one. No
// Cloudinary transforms apply to these objects.
const signed = new Map()
const KEEP = 6 * 3600000
export const isStored = (id) => typeof id === "string" && id.startsWith("sb:")
export function rememberSigned(id, url) {
  if (!isStored(id) || typeof url !== "string" || !url) return
  const hit = signed.get(id)
  if (!hit || Date.now() - hit.at > KEEP) signed.set(id, { url, at: Date.now() })
}
export const clearSigned = () => signed.clear()
const stored = (id) => signed.get(id)?.url ?? null

const has = (publicId) => Boolean(publicId && CLOUD && !isStored(publicId))

export const photoUrl = (publicId, { w = 600, h = 400 } = {}) =>
  isStored(publicId)
    ? stored(publicId)
    : has(publicId)
      ? `${base("image")}/c_fill,w_${w},h_${h},g_auto/f_auto,q_auto/${publicId}`
      : null
export const meterPhotoUrl = (publicId, label) =>
  isStored(publicId)
    ? stored(publicId)
    : has(publicId)
      ? `${base("image")}/c_fill,w_600,h_400,g_auto/co_white,b_rgb:0F172A,l_text:Arial_30_bold:${text(label)},g_south_west,x_16,y_16/f_auto,q_auto/${publicId}`
      : null
export const videoUrl = (publicId) =>
  isStored(publicId)
    ? stored(publicId)
    : has(publicId)
      ? `${base("video")}/q_auto:eco,w_640/${publicId}.mp4`
      : null
export const videoPoster = (publicId) =>
  has(publicId) ? `${base("video")}/so_0,f_jpg,w_640/${publicId}.jpg` : null
export const privacyPhotoUrl = (publicId, { w = 900, h = 600 } = {}) =>
  has(publicId)
    ? `${base("image")}/e_improve:indoor/e_blur_faces:600/fl_strip_profile/c_fill,w_${w},h_${h},g_auto/f_auto,q_auto/${publicId}`
    : null

// Shareable bill: the start meter photo (left) and end meter photo (right)
// side by side, stamped with the confirmed readings. Only built once both
// readings are confirmed, so every number on it came from the server.
const layer = (publicId) => publicId.replace(/\//g, ":")
export const billUrl = (b, start, end) =>
  b?.hasBill && has(start?.publicId) && has(end?.publicId)
    ? `${base("image")}/c_fill,w_600,h_630,g_auto/c_pad,w_1200,h_630,g_west,b_rgb:0F172A/` +
      `l_${layer(end.publicId)}/c_fill,w_600,h_630,g_auto/fl_layer_apply,g_east/` +
      `co_white,b_rgb:0F172A,l_text:Arial_34_bold:${text(`START ${b.startKwh.toFixed(1)} kWh`)},g_north_west,x_24,y_24/` +
      `co_white,b_rgb:0F172A,l_text:Arial_34_bold:${text(`END ${b.endKwh.toFixed(1)} kWh`)},g_north_east,x_24,y_24/` +
      `co_rgb:0F172A,b_rgb:72D600,l_text:Arial_40_bold:${text(`NET ${b.kwhUsed.toFixed(1)} kWh | BILL Rs ${b.amount}`)},g_south,y_24/` +
      `f_auto,q_auto/${start.publicId}`
    : null
