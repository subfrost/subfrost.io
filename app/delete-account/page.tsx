import type { Metadata } from "next"
import Link from "next/link"
import Image from "next/image"
import GlobalStyles from "@/components/GlobalStyles"
import InfoSection from "@/components/InfoSection"

export const metadata: Metadata = {
  title: "Delete Your Account | SUBFROST",
  description:
    "How to delete your SUBFROST wallet and your SUBFROST Pay account and associated data, operated by Subzero Research Inc.",
  alternates: {
    canonical: "https://subfrost.io/delete-account",
  },
  openGraph: {
    title: "Delete Your Account | SUBFROST",
    description:
      "How to delete your SUBFROST wallet and your SUBFROST Pay account and associated data, operated by Subzero Research Inc.",
    type: "website",
    url: "https://subfrost.io/delete-account",
    siteName: "SUBFROST",
  },
}

export default function DeleteAccountPage() {
  return (
    <main className="relative">
      <GlobalStyles />
      <InfoSection>
        <div className="mx-auto max-w-3xl">
          {/* Header */}
          <header className="mb-12 border-b border-slate-300/20 pb-8">
            <Link href="/" className="mb-8 inline-flex items-center">
              <Image
                src="/brand/subfrost-wordmark.svg"
                alt="SUBFROST"
                width={180}
                height={24}
                priority
                className="h-8 w-auto hover:opacity-80 sf-wordmark"
              />
            </Link>
            <h1 className="text-3xl font-bold uppercase tracking-wider text-white snow-title-no-filter md:text-4xl">
              Delete Your Account
            </h1>
            <p className="mt-3 text-sm text-gray-400">Last updated: June 19, 2026</p>
          </header>

          {/* Body */}
          <article className="space-y-8 leading-relaxed text-gray-300">
            <p>
              SUBFROST is a self-custodial wallet from Subzero Research Inc. This page explains how to
              delete your wallet and, if you use SUBFROST Pay, how to delete your SUBFROST Pay account
              and associated data.
            </p>

            <section>
              <h2 className="mb-3 text-xl font-bold text-white">Your wallet (no account required)</h2>
              <p>
                The core SUBFROST wallet does not create an account with us. Your keys and wallet data
                live only on your device. To delete this data, simply uninstall the SUBFROST app or
                remove the browser extension — this erases your keystore and local data from that
                device.{" "}
                <strong>Back up your recovery phrase first</strong>, because deletion is permanent and
                we cannot recover your wallet for you. If you also enabled an optional backup (iCloud
                Keychain on iOS, or Google Drive on Android), remove that backup through Apple&apos;s or
                Google&apos;s settings as well.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-bold text-white">SUBFROST Pay account</h2>
              <p>
                If you used SUBFROST Pay, you created a Pay account that holds identity and payment
                information. To request deletion of your SUBFROST Pay account and associated data:
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>
                  In the app, open <strong>Settings → SUBFROST Pay → Delete account</strong>, or
                </li>
                <li>
                  Email{" "}
                  <a
                    href="mailto:support@subfrost.io?subject=Delete%20my%20SUBFROST%20Pay%20account"
                    className="text-blue-300 underline hover:opacity-80"
                  >
                    support@subfrost.io
                  </a>{" "}
                  from the address associated with your account, with the subject &ldquo;Delete my
                  SUBFROST Pay account.&rdquo;
                </li>
              </ul>
              <p className="mt-3">
                We will verify your request and delete your Pay account and associated data, except for
                records we are required by law to keep. Identity-verification (KYC/AML) records are
                retained for <strong>seven (7) years after account closure</strong> where applicable
                law requires; after that period they are deleted. We process verified deletion requests
                within 30 days.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-bold text-white">Questions</h2>
              <p>
                For help with deletion or any privacy question, contact{" "}
                <a
                  href="mailto:support@subfrost.io"
                  className="text-blue-300 underline hover:opacity-80"
                >
                  support@subfrost.io
                </a>
                . See our{" "}
                <Link href="/privacy" className="text-blue-300 underline hover:opacity-80">
                  Privacy Policy
                </Link>{" "}
                for full details on what we collect and how long we keep it.
              </p>
            </section>
          </article>

          {/* Footer */}
          <footer className="mt-16 border-t border-slate-300/20 pt-8">
            <Link href="/" className="text-sm text-blue-300 underline hover:opacity-80">
              ← Back to subfrost.io
            </Link>
          </footer>
        </div>
      </InfoSection>
    </main>
  )
}
