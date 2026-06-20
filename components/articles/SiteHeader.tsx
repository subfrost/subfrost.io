import Link from "next/link"
import { ReaderThemeToggle } from "./ReaderThemeToggle"
import { LocaleToggle } from "./LocaleToggle"
import { SnowflakeMark } from "./SnowflakeMark"

// Brand chrome shared across the editorial surfaces. Theme-aware (Frost/white in
// light, Carbon in dark) via the --ed-* tokens. Fixed 60px height so the
// reading-progress bar can pin directly beneath it. Carries the snowflake
// logomark + the app's 文 / Sun toggles, grouped at the right.
export function SiteHeader({ theme }: { theme: "light" | "dark" }) {
  return (
    <header
      data-ed-theme="dark"
      className="sticky top-0 z-50"
      style={{ background: "var(--ed-nav)", borderBottom: "1px solid var(--ed-hair)" }}
    >
      <div className="mx-auto flex h-[60px] max-w-[1120px] items-center justify-between px-6 sm:px-10">
        <Link href="/" className="flex items-center gap-2.5" style={{ color: "var(--ed-ink)" }}>
          <SnowflakeMark size={24} className="text-[color:var(--ed-accent)]" />
          <span className="font-display text-[19px] font-semibold tracking-[4px]">SUBFROST</span>
        </Link>
        <nav className="flex items-center gap-5 text-[15px]">
          <Link href="/articles" className="font-display hidden sm:inline" style={{ color: "var(--ed-ink)" }}>
            Articles
          </Link>
          <Link
            href="/"
            className="font-display hidden transition-colors sm:inline"
            style={{ color: "var(--ed-muted)" }}
          >
            Home
          </Link>
          <span
            className="flex items-center gap-3.5 pl-4"
            style={{ borderLeft: "1px solid var(--ed-hair)" }}
          >
            <LocaleToggle />
            <ReaderThemeToggle initial={theme} />
          </span>
        </nav>
      </div>
    </header>
  )
}
