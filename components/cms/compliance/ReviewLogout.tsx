"use client"

import { useTransition } from "react"
import { Button } from "@/components/ui/button"
import { reviewLogoutAction } from "@/actions/cms/reviews"

export function ReviewLogout() {
  const [pending, startTransition] = useTransition()
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await reviewLogoutAction()
          window.location.reload()
        })
      }
    >
      Sign out
    </Button>
  )
}
