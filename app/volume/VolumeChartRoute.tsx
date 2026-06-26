"use client"

import { useRouter } from "next/navigation"
import VolumeModal from "@/components/VolumeModal"

export function VolumeChartRoute({ closeHref }: { closeHref: string }) {
  const router = useRouter()

  return <VolumeModal isOpen onClose={() => router.push(closeHref)} />
}
