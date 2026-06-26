"use client"

import { useEffect } from "react"

const STORAGE_KEY = "subfrost:editorial-theme"

type EditorialTheme = "light" | "dark"

function getStoredTheme(): EditorialTheme | null {
  const value = window.localStorage.getItem(STORAGE_KEY)
  return value === "dark" || value === "light" ? value : null
}

export function SystemThemeSync() {
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)")
    const apply = () => {
      const storedTheme = getStoredTheme()
      const theme = storedTheme ?? (query.matches ? "dark" : "light")
      const root = document.getElementById("ed-root")
      document.documentElement.dataset.edPageTheme = theme
      document.documentElement.style.colorScheme = theme
      document.body.dataset.edPageTheme = theme
      if (root) root.dataset.edTheme = theme
    }

    apply()
    query.addEventListener("change", apply)
    window.addEventListener("ed-theme-change", apply)
    return () => {
      query.removeEventListener("change", apply)
      window.removeEventListener("ed-theme-change", apply)
      delete document.documentElement.dataset.edPageTheme
      document.documentElement.style.colorScheme = ""
      delete document.body.dataset.edPageTheme
    }
  }, [])

  return null
}
