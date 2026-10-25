import { useToast } from "../store"

// shows the server's exact message (409s included) with an optional retry
export function useErrorToast() {
  const toast = useToast()
  return (title, e, retry) =>
    toast(title, e?.message || "Something went wrong — please try again.", {
      tone: "error",
      ...(retry ? { action: { label: "Retry", onClick: retry } } : {}),
    })
}
