/**
 * @file app/page.tsx
 * @description This is the main page of the application.
 *
 * UI/UX Decisions:
 * - "Visit Them!" Button Behavior: Changed the "Visit Them!" button in the `MetricsBoxes` component to scroll to the "Partners" section instead of opening a modal. This provides a more direct user flow.
 * - dxBTC Section Mobile Layout: Reordered the `dxBTC` section to match the `frBTC` section on mobile devices. The DOM elements are rearranged to show the image first, followed by the text and button. On desktop, `md:order-1` and `md:order-2` are used to maintain the mirrored layout (Text | Image).
 * - Team Member Links: Added social media links to team member profiles and reordered them. The team member cards are now wrapped in `<a>` tags, making them clickable. A subtle hover effect (scale) is added for better user feedback.
 * - Partner Card Tags: Added a "DeFi" tag to each partner card. The card height was increased and flexbox properties were adjusted to position the tag at the bottom.
 * - frBTC Section Layout: The frBTC section has been updated to a two-column grid layout, with the text on the left and the image on the right. This mirrors the frBTC section but with a reversed order, creating a more balanced and visually engaging "About" section.
 * - Hero Section: The hero section is designed to fill the viewport (`h-dvh`) to prevent unintended scrolling on mobile devices.
 * - Scrollable "About" Section: The multi-page "About" section has been consolidated into a single, scrollable `InfoSection`. This was achieved by moving the content of the second `InfoSection` into the first and updating the `InfoSection` component to allow for vertical overflow.
 * - Simplified Scrolling: The `handleScrollDown` function and `sectionRefs` have been simplified. The page now only manages the scroll from the hero section to the unified "About" section. The `currentSection` state has been removed as it's no longer needed.
 * - Partner Grid Layout: Adjusted the partner logo grid to be 3 columns on medium screens and 4 on large screens to provide more space for the tags.
 * - Partner Order: Reordered the partners to display "Saturn BTC" and "[Best in Slot]" after "OYL Corp".
 * - Custom Partner Tags: Added a `tag` property to each partner object to allow for custom tags.
 * - Partner Logo Size: Increased the size of the partner logos to better fill the card space.
 * - Partner Logo Position: Adjusted the vertical position of the partner logo to prevent it from overlapping with the text on hover.
 * - Partner Card Layout: Refactored the partner card to use a flexbox layout. It now has a minimum height (`min-h-40`) and dynamic vertical padding to ensure cards expand for longer names, preventing text from overlapping with the logo. The `aspect-square` class was removed to allow for this dynamic height.
 * - Partner Card Padding: Adjusted padding to `pt-3 px-3 pb-8` to create a safe area at the bottom for the tag, preventing it from overlapping with the partner's name.
 * - Partner Card Hover Spacing: Reduced the space between the title and description on hover for a more compact layout.
 * - Partner Card Hover Effect: Implemented a hover effect on partner cards. On hover, the card darkens, a logo fades, the title moves to the top and turns white, and the description appears.
 * - Partner Card Glow: Added a white glow effect to the partner cards to match the style in the partnerships modal.
 * - Partner Card Styling: Changed the background color of partner cards to white and updated the text color to maintain readability.
 * - Partner Logo Styling: Removed the circular clipping (`rounded-full`) and changed object-fit to `contain` for partner logos to prevent them from being cut off.
 * - Partner Card Tag Styling: Reduced tag height and positioned it at the bottom-left of the card using absolute positioning.
 * - Structured Layout: The "About" section has been restructured into a two-column layout on larger screens, with diagrams on one side and text on the other, to improve visual balance and readability.
 * - Consistent Headings: The "Our Mission" heading has been updated to match the styling of the other section headings for a more consistent design.
 * - Improved Readability: Added spacing between lines in the frBTC and frBTC description paragraphs to improve readability.
 * - Professional List Formatting: The frBTC yield generation list has been reformatted with a numbered and lettered structure to appear more professional and investor-friendly.
 * - Numbered List: The frBTC description now includes a numbered list to clearly outline its key features.
 * - Final Images: The frBTC and frBTC diagrams have been updated to their final versions.
 * - Image Styling: The frBTC image has been updated to remove the background and apply a circular clip-path.
 * - Image Size Adjustment: The frBTC image size has been reduced by 33% for better visual balance.
 *
 * 2025-11-01: Updated partner links to match the links in the partnerships modal.
 * 2025-11-01: Added and corrected links for team member profiles.
 * 2025-11-01: Added links to team member profiles and reordered them. Wrapped team member cards in `<a>` tags to make them clickable.
 * 2025-10-31: Adjusted header font size on mobile to ensure it fits on two lines.
 * 2025-10-31: Removed Pashov from team and updated images for Eran and Allen.
 * 2025-10-31: Replaced emoji placeholders with team member images and refactored to use a `teamMembers` array.
 * 2025-10-31: Refactored team section to include all 9 members in a single container and updated names/titles.
 * 2025-10-31: Added 5 new team member cards and updated the section title.
 * 2025-10-31: Adjusted partner logo grid to be 4 columns on medium screens and 5 on large and extra-large screens.
 * 2025-10-31: Adjusted partner logo grid to be 4 columns on large screens.
 * 2025-10-31: Adjusted partner logo grid to be 4 columns on extra-small screens and 5 on small screens and up.
 * 2025-10-31: Adjusted partner logo grid to be 4 columns on medium screens.
 * 2025-10-31: Set a fixed height for partner card titles to ensure uniform card size.
 * 2025-10-31: Updated "Partners" section to use brand's dark blue for title and logo borders.
 * 2025-10-31: Moved "READ ABOUT frBTC" button to be under text on mobile.
 * 2025-10-31: Styled frBTC subtitle to match body text size and be italicized.
 * 2025-10-31: Updated frBTC and frBTC titles to be two-line headings.
 * 2025-10-31: Adjusted frBTC section grid to a 33/66 width ratio.
 * 2025-10-31: Increased space between frBTC image and button.
 * 2025-10-31: Adjusted spacing around frBTC image and button.
 * 2025-10-31: Reduced frBTC image size by 33%.
 * 2025-10-31: Placed frBTC description on a new line for improved readability.
 * 2025-10-31: Adjusted frBTC image width to 750px.
 * 2025-10-31: Doubled the size of the frBTC image.
 * 2025-10-31: Reverted frBTC image to original size and aligned its container with the text block below.
 * 2025-10-31: Added "READ ABOUT frBTC" button and made frBTC image full-width.
 * 2025-10-31: Added "Read more" button to the frBTC section.
 * 2025-10-31: Adjusted button width and added `whitespace-nowrap` to ensure single-line text.
 * 2025-10-31: Updated "Read more" button text and spacing.
 * 2025-10-31: Restyled "Read more" button to match action buttons.
 * 2025-10-31: Moved and restyled "Read more" button.
 * 2025-10-31: Updated frBTC subtitle with new text and styling.
 * 2025-10-31: Added descriptive text under the frBTC title.
 * 2025-10-31: Removed redundant "THE MOST SEAMLESS USE OF NATIVE BTC" section.
 * 2025-10-31: Styled the "(coming soon!)" subtitle to be smaller and on a new line.
 * 2025-10-31: Refactored frBTC section to a single-column layout for better content flow.
 * 2025-10-31: Updated section titles to use the brand's dark blue for consistency.
 * 2025-10-30: Reduced frBTC image size.
 * 2025-10-30: Removed background from frBTC image.
 * 2025-10-30: Updated frBTC image to final version.
 * 2025-10-30: Updated frBTC image to final version.
 * 2025-10-30: Updated frBTC image and moved section titles.
 * 2025-10-30: Replaced diagrams with placeholder images.
 * 2025-10-30: Re-formatted frBTC description into a numbered list.
 * 2025-10-30: Re-formatted layout to be more structured and professional.
 * 2025-10-30: Re-formatted frBTC yield list for a more professional appearance.
 * 2025-10-30: Added spacing between lines in text paragraphs for improved readability.
 * 2025-10-30: Updated "Our Mission" heading to match other section headings.
 * 2025-10-30: Refactored the "About" section layout to be full-width and removed redundant content.
 * 2025-10-30: Merged the two "About" `InfoSection` components into a single scrollable section. Removed multi-page scrolling logic.
 * 2025-10-16: Added state management for the frBTC Activity modal.
 */
