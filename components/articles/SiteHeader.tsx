import Link from "next/link"
import { ReaderThemeToggle } from "./ReaderThemeToggle"

// Dark frosted chrome shared across the editorial surfaces. Fixed 60px height so
// the reading-progress bar can pin directly beneath it.
export function SiteHeader({ theme }: { theme: "light" | "dark" }) {
  return (
    <header
      className="sticky top-0 z-50"
      style={{ background: "var(--ed-nav)", borderBottom: "1px solid rgba(91,156,255,.22)" }}
    >
      <div className="mx-auto flex h-[60px] max-w-[1120px] items-center justify-between px-6 sm:px-10">
        <Link
          href="/"
          className="font-reading text-[20px] font-medium tracking-[5px] text-white"
        >
          SUBFROST
        </Link>
        <nav className="flex items-center gap-6 text-[15px]">
          <Link href="/articles" className="hidden text-white sm:inline">
            Articles
          </Link>
          <Link href="/" className="hidden text-[#c2cee2] transition-colors hover:text-white sm:inline">
            Home
          </Link>
          <ReaderThemeToggle initial={theme} />
        </nav>
      </div>
    </header>
  )
}
