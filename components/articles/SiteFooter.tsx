import Link from "next/link"
import { SnowflakeMark } from "./SnowflakeMark"

export function SiteFooter() {
  return (
    <footer className="mt-24" style={{ borderTop: "1px solid var(--ed-hair)", background: "var(--ed-nav)" }}>
      <div className="mx-auto flex max-w-[1120px] flex-col gap-4 px-6 py-12 sm:flex-row sm:items-center sm:justify-between sm:px-10">
        <div className="flex items-center gap-2.5" style={{ color: "var(--ed-ink)" }}>
          <SnowflakeMark size={22} className="text-[color:var(--ed-accent)]" />
          <span className="font-display text-[17px] font-semibold tracking-[3px]">SUBFROST</span>
        </div>
        <p className="font-reading text-[14px]" style={{ color: "var(--ed-muted)" }}>
          Research, releases, and field notes on Bitcoin-native settlement.
        </p>
        <div className="flex gap-6 text-[14px]">
          <Link href="/articles" className="font-display transition-colors" style={{ color: "var(--ed-body)" }}>
            Articles
          </Link>
          <Link href="/" className="font-display transition-colors" style={{ color: "var(--ed-body)" }}>
            Home
          </Link>
        </div>
      </div>
    </footer>
  )
}