"use client"

import { useState, useRef } from "react"
import Image from "next/image"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import FrostBackdrop from "@/components/FrostBackdrop"
import BottomAnimatedSubtitle from "@/components/BottomAnimatedSubtitle"
import Footer from "@/components/Footer"
import GlobalStyles from "@/components/GlobalStyles"
import SocialButtons from "@/components/SocialButtons"
import ActionButtons from "@/components/ActionButtons"
import MetricsBoxes from "@/components/MetricsBoxes"
import FrbtcActivityModal from "@/components/FrbtcActivityModal"
import CustomModal from "@/components/CustomModal"
import InfoSection from "@/components/InfoSection"
import ScrollArrow from "@/components/ScrollArrow"

const partners = [
  { name: "OYL Corp", logo: "oylcorp.jpeg", description: "Premier AMM on Alkanes", link: "https://app.oyl.io/portfolio/", tag: "DeFi" },
  { name: "Saturn BTC", logo: "Saturn.svg", description: "Premier AMM/DEX on Arch Network", link: "https://www.saturnbtc.io/app/swap", tag: "DeFi" },
  { name: "[Best in Slot]", logo: "bestinslot.png", description: "Sequencer-powered AMM on BRC2.0", link: "https://bestinslot.xyz/", tag: "DeFi" },
  { name: "iDclub", logo: "idclub.png", description: "Alkanes Marketplace & Launchpad", link: "https://idclub.io/marketplace", tag: "DeFi" },
  { name: "Sats Terminal", logo: "satsterminal.jpg", description: "Swap for Alkanes, Runes, and Spark Tokens", link: "https://www.satsterminal.com/", tag: "DeFi" },
  { name: "Yuzo", logo: "Yuzo.png", description: "₿apps on Bitcoin Layer-1 via BRC2.0", link: "https://yuzo.xyz/", tag: "DeFi" },
  { name: "CatSwap", logo: "catswap.jpg", description: "Premier AMM/DEX on BRC2.0", link: "https://catswap.fun/", tag: "DeFi" },
  { name: "Satonomy", logo: "satonomylogo.png", description: "UTXO Management Platform", link: "https://app.satonomy.io/", tag: "Tools" },
  { name: "Ordiscan", logo: "ordiscan.jpg", description: "Bitcoin Metaprotocol Explorer & Tools", link: "https://ordiscan.com/", tag: "Explorer" },
  { name: "radFi", logo: "radfilogo.jpeg", description: "Runes Marketplace & Mint Platform", link: "https://www.radfi.co/", tag: "DeFi" },
  { name: "Bound Money", logo: "bound money.png", description: "USD Stablecoin (bUSD) on Bitcoin Layer-1", link: "https://bound.money/", tag: "Stable Coin" },
  { name: "Alkamon (TBA)", logo: "alkamon.png", description: "First Advanced Game on Bitcoin Layer-1", link: "https://mint.lasereyes.build/alkamon", tag: "DeFi" },
  { name: "Fairmints (TBA)", logo: "fairmints.svg", description: "Alkanes and Orbitals Marketplace & Tools", link: "https://fairmints.io/", tag: "DeFi" },
  { name: "pizza.fun (TBA)", logo: "pizzadotfun.png", description: "Alkanes Token Launchpad with Gasless Mints", link: "https://x.com/pizzadotfunbtc", tag: "DeFi" },
  { name: "ADOR Orbitals", logo: "adorspng.png", description: "Alkanes ArtFi Platform", link: "https://orbital.adors.org/alkane/wrap-btc", tag: "DeFi" },
  { name: "Layer 1 Foundation", logo: "layer1foundation.jpg", description: "BRC20 and Metaprotocol Development & Support", link: "https://layer1.foundation/", tag: "Group" },
  { name: "LaserEyes", logo: "red_lasereyes.png", description: "Bitcoin Wallet Infrastructure", link: "https://www.lasereyes.build/", tag: "Infra" },
  { name: "Rebar Labs", logo: "rebar.jpeg", description: "MEV-aware Bitcoin Infrastructure", link: "https://rebarlabs.io/", tag: "Infra" },
  { name: "Pashov Group", logo: "pashov.png", description: "Initial Technical Audits (TBD) of SUBFROST", link: "https://www.pashov.net/", tag: "Audits (TBD)" },
]

