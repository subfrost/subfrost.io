import Link from "next/link"

const MAIN_SITE = "https://subfrost.io"

export function Nav() {
  return (
    <header className="sticky top-0 z-30 border-b border-zinc-800/80 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-lg font-bold tracking-tight responsive-shadow">SUBFROST</span>
          <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-2xs uppercase tracking-widest text-zinc-400">
            News
          </span>
        </Link>
        <nav className="flex items-center gap-5 text-sm text-zinc-400">
          <Link href="/" className="hover:text-white">
            Latest
          </Link>
          <a href={MAIN_SITE} className="hover:text-white">
            subfrost.io
          </a>
        </nav>
      </div>
    </header>
  )
}
