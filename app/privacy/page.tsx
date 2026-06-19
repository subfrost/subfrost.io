import type { Metadata } from "next"
import Link from "next/link"
import Image from "next/image"
import GlobalStyles from "@/components/GlobalStyles"
import InfoSection from "@/components/InfoSection"

export const metadata: Metadata = {
  title: "Privacy Policy | SUBFROST",
  description:
    "Privacy policy for the SUBFROST self-custodial Bitcoin and alkanes wallet — browser extension and iOS and Android apps — operated by Subzero Research Inc.",
  alternates: {
    canonical: "https://subfrost.io/privacy",
  },
  openGraph: {
    title: "Privacy Policy | SUBFROST",
    description:
      "Privacy policy for the SUBFROST self-custodial Bitcoin and alkanes wallet — browser extension and iOS and Android apps — operated by Subzero Research Inc.",
    type: "website",
    url: "https://subfrost.io/privacy",
    siteName: "SUBFROST",
  },
}

export default function PrivacyPolicyPage() {
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
              Privacy Policy
            </h1>
            <p className="mt-3 text-sm text-gray-400">Last updated: June 19, 2026</p>
          </header>

          {/* Body */}
          <article className="space-y-8 leading-relaxed text-gray-300">
            <p>
              SUBFROST is a self-custodial Bitcoin and alkanes wallet from Subzero Research Inc.,
              available as a browser extension and as mobile apps for iOS and Android. This policy
              covers all three. Where a practice applies only to one product, or only to an optional
              feature you choose to turn on, we say so.
            </p>

            <section>
              <h2 className="mb-3 text-xl font-bold text-white">Keys stay on your device</h2>
              <p>
                Your recovery phrase, private keys, and PIN are generated and stored only on your
                device, and all signing happens on your device. They are <strong>never</strong>{" "}
                transmitted, uploaded, escrowed, or shared with us or anyone else. We cannot access
                your funds and cannot recover your wallet if you lose your recovery phrase.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-bold text-white">What leaves your device (core wallet)</h2>
              <p>
                To work as a Bitcoin wallet, SUBFROST connects to SUBFROST-operated infrastructure
                over an encrypted, certificate-pinned connection to: read block heights, balances, and
                UTXOs for your wallet&apos;s public Bitcoin addresses; fetch swap/AMM quotes; and
                broadcast transactions you have signed. The only wallet-specific information that
                leaves your device is your <strong>public Bitcoin addresses</strong> and{" "}
                <strong>signed, encrypted transaction data</strong>. Public addresses are, by the
                nature of Bitcoin, already visible on the public blockchain. The browser extension
                also reads recommended Bitcoin fee rates from a public endpoint (mempool.space); no
                address or account information is sent in that request.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-bold text-white">Backups of your wallet</h2>
              <ul className="mt-1 list-disc space-y-2 pl-6">
                <li>
                  <em>Browser extension:</em> your encrypted keystore is stored only in your
                  browser&apos;s local extension storage. We never receive it. Removing the extension
                  deletes it — back up your recovery phrase first.
                </li>
                <li>
                  <em>iOS:</em> if you enable iCloud Keychain, your encrypted keystore entry syncs to
                  your other Apple devices through Apple&apos;s end-to-end-encrypted iCloud Keychain.
                  The entry is encrypted; Apple cannot read it, and neither can we. You can turn off
                  iCloud Keychain in iOS Settings.
                </li>
                <li>
                  <em>Android:</em> you can optionally back up your encrypted keystore to your own
                  Google Drive. This is off by default and requires your Google sign-in plus a
                  biometric check. The keystore is encrypted with your password before it is uploaded;
                  we never receive it.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-bold text-white">Notifications</h2>
              <ul className="mt-1 list-disc space-y-2 pl-6">
                <li>
                  <em>Browser extension:</em> optional local notifications (e.g., &ldquo;transaction
                  sent&rdquo;) shown by your browser. Off by default; nothing is sent to us or any
                  third party to produce them.
                </li>
                <li>
                  <em>iOS:</em> if you enable notifications, the app registers with Apple Push
                  Notification service (APNs) and sends the resulting device token to SUBFROST
                  infrastructure so we can alert you to events such as wrap/unwrap progress and
                  incoming WalletConnect requests. The token is opaque to Apple and contains no wallet
                  data.
                </li>
                <li>
                  <em>Android:</em> on devices with Google services, notifications use Firebase Cloud
                  Messaging (FCM); the FCM device token is shared with Google as the delivery transport
                  and registered with SUBFROST infrastructure. On devices without Google services, a
                  local background service is used instead and no token is sent to Google.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-bold text-white">Device integrity</h2>
              <p>
                To protect you against tampered or repackaged builds, the apps verify their own
                integrity. On Android this is a local measurement of the app&apos;s own code; nothing
                is sent off the device. On iOS the app uses Apple&apos;s App Attest to attest the
                device to SUBFROST infrastructure when you first sign in; App Attest does not create a
                tracking identifier and its key never leaves your device.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-bold text-white">Connecting to web applications</h2>
              <p>
                SUBFROST lets you connect to alkanes web applications. In the browser extension, a
                provider is injected into pages so sites can request your public accounts or ask you
                to sign; the extension stores the connected site&apos;s origin locally and does not
                read page content. On mobile, you can pair with sites via WalletConnect; the paired
                site&apos;s origin, a session key, and the relay address are stored locally on your
                device, and encrypted session frames are routed through SUBFROST&apos;s relay
                (wc.subfrost.io), which never sees plaintext or your keys.{" "}
                <strong>Every connection and every signature request requires your explicit approval.</strong>
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-bold text-white">Cross-chain swaps (optional)</h2>
              <p>
                If you use the optional cross-chain swap feature, SUBFROST routes your request through
                a third-party exchange provider (SimpleSwap) via our infrastructure. To create a swap,
                your destination and refund wallet addresses, the assets and amount, and (once
                settled) the on-chain transaction hashes are shared with the provider to execute the
                exchange. No email, identity, or KYC information is shared for cross-chain swaps. This
                feature is off by default.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-bold text-white">SUBFROST Pay (optional; where available)</h2>
              <p>
                SUBFROST Pay lets you convert frBTC to fiat on a virtual card. It is an optional
                feature that you activate separately and that is available only in supported regions
                and on supported platforms (currently Android; it is not yet enabled on iOS or in the
                browser extension). If you choose to use SUBFROST Pay, we and our payment and
                identity-verification partner (Stripe) collect the information needed to provide a
                regulated financial service and to meet identity-verification (KYC/AML) obligations.
                This may include your email address, legal name, date of birth, postal address,
                government-issued ID document images, a selfie/liveness check, and a portion of your
                taxpayer identification number (for example, the last digits of an SSN where
                required), and, for cash-out, your bank account details. Identity documents and card
                details are captured by Stripe; card numbers are tokenized by Stripe and never reach
                SUBFROST. This information is used only to operate SUBFROST Pay and to comply with
                applicable law; see Stripe&apos;s privacy policy for how it handles the data it
                collects. If you do not use SUBFROST Pay, none of this is collected. On iOS, where Pay
                is not yet enabled, the only related data we collect is an email address you may submit
                to be notified when the feature launches.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-bold text-white">Camera</h2>
              <p>
                SUBFROST uses your device camera to scan QR codes (payment addresses and WalletConnect
                pairing). On platforms where SUBFROST Pay is available, the camera is also used to
                capture identity-verification documents and a selfie if you choose to complete Pay
                verification. Camera images are not used for any other purpose.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-bold text-white">Local storage</h2>
              <p>
                Your wallet keystore, address book, network selection, connected sites, language, and
                interface preferences are stored locally on your device (browser extension storage on
                the web; encrypted device storage on mobile). Removing the app or extension removes
                this data; back up your recovery phrase first.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-bold text-white">No analytics or tracking</h2>
              <p>
                SUBFROST does <strong>not</strong> use analytics, crash reporting, advertising, or
                telemetry. We do not collect personally identifiable information for tracking, browsing
                history, or your activity across other apps and websites, and we do not track you
                across apps or websites owned by other companies.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-bold text-white">Data sale and sharing</h2>
              <p>
                We do not sell your data, and we do not share it with third parties for their own
                purposes. The limited sharing described above — Apple and Google for notification
                delivery and optional backup, Stripe for SUBFROST Pay, and SimpleSwap for optional
                cross-chain swaps — exists only to provide features you choose to use. We do not use
                your data to determine creditworthiness or for lending, except where you use SUBFROST
                Pay and such processing is required to provide that regulated service.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-bold text-white">Data retention and deletion</h2>
              <p>
                Self-custodial wallet data lives on your device and is removed when you uninstall the
                app or extension. If you use SUBFROST Pay, you can request deletion of your Pay account
                and associated data at{" "}
                <Link href="/delete-account" className="text-blue-300 underline hover:opacity-80">
                  subfrost.io/delete-account
                </Link>{" "}
                or by contacting us. Identity-verification (KYC/AML) records associated with SUBFROST
                Pay are retained for <strong>seven (7) years after account closure</strong> where
                applicable law requires us to keep them; other Pay account data is deleted on request.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-bold text-white">Children</h2>
              <p>
                SUBFROST is not directed to children under 13 (or the minimum age required in your
                jurisdiction).
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-bold text-white">Changes</h2>
              <p>
                We may update this policy; material changes will be posted at this URL with a new
                &ldquo;last updated&rdquo; date.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-bold text-white">Contact</h2>
              <p>
                Subzero Research Inc. —{" "}
                <a
                  href="mailto:support@subfrost.io"
                  className="text-blue-300 underline hover:opacity-80"
                >
                  support@subfrost.io
                </a>{" "}
                —{" "}
                <a href="https://subfrost.io" className="text-blue-300 underline hover:opacity-80">
                  https://subfrost.io
                </a>
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