const teamMembers = [
  { name: "Flex", title: "CTO", image: "flex.jpg", link: "https://x.com/judoflexchop" },
  { name: "Gabe", title: "CEO", image: "gabe.jpg", link: "https://x.com/GabeLee0" },
  { name: "Domo", title: "Advisor", image: "domo.jpg", link: "https://x.com/domodata" },
  { name: "Hex", title: "Advisor", image: "hex.jpg", link: "https://x.com/LH_exe" },
  { name: "Binari", title: "Advisor", image: "binari.png", link: "https://x.com/0xBinari" },
  { name: "Allen", title: "Advisor", image: "allen.jpg", link: "https://x.com/allenday" },
  { name: "Eran", title: "Advisor", image: "1731879773679.jpeg", link: "https://www.linkedin.com/in/eransinai/" },
  { name: "Hathbanger", title: "Advisor", image: "hath.jpg", link: "https://x.com/hathbanger" },
]

export default function Page() {
  const [isMetricsModalOpen, setIsMetricsModalOpen] = useState(false)
  const [isFrbtcActivityModalOpen, setIsFrbtcActivityModalOpen] = useState(false)
  const sectionRefs = useRef<(HTMLElement | null)[]>([])
  const partnersSectionRef = useRef<HTMLDivElement | null>(null)

  const handleScrollDown = () => {
    sectionRefs.current[1]?.scrollIntoView({ behavior: "smooth" })
  }

  const handleScrollToPartners = () => {
    partnersSectionRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  const handleScrollToPartnersAndCloseMetrics = () => {
    handleCloseMetricsModal()
    // A small delay ensures the modal closes before scrolling, preventing layout jank.
    setTimeout(() => {
      partnersSectionRef.current?.scrollIntoView({ behavior: "smooth" })
    }, 300)
  }

  const handleOpenMetricsModal = () => {
    setIsMetricsModalOpen(true)
  }

  const handleCloseMetricsModal = () => {
    setIsMetricsModalOpen(false)
  }

  const handleOpenFrbtcActivityModal = () => {
    setIsFrbtcActivityModalOpen(true)
  }

  const handleCloseFrbtcActivityModal = () => {
    setIsFrbtcActivityModalOpen(false)
  }

  return (
    <main className="relative">
      <GlobalStyles />
      <FrbtcActivityModal
        isOpen={isFrbtcActivityModalOpen}
        onClose={handleCloseFrbtcActivityModal}
      />
      <div className="md:hidden">
        <CustomModal
          isOpen={isMetricsModalOpen}
          onClose={handleCloseMetricsModal}
          title="Metrics"
        >
          <MetricsBoxes onPartnershipsClick={handleScrollToPartnersAndCloseMetrics} isModal={true} />
        </CustomModal>
      </div>

      {/* Hero Section */}
      <section className="relative flex h-dvh flex-col items-center overflow-hidden bg-gradient-to-b from-blue-200 to-blue-50">
        <FrostBackdrop />
        <SocialButtons />

        {/* Updated positioning to place the bottom of the title just above center */}
        <div className="relative z-10 flex flex-col items-center justify-center w-full max-w-4xl px-4 h-screen">
          {/* Content container with adjusted positioning */}
          <div className="flex flex-col items-center w-full absolute top-[50%] left-1/2 transform -translate-x-1/2 -translate-y-1/2">
            {/* SUBFROST title - changed B to ₿ */}
            <div className="w-full px-2 sm:px-0">
              <h1
                className={cn(
                  "text-[4rem] sm:text-[6rem] md:text-[7rem] lg:text-[9.11rem] text-white tracking-normal font-bold uppercase text-center snow-title",
                )}
              >
                SU₿FROST
              </h1>
            </div>

            {/* Top subtitle below the title */}
            <div className="mt-1 mb-6 flex flex-col items-center">
              <div className="flex justify-center w-full">
                <BottomAnimatedSubtitle />
              </div>
              <ActionButtons
                onMetricsClick={handleOpenMetricsModal}
                onFrbtcActivityClick={handleOpenFrbtcActivityModal}
              />
              <div className="hidden md:block">
                <MetricsBoxes onPartnershipsClick={handleScrollToPartners} />
              </div>
            </div>
          </div>
        </div>

        <div className="absolute bottom-4">
          <ScrollArrow
            direction="down"
            onClick={handleScrollDown}
            color="hsl(var(--brand-blue))"
            label="Scroll to Learn More"
          />
        </div>

        <Footer />
      </section>

      <InfoSection
        ref={(el) => {
          sectionRefs.current[1] = el
        }}
      >
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-bold uppercase tracking-wider text-white snow-title-no-filter">
            SEAMLESS USE OF <span className="block">NATIVE BTC</span>
          </h2>
          <p className="mt-4 text-xl text-gray-300">in ₿apps built on Bitcoin Layer-1</p>
        </div>
        <div className="space-y-16">
          {/* Mission Section */}
          <div className="text-center">
            <h3 className="text-3xl font-bold text-white mb-4 snow-title-no-filter">Our Mission</h3>
            <div className="text-gray-300 leading-relaxed text-lg space-y-6 max-w-4xl mx-auto text-left">
              <p>
                SUBFROST is on a mission to be one of the most robust, <b>important</b>, and useful protocols for the future of our financial system.
              </p>
              <p>
                We enable the <i>seamless use</i> of native BTC in ways that were never before possible.
              </p>
              <p>
                We are the key to interoperability between programmable Bitcoin environments,
                unlocking novel DeFi experiences for users and instituitons that don't trust putting their BTC anywhere but Bitcoin Layer-1.
              </p>
            </div>
          </div>

          {/* frBTC Section */}
          <div className="grid md:grid-cols-3 gap-4 items-center pt-12 border-t border-slate-300/50">
            <div className="flex flex-col items-center">
              <Image
                src="/Diagrams/fr-btc.png"
                alt="frBTC Diagram"
                width={224}
                height={112}
                className="rounded-full snow-image"
              />
              <a
                href="https://docs.subfrost.io/tokens/frBTC-overview"
                target="_blank"
                rel="noopener noreferrer"
                className="hidden md:flex justify-center items-center px-6 py-2 mt-16 w-56 rounded-md bg-white text-[#284372] hover:bg-blue-100 transition-colors font-bold text-sm whitespace-nowrap"
              >
                READ ABOUT frBTC
              </a>
            </div>
            <div className="text-gray-300 leading-relaxed text-lg space-y-6 text-left md:col-span-2">
              <h3 className="text-3xl font-bold text-white">
                <span className="snow-title-no-filter">frBTC</span>
                <span className="block text-xl font-normal text-gray-300">Defi-compatible. Unnoticable. BTC.</span>
                <span className="block text-lg font-normal mt-1 italic">
                  Live on Alkanes. Coming soon to BRC2.0 (Nov), Arch and Midl (mainnets TBD).
                </span>
              </h3>
              <p>
                Decentralized, permissionless, and always on Bitcoin L1, the UX that our unnoticeable-frBTC delivers means for the <b>first time in history</b>,
                users can participate in DeFi transactions directly with the BTC in their wallet.
              </p>
              <ol className="list-decimal list-inside space-y-2">
                <li>No Bitcoin L2 required.</li>
                <li>No "deposit here first" required.</li>
                <li>No bridge to Ethereum required.</li>
              </ol>
              <p>
                Just native BTC, working seamlessly with the growing ecosystem of ₿apps on L1.
              </p>
              <div className="flex justify-center mt-4 md:hidden">
                <a
                  href="https://docs.subfrost.io/tokens/frBTC-overview"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex justify-center items-center px-6 py-2 mt-4 w-56 rounded-md bg-white text-[#284372] hover:bg-blue-100 transition-colors font-bold text-sm whitespace-nowrap"
                >
                  READ ABOUT frBTC
                </a>
              </div>
            </div>
          </div>

          {/* dxBTC Section */}
          {/* dxBTC Section */}
          <div className="grid md:grid-cols-3 gap-8 items-center pt-12 border-t border-slate-300/50">
            <div className="flex flex-col items-center md:order-2">
              <div
                className="relative flex items-center justify-center w-56 h-56 rounded-full bg-orange-500 snow-image"
                style={{ width: 224, height: 224 }}
              >
                <span className="text-center text-white font-bold text-2xl uppercase">
                  COMING
                  <br />
                  SOON
                </span>
              </div>
              <a
                href="https://docs.subfrost.io/tokens/dxBTC-overview"
                target="_blank"
                rel="noopener noreferrer"
                className="hidden md:flex justify-center items-center px-6 py-2 mt-16 w-56 rounded-md bg-white text-[#284372] hover:bg-blue-100 transition-colors font-bold text-sm whitespace-nowrap"
              >
                READ ABOUT dxBTC
              </a>
            </div>
            <div className="text-gray-300 leading-relaxed text-lg space-y-6 text-left md:col-span-2 md:order-1">
              <h3 className="text-3xl font-bold text-white">
                <span className="snow-title-no-filter">dxBTC</span>
                <span className="block text-xl font-normal text-gray-300">Yield-bearing BTC of Bitcoin L1</span>
                <span className="block text-lg font-normal mt-1 italic">(coming soon!)</span>
              </h3>
              <p>
                dxBTC is the simplest way for users to earn yield on their BTC in a permissionless fashion. <b>1 Bitcoin Transaction.</b>
              </p>
              <p>
                At the same time, it is the <b>ideal</b> programmable BTC reserve note for instituitions, as their BTC never leaves Bitcoin L1.
              </p>
              <p>
                Yields for dxBTC holders are generated from the use of frBTC across programmable Bitcoin ecosystems and their markets, creating a symbiotic relationship between the two tokens.
              </p>
              <div className="flex justify-center mt-4 md:hidden">
                <a
                  href="https://docs.subfrost.io/tokens/dxBTC-overview"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex justify-center items-center px-6 py-2 mt-4 w-56 rounded-md bg-white text-[#284372] hover:bg-blue-100 transition-colors font-bold text-sm whitespace-nowrap"
                >
                  READ ABOUT dxBTC
                </a>
              </div>
            </div>
          </div>
          <div className="mt-24 pt-16 border-t border-slate-300/50">
            <div className="grid md:grid-cols-2 gap-8 items-start">
              {/* Left Column */}
              <div>
                {/* Section: The Team */}
                <div className="text-center mb-8">
                  <h2 className="text-4xl md:text-3xl font-bold uppercase tracking-wider text-white snow-title-no-filter">
                    SUBFROST TEAM
                  </h2>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {teamMembers.map((member, index) => {
                    const content = (
                      <>
                        <Image
                          src={`/Team/${member.image}`}
                          alt={member.name}
                          width={64}
                          height={64}
                          className="w-16 h-16 rounded-full mx-auto mb-2 object-cover"
                        />
                        <h4 className="text-lg font-bold text-white">{member.name}</h4>
                        <p className="text-gray-400 text-sm">{member.title}</p>
                      </>
                    )

                    return member.link ? (
                      <a
                        key={index}
                        href={member.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-white/10 backdrop-blur-sm p-4 rounded-lg border border-gray-700 text-center block transition-transform hover:scale-105"
                      >
                        {content}
                      </a>
                    ) : (
                      <div
                        key={index}
                        className="bg-white/10 backdrop-blur-sm p-4 rounded-lg border border-gray-700 text-center"
                      >
                        {content}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Right Column */}
              <div ref={partnersSectionRef}>
                {/* Section: Partners */}
                <div className="text-center mb-8">
                  <h2 className="text-4xl md:text-3xl font-bold uppercase tracking-wider text-white snow-title-no-filter">
                    Partners
                  </h2>
                </div>
                  <div className="grid grid-cols-3 lg:grid-cols-4 gap-4">
                    {partners.map((partner, index) => (
                      <a
                        key={index}
                        href={partner.link || "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group relative min-h-40 pt-3 px-3 pb-8 rounded-lg border border-gray-200 flex flex-col items-center justify-center transition-colors duration-300 bg-white hover:bg-white/10 hover:border-gray-700 shadow-[0_0_10px_rgba(255,255,255,0.8)] overflow-hidden"
                      >
                        {/* Default view */}
                        <div className="flex flex-col items-center justify-center space-y-2 transition-opacity duration-300 group-hover:opacity-0">
                          <Image
                            src={`/Partner Logos/${partner.logo}`}
                            alt={partner.name}
                            width={64}
                            height={64}
                            className="object-contain w-16 h-16"
                          />
                          <p className="text-xs font-bold text-gray-800 text-center">{partner.name}</p>
                        </div>

                        {/* Hover view */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center p-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                          <p className="text-xs font-bold text-white text-center">{partner.name}</p>
                          <p className="text-xs text-gray-300 text-center px-2 mt-1">{partner.description}</p>
                        </div>

                        {/* DeFi Tag: Fades out */}
                        <div className="absolute bottom-1 left-1 bg-slate-200 text-slate-800 rounded-full px-2 text-xs transition-opacity duration-300 group-hover:opacity-0">
                          {partner.tag}
                        </div>
                      </a>
                    ))}
                  </div>
              </div>
            </div>
          </div>
        </div>
      </InfoSection>
    </main>
  )
}
