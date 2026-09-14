import type { Metadata } from "next"
export const metadata: Metadata = { title: "Aprimo Report Labs" }
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
