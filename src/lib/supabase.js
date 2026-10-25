import { createClient } from "@supabase/supabase-js"
import {
  ApiError,
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  isLive,
  request,
} from "./config"

export { isLive }

const shared = (globalThis.__plughomeSupabase ??= { client: null, user: null })

if (isLive && !shared.client) {
  // Enable detectSessionInUrl & persistSession so clicking the Supabase
  // verification email link automatically authenticates the redirected tab.
  shared.client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: "plughome-auth",
    },
  })
  shared.client.auth.onAuthStateChange((event) => {
    if (event !== "SIGNED_OUT" || !shared.user) return
    shared.user = null
    window.dispatchEvent(new CustomEvent("plughome:session-expired"))
  })
}

export const supabase = isLive ? shared.client : null
export const getLiveUser = () => shared.user

export async function getToken() {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data?.session?.access_token ?? null
}

const PENDING_KEY = "plughome:pending_email_verify"

const profileKey = (userId, role) =>
  `plughome:onboarding:${role}:${userId || "latest"}`

export function getSavedOnboarding(userId, role) {
  try {
    const specific = localStorage.getItem(profileKey(userId, role))
    if (specific) return JSON.parse(specific)
    const latest = localStorage.getItem(profileKey("latest", role))
    return latest ? JSON.parse(latest) : null
  } catch {
    return null
  }
}

export function savePendingVerification(payload) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(payload))
  } catch {}
}

export function getPendingVerification() {
  try {
    return JSON.parse(localStorage.getItem(PENDING_KEY) || "null")
  } catch {
    return null
  }
}

export function clearPendingVerification() {
  try {
    localStorage.removeItem(PENDING_KEY)
  } catch {}
}

// Syncs the authenticated Supabase user with the PLUG-HOME edge backend (/auth/profile)
async function finalizeSessionUser(session, fallback = {}) {
  const meta = session?.user?.user_metadata || {}
  const name = fallback.name || meta.full_name || "EV User"
  const role = fallback.role || meta.role || "driver"
  const phone = fallback.phone || meta.phone || ""
  const onboarding =
    fallback.onboarding ||
    meta.onboarding ||
    getSavedOnboarding(session.user.id, role) ||
    {}

  try {
    await request("/auth/profile", {
      method: "POST",
      token: session.access_token,
      body: { name, role },
    })
  } catch {
    /* non-blocking if edge profile sync is already up to date */
  }

  try {
    localStorage.setItem(
      profileKey(session.user.id, role),
      JSON.stringify(onboarding),
    )
    localStorage.setItem(
      profileKey("latest", role),
      JSON.stringify(onboarding),
    )
  } catch {}

  clearPendingVerification()

  shared.user = {
    id: session.user.id,
    name,
    role,
    phone,
    email: session.user.email,
    onboarding,
  }
  return shared.user
}

// Step 1: Triggers real Supabase Verification Email on Sign-Up
export async function startEmailSignUp({
  name,
  role,
  phone = "",
  email,
  password,
  onboarding = {},
}) {
  if (!supabase) throw new ApiError("Live mode is not configured.")
  const cleanEmail = String(email || "")
    .trim()
    .toLowerCase()
  if (!cleanEmail) throw new ApiError("Please enter your email address.")
  if (!password || password.length < 6) {
    throw new ApiError("Password must be at least 6 characters.")
  }

  const redirectUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}${window.location.pathname}`
      : undefined

  savePendingVerification({
    name,
    role,
    phone,
    email: cleanEmail,
    password,
    onboarding,
  })

  const { data, error } = await supabase.auth.signUp({
    email: cleanEmail,
    password,
    options: {
      emailRedirectTo: redirectUrl,
      data: {
        full_name: name,
        role,
        phone,
        onboarding,
      },
    },
  })

  if (error) {
    throw new ApiError(error.message || "Couldn't send verification email.")
  }

  // If Supabase returns an active session immediately (when "Confirm email" is off in dashboard)
  if (data?.session) {
    const user = await finalizeSessionUser(data.session, {
      name,
      role,
      phone,
      onboarding,
    })
    return { status: "verified", user }
  }

  // Otherwise, Supabase has sent the verification link to the user's email
  return {
    status: "awaiting_verification",
    email: cleanEmail,
  }
}

// Step 2: Checks if the user clicked the verification link in their email
export async function checkEmailVerificationStatus({
  email,
  password,
  name,
  role,
  phone,
  onboarding,
}) {
  if (!supabase) throw new ApiError("Live mode is not configured.")

  const { data, error } = await supabase.auth.signInWithPassword({
    email: String(email || "")
      .trim()
      .toLowerCase(),
    password,
  })

  if (error) {
    const msg = (error.message || "").toLowerCase()
    if (msg.includes("not confirmed") || msg.includes("verify")) {
      return { verified: false, message: "Waiting for email verification..." }
    }
    throw new ApiError(error.message)
  }

  if (data?.session) {
    const user = await finalizeSessionUser(data.session, {
      name,
      role,
      phone,
      onboarding,
    })
    return { verified: true, user }
  }

  return { verified: false }
}

// Step 3: Resend verification email
export async function resendVerificationMail(email) {
  if (!supabase) throw new ApiError("Live mode is not configured.")
  const redirectUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}${window.location.pathname}`
      : undefined

  const { error } = await supabase.auth.resend({
    type: "signup",
    email: String(email || "")
      .trim()
      .toLowerCase(),
    options: {
      emailRedirectTo: redirectUrl,
    },
  })
  if (error) throw new ApiError(error.message)
  return true
}

// Step 4: Standard Sign-In for already verified accounts
export async function signInAs({
  name,
  role,
  phone = "",
  email = "",
  password = "",
  onboarding = null,
}) {
  if (!supabase) throw new ApiError("Live mode is not configured.")
  const cleanEmail = String(email || "")
    .trim()
    .toLowerCase()
  if (!cleanEmail || !password) {
    throw new ApiError("Please enter your registered email and password.")
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: cleanEmail,
    password,
  })

  if (error) {
    const msg = (error.message || "").toLowerCase()
    if (msg.includes("not confirmed")) {
      throw new ApiError(
        "Your email is not verified yet. Please click the verification link in your inbox.",
      )
    }
    throw new ApiError(error.message || "Invalid email or password.")
  }

  return await finalizeSessionUser(data.session, {
    name: name || data.session.user.user_metadata?.full_name,
    role: role || data.session.user.user_metadata?.role,
    phone: phone || data.session.user.user_metadata?.phone,
    onboarding: onboarding || data.session.user.user_metadata?.onboarding,
  })
}

// Step 5: Detects when the user lands back on the website after clicking the email link
export async function checkEmailRedirectCallback() {
  if (!supabase || typeof window === "undefined") return null

  const hash = window.location.hash || ""
  const search = window.location.search || ""
  const isCallback =
    hash.includes("access_token=") ||
    hash.includes("type=signup") ||
    hash.includes("type=email") ||
    search.includes("code=")

  if (!isCallback) return null

  const { data } = await supabase.auth.getSession()
  if (!data?.session) return null

  const pending = getPendingVerification() || {}
  const user = await finalizeSessionUser(data.session, pending)

  // Clean URL hash/query after capturing session
  try {
    window.history.replaceState({}, document.title, window.location.pathname)
  } catch {}

  return user
}

export async function signOut() {
  shared.user = null
  if (!supabase) return
  try {
    await supabase.auth.signOut({ scope: "local" })
  } catch {}
}
