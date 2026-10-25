import { ApiError, SUPABASE_ANON_KEY, SUPABASE_URL } from "./config"
import { completeUpload, signUpload } from "./api"

const LIMITS = { image: 10 * 1024 * 1024, video: 100 * 1024 * 1024 }

// XHR (not fetch) so the UI gets upload progress
function send(url, body, onProgress, timeout, { method = "POST", headers } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(method, url)
    Object.entries(headers || {}).forEach(([k, v]) => xhr.setRequestHeader(k, v))
    xhr.timeout = timeout
    xhr.upload.onprogress = (e) =>
      e.lengthComputable &&
      onProgress?.(Math.round(5 + (e.loaded / e.total) * 85))
    xhr.onload = () => {
      let j = null
      try {
        j = JSON.parse(xhr.responseText)
      } catch {}
      const ok = xhr.status >= 200 && xhr.status < 300
      if (ok && (method !== "POST" || j?.public_id)) resolve(j || {})
      else
        reject(
          new ApiError(
            j?.error?.message
              ? `Cloudinary: ${j.error.message}`
              : j?.message || (typeof j?.error === "string" && j.error)
                ? `Storage: ${j.message || j.error}`
                : `Upload failed (${xhr.status}).`,
            xhr.status,
          ),
        )
    }
    xhr.onerror = () =>
      reject(new ApiError("Upload failed — check your connection and retry."))
    xhr.ontimeout = () =>
      reject(new ApiError("Upload timed out after 60 s — please retry."))
    xhr.send(body)
  })
}

// Signed direct upload: the server checks ownership and signs one upload
// (fixed Cloudinary params, or a single-use Supabase Storage upload URL for an
// exact path in a private bucket), the browser streams the file straight
// there, then the server verifies the object exists and records it (meter
// reading row or host media). Realtime announces the result.
const transient = (e) =>
  !e?.status || e.status >= 500 || e.status === 408 || e.status === 429

export async function uploadToCloudinary({
  file,
  onProgress,
  purpose,
  bookingId,
  stage,
  hostId,
  resourceType,
  timeout = 60000,
  retries = 1,
}) {
  if (!file) throw new ApiError("Choose a file first.")
  const kind =
    resourceType || (file.type?.startsWith("video/") ? "video" : "image")
  if (purpose === "meter" && !file.type?.startsWith("image/"))
    throw new ApiError("Meter proof must be a photo.")
  if (!file.type?.startsWith(`${kind}/`))
    throw new ApiError(
      `Please choose ${kind === "video" ? "a video" : "an image"} file.`,
    )
  if (file.size > LIMITS[kind])
    throw new ApiError(
      `That file is too large — max ${LIMITS[kind] / 1024 / 1024} MB.`,
    )
  let asset, s
  // one automatic retry for network drops / timeouts / 5xx; each attempt gets
  // a fresh signature so the timestamp never goes stale
  for (let attempt = 0; ; attempt++) {
    try {
      onProgress?.(2)
      s = await signUpload({
        purpose,
        bookingId,
        stage,
        hostId,
        resourceType: kind,
        contentType: file.type,
        size: file.size,
      })
      if (s.provider === "supabase") {
        await send(
          `${SUPABASE_URL}/storage/v1/object/upload/sign/${s.bucket}/${s.path}?token=${encodeURIComponent(s.token)}`,
          file,
          onProgress,
          timeout,
          {
            method: "PUT",
            headers: {
              "content-type": file.type,
              "x-upsert": "false",
              apikey: SUPABASE_ANON_KEY,
              authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            },
          },
        )
        asset = {
          public_id: `sb:${s.bucket}/${s.path}`,
          bytes: file.size,
          format: s.path.split(".").pop(),
          resource_type: s.resourceType,
          secure_url: null,
        }
      } else {
        const form = new FormData()
        form.append("file", file)
        Object.entries(s.params).forEach(([k, v]) => form.append(k, String(v)))
        form.append("api_key", s.apiKey)
        form.append("signature", s.signature)
        asset = await send(
          `https://api.cloudinary.com/v1_1/${s.cloudName}/${s.resourceType}/upload`,
          form,
          onProgress,
          timeout,
        )
      }
      break
    } catch (e) {
      if (attempt >= retries || !transient(e)) throw e
      onProgress?.(0)
    }
  }
  onProgress?.(95)
  const d = asset.info?.ocr?.adv_ocr?.data?.[0]
  const ocrText =
    d?.fullTextAnnotation?.text ?? d?.textAnnotations?.[0]?.description
  const done = await completeUpload({ uploadId: s.uploadId, ocrText })
  onProgress?.(100)
  return {
    ...done,
    asset: {
      publicId: asset.public_id,
      bytes: asset.bytes,
      format: asset.format,
      resourceType: asset.resource_type,
      url: asset.secure_url,
    },
  }
}
