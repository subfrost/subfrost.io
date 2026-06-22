"use client"

import { useEffect } from "react"

export function SystemThemeSync() {
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)")
    const apply = () => {
      const root = document.getElementById("ed-root")
      if (root) root.dataset.edTheme = query.matches ? "dark" : "light"
    }

    apply()
    query.addEventListener("change", apply)
    return () => query.removeEventListener("change", apply)
  }, [])

  return null
}
