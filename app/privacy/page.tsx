import type { Metadata } from "next"
import Link from "next/link"
import Image from "next/image"

export const metadata: Metadata = {
  title: "Privacy Policy | SUBFROST",
  description:
    "Privacy policy for the SUBFROST self-custodial Bitcoin and alkanes wallet, operated by Subzero Research Inc.",
  alternates: {
    canonical: "https://subfrost.io/privacy",
  },
  openGraph: {
    title: "Privacy Policy | SUBFROST",
    description:
      "Privacy policy for the SUBFROST self-custodial Bitcoin and alkanes wallet, operated by Subzero Research Inc.",
    type: "website",
    url: "https://subfrost.io/privacy",
    siteName: "SUBFROST",
  },
}

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen" style={{ background: "#0a0f1a", color: "#cdd9ee" }}>
      <div className="mx-auto max-w-3xl px-6 py-16 md:py-24">
        {/* Header */}
        <header className="mb-12 border-b pb-8" style={{ borderColor: "rgba(91,156,255,0.15)" }}>
          <Link href="/" className="mb-8 inline-flex items-center gap-3">
            <Image src="/Logo.png" alt="SUBFROST" width={36} height={36} priority />
            <span
              className="text-sm"
              style={{ color: "#5b9cff", letterSpacing: 6, textTransform: "uppercase" }}
            >
              SUBFROST
            </span>
          </Link>
          <h1 className="text-3xl font-bold md:text-4xl" style={{ color: "#e8f0ff" }}>
            Privacy Policy
          </h1>
          <p className="mt-3 text-sm" style={{ color: "rgba(205,217,238,0.5)" }}>
            Last updated: 2026
          </p>
        </header>

        {/* Body */}
        <article className="space-y-8 leading-relaxed">
          <p>
            SUBFROST is a self-custodial Bitcoin and alkanes wallet operated by Subzero Research Inc.
            This policy explains what data the extension handles and what leaves your device.
          </p>

          <section>
            <h2 className="mb-3 text-xl font-semibold" style={{ color: "#e8f0ff" }}>
              Keys stay on your device
            </h2>
            <p>
              Your recovery phrase, private keys, PIN, and all signing operations are generated and
              stored exclusively on your device. They are <strong>never</strong> transmitted,
              uploaded, escrowed, or shared with us or anyone else. We cannot access your funds and
              cannot recover your wallet if you lose your recovery phrase.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold" style={{ color: "#e8f0ff" }}>
              What leaves your device
            </h2>
            <p>
              To function as a Bitcoin wallet, SUBFROST connects to SUBFROST-operated infrastructure
              (e.g. <code style={{ color: "#5b9cff" }}>wss-tls.subfrost.io</code>) over an encrypted
              connection to:
            </p>
            <ul className="mt-3 list-disc space-y-1 pl-6">
              <li>
                read block heights, balances, and UTXOs for your wallet&apos;s{" "}
                <strong>public Bitcoin addresses</strong>;
              </li>
              <li>fetch AMM quotes; and</li>
              <li>broadcast transactions you have signed.</li>
            </ul>
            <p className="mt-3">
              The only wallet-specific information that leaves your device is your{" "}
              <strong>public Bitcoin addresses</strong> and{" "}
              <strong>encrypted transaction data</strong>. Public addresses are, by the nature of
              Bitcoin, already visible on the public blockchain.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold" style={{ color: "#e8f0ff" }}>
              No analytics or tracking
            </h2>
            <p>
              SUBFROST does <strong>not</strong> use analytics, crash-reporting, advertising, or
              telemetry. We do not collect personally identifiable information, browsing history, or
              activity across websites.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold" style={{ color: "#e8f0ff" }}>
              Connecting to web applications
            </h2>
            <p>
              When you connect SUBFROST to an alkanes web application, the extension stores the
              paired site&apos;s origin and a session key <strong>locally on your device only</strong>.
              The extension injects a provider into pages so sites can request your public accounts
              or ask you to sign — every signature request requires your explicit approval in the
              side panel. The extension does not read page content.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold" style={{ color: "#e8f0ff" }}>
              Local storage
            </h2>
            <p>
              Wallet keystore, address book, network selection, language, and UI preferences are
              stored locally in your browser via the extension storage API. Removing the extension
              removes this data; back up your keystore first.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold" style={{ color: "#e8f0ff" }}>
              Data sale and sharing
            </h2>
            <p>
              We do not sell or share your data with third parties. We do not use or transfer data
              for purposes unrelated to operating the wallet, and we do not use data to determine
              creditworthiness or for lending.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold" style={{ color: "#e8f0ff" }}>
              Children
            </h2>
            <p>SUBFROST is not directed to children under 13.</p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold" style={{ color: "#e8f0ff" }}>
              Changes
            </h2>
            <p>We may update this policy; material changes will be posted at this URL.</p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold" style={{ color: "#e8f0ff" }}>
              Contact
            </h2>
            <p>
              Subzero Research Inc. —{" "}
              <a
                href="https://subfrost.io"
                className="underline"
                style={{ color: "#5b9cff" }}
              >
                https://subfrost.io
              </a>
            </p>
          </section>
        </article>

        {/* Footer */}
        <footer className="mt-16 border-t pt-8" style={{ borderColor: "rgba(91,156,255,0.15)" }}>
          <Link href="/" className="text-sm underline" style={{ color: "#5b9cff" }}>
            ← Back to subfrost.io
          </Link>
        </footer>
      </div>
    </main>
  )
}
