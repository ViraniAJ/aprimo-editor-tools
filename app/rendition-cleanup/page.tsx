import { redirect } from "next/navigation"

// The tool was renamed; keep old links working.
export default function RenditionCleanupRedirect() {
  redirect("/additional-file-cleanup")
}
