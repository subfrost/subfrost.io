import Link from "next/link"

export function SiteFooter() {
  return (
    <footer className="mt-24" style={{ borderTop: "1px solid rgba(91,156,255,.22)", background: "var(--ed-nav)" }}>
      <div className="mx-auto flex max-w-[1120px] flex-col gap-4 px-6 py-12 sm:flex-row sm:items-center sm:justify-between sm:px-10">
        <div className="font-reading text-[18px] font-medium tracking-[4px] text-white">SUBFROST</div>
        <p className="font-reading text-[14px] text-[#8aa0c0]">
          Research, releases, and field notes on Bitcoin-native settlement.
        </p>
        <div className="flex gap-6 text-[14px] text-[#c2cee2]">
          <Link href="/articles" className="transition-colors hover:text-white">
            Articles
          </Link>
          <Link href="/" className="transition-colors hover:text-white">
            Home
          </Link>
        </div>
      </div>
    </footer>
  )
}
