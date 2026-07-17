"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect } from "react"

const EXIT_MS = 160
const ENTER_MS = 360

function shouldIgnoreClick(event: MouseEvent, anchor: HTMLAnchorElement) {
  const href = anchor.getAttribute("href")
  return (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.altKey ||
    event.ctrlKey ||
    event.shiftKey ||
    anchor.target === "_blank" ||
    anchor.hasAttribute("download") ||
    anchor.dataset.transition === "off" ||
    !href ||
    href.startsWith("#") ||
    href.startsWith("mailto:") ||
    href.startsWith("tel:")
  )
}

export function SmoothPageTransitions() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const root = document.getElementById("ed-root")
    if (!root) return

    root.classList.remove("ed-page-exiting")
    root.classList.add("ed-page-entering")

    const timer = window.setTimeout(() => {
      root.classList.remove("ed-page-entering")
    }, ENTER_MS)

    return () => window.clearTimeout(timer)
  }, [pathname, searchParams])

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null
      const anchor = target?.closest<HTMLAnchorElement>("a[href]")
      if (!anchor || shouldIgnoreClick(event, anchor)) return

      const root = document.getElementById("ed-root")
      const nextUrl = new URL(anchor.href, window.location.href)
      if (nextUrl.href === window.location.href) return

      event.preventDefault()
      root?.classList.add("ed-page-exiting")

      window.setTimeout(() => {
        if (nextUrl.origin === window.location.origin) {
          router.push(`${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`)
          return
        }

        window.location.assign(nextUrl.href)
      }, EXIT_MS)
    }

    document.addEventListener("click", onClick, { capture: true })
    return () => document.removeEventListener("click", onClick, { capture: true })
  }, [router])

  return null
}
