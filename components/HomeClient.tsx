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
import { trackEvent } from "@/lib/analytics"
import MetricsBoxes from "@/components/MetricsBoxes"
import InfoSection from "@/components/InfoSection"
import ScrollArrow from "@/components/ScrollArrow"
import FeaturesGrid from "@/components/FeaturesGrid"
import AssetsOverview from "@/components/AssetsOverview"
import VaultsOverview from "@/components/VaultsOverview"
import StickyNav from "@/components/StickyNav"
import VolumeModal from "@/components/VolumeModal"
import LatestArticles from "@/components/articles/LatestArticles"
import XIcon from "@/components/XIcon"
import LinkedinIcon from "@/components/LinkedinIcon"
import { Github } from "lucide-react"
import LanguageToggle from "@/components/LanguageToggle"
import StableText from "@/components/StableText"
import { useTranslation } from "@/hooks/useTranslation"
import { externalLinks } from "@/lib/external-links"
import type { HomeStats } from "@/lib/stats"

type SocialLink = { type: "x" | "linkedin" | "github"; url: string }

const teamMembers: {
  name: string
  titleKey: string
  image: string
  descKey: string
  socials: SocialLink[]
}[] = [
  { name: "Gabe", titleKey: "team.title.founderCeo", image: "gabe.png", descKey: "team.gabe.description", socials: [{ type: "x", url: "https://x.com/gabe_subfrost" }, { type: "linkedin", url: "https://www.linkedin.com/in/gabelee0" }] },
  { name: "Flex", titleKey: "team.title.founderCto", image: "flex.png", descKey: "team.flex.description", socials: [{ type: "x", url: "https://x.com/judoflexchop" }, { type: "github", url: "https://github.com/kungfuflex" }] },
  { name: "Brooks", titleKey: "team.title.apacMarketing", image: "brooks.png", descKey: "team.brooks.description", socials: [{ type: "x", url: "https://x.com/brooks_subfrost" }] },
  { name: "Casuwu", titleKey: "team.title.swe", image: "Cas.jpg", descKey: "team.casuwu.description", socials: [{ type: "x", url: "https://x.com/0xcasuwu" }] },
  { name: "Tangata", titleKey: "team.title.swe", image: "tangata.jpg", descKey: "team.tangata.description", socials: [{ type: "x", url: "https://x.com/TangataNui" }] },
  { name: "Shang", titleKey: "team.title.devopsEngineer", image: "shang.png", descKey: "team.shang.description", socials: [{ type: "x", url: "https://x.com/ssh_Shang" }] },
  { name: "Domo", titleKey: "team.title.advisor", image: "domo.jpg", descKey: "team.domo.description", socials: [{ type: "x", url: "https://x.com/domodata" }] },
  { name: "Hex", titleKey: "team.title.advisor", image: "hex.jpg", descKey: "team.hex.description", socials: [{ type: "x", url: "https://x.com/hexbtc" }] },
  { name: "Allen", titleKey: "team.title.advisor", image: "allen.jpg", descKey: "team.allen.description", socials: [{ type: "x", url: "https://x.com/allenday" }] },
  { name: "Binari", titleKey: "team.title.advisor", image: "binari.png", descKey: "team.binari.description", socials: [{ type: "x", url: "https://x.com/0xBinari" }] },
  { name: "Mork1e", titleKey: "team.title.advisor", image: "mork.jpg", descKey: "team.mork1e.description", socials: [{ type: "x", url: "https://x.com/mork1e" }] },
  { name: "Eran", titleKey: "team.title.advisor", image: "eran.jpeg", descKey: "team.eran.description", socials: [{ type: "linkedin", url: "https://www.linkedin.com/in/eransinai/" }] },
]

// Founders (large cards) vs other team members (advisor-sized) vs advisors (right column)
const founders = teamMembers.slice(0, 2)
const teamMembersSmall = teamMembers.slice(2, 6)
const advisors = teamMembers.slice(6)

const socialIconMap = {
  x: XIcon,
  linkedin: LinkedinIcon,
  github: Github,
} as const

const socialLabelMap = {
  x: "X (Twitter)",
  linkedin: "LinkedIn",
  github: "GitHub",
} as const

export default function HomeClient({ initialStats }: { initialStats: HomeStats }) {
  const { t } = useTranslation()
  const [isVolumeModalOpen, setIsVolumeModalOpen] = useState(false)
  const sectionRefs = useRef<(HTMLElement | null)[]>([])
  const partnersSectionRef = useRef<HTMLDivElement | null>(null)

  const handleScrollDown = () => {
    sectionRefs.current[1]?.scrollIntoView({ behavior: "smooth" })
  }

  const handleScrollToPartners = () => {
    partnersSectionRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  return (
    <main className="relative">
      <GlobalStyles />
      <StickyNav />

      <VolumeModal
        isOpen={isVolumeModalOpen}
        onClose={() => setIsVolumeModalOpen(false)}
      />

      {/* Hero Section */}
      <section className="relative flex h-dvh flex-col items-center overflow-hidden bg-gradient-to-b from-blue-200 to-blue-50">
        <FrostBackdrop />
        <SocialButtons />

        {/* Top Left Buttons */}
        <div className="absolute top-4 left-4 z-20 flex flex-row items-center gap-2">
          <a
            href={externalLinks.apiLogin}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackEvent("api_login_click", { event_category: "navigation", event_label: "hero_header" })}
            className="flex justify-center px-5 py-2 rounded-md border border-white/70 text-white hover:bg-white/10 transition-colors font-bold text-sm"
          >
            <StableText textKey="hero.apiLogin" />
          </a>
          <a
            href={externalLinks.apiDocs}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackEvent("api_docs_click", { event_category: "navigation", event_label: "hero_header" })}
            className="hidden sm:flex justify-center px-5 py-2 rounded-md border border-white/70 text-white hover:bg-white/10 transition-colors font-bold text-sm"
          >
            <StableText textKey="hero.apiDocs" />
          </a>
          <a
            href={externalLinks.docs}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackEvent("official_docs_click", { event_category: "navigation", event_label: "hero_header" })}
            className="flex justify-center px-5 py-2 rounded-md border border-white/70 text-white hover:bg-white/10 transition-colors font-bold text-sm"
          >
            <span className="sm:hidden">
              <StableText textKey="hero.docsMobile" />
            </span>
            <span className="hidden sm:inline">
              <StableText textKey="hero.officialDocs" />
            </span>
          </a>
          <a
            href="/articles"
            onClick={() => trackEvent("blog_click", { event_category: "navigation", event_label: "hero_header" })}
            className="flex justify-center px-5 py-2 rounded-md border border-white/70 text-white hover:bg-white/10 transition-colors font-bold text-sm"
          >
            <StableText textKey="hero.blog" />
          </a>
        </div>

        {/* Top Right Button */}
        <div className="absolute top-4 right-4 z-20 flex flex-col-reverse md:flex-row items-end md:items-center gap-2 md:gap-4">
          <LanguageToggle variant="light" />
          <button
            onClick={() => {
              trackEvent("volume_charts_click", { event_category: "cta", event_label: "hero_header" })
              setIsVolumeModalOpen(true)
            }}
            className="flex justify-center px-5 py-2 rounded-md bg-white text-[#284372] hover:bg-[#f0f7ff] transition-colors font-bold text-sm shadow-md"
          >
            <StableText textKey="hero.volumeCharts" />
          </button>
        </div>

        {/* Main content - centered using flex, takes available space */}
        <div className="relative z-10 flex flex-1 flex-col items-center justify-start w-full max-w-4xl px-4 pt-[calc(50vh-14.5rem)] sm:pt-[calc(50vh-15.5rem)] md:pt-[calc(50vh-15.8rem)] lg:pt-[calc(50vh-16.2rem)]">
          {/* Content container */}
          <div className="flex flex-col items-center w-full">
            {/* SUBFROST title - changed B to ₿ */}
            <div className="w-full px-2 sm:px-0">
              <h1
                className={cn(
                  "text-[4rem] sm:text-[6.5rem] md:text-[8rem] lg:text-[9.11rem] text-white tracking-normal font-bold uppercase text-center snow-title",
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
              <ActionButtons />
              <MetricsBoxes onPartnershipsClick={handleScrollToPartners} />
            </div>
          </div>
        </div>

        {/* Arrow at bottom - absolute positioned like SocialButtons, clipped by overflow-hidden */}
        <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 z-20">
          <ScrollArrow
            direction="down"
            onClick={handleScrollDown}
            color="hsl(var(--brand-blue))"
            label={t("hero.learnMore")}
          />
        </div>
      </section>

      <InfoSection
        ref={(el) => {
          sectionRefs.current[1] = el
        }}
      >
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-5xl font-bold uppercase tracking-wider text-white snow-title-no-filter">
            {t("about.title1")}<span className="block">{t("about.title2")}</span>
          </h2>
          <p className="mt-4 text-xl text-gray-300">{t("about.subtitle")}</p>
        </div>

        <div className="space-y-20">
          {/* Assets Overview */}
          <div id="native-assets">
            <AssetsOverview />
          </div>

          {/* App Features */}
          <div id="subfrost-app" className="pt-10 border-t border-slate-300/20">
            <div className="text-center mb-8">
              <h3 className="text-3xl md:text-4xl font-bold uppercase tracking-wider text-white snow-title-no-filter mb-4">
                {t("subfrostApp.heading")}
              </h3>
              <p className="text-lg text-gray-400 max-w-2xl mx-auto">
                {t("subfrostApp.subheading")}
              </p>
            </div>

            {/* Features Grid with SVG visuals */}
            <FeaturesGrid />
          </div>

          {/* Vaults Overview - hidden */}
          {/* <div id="yield-products">
            <VaultsOverview />
          </div> */}

          <div id="team-partnerships" ref={partnersSectionRef} className="mt-24 pt-16 border-t border-slate-300/50">
            {/* Section: The Team */}
            <div className="text-center mb-8">
              <h2 className="text-3xl md:text-4xl font-bold uppercase tracking-wider text-white snow-title-no-filter">
                {t("team.heading")}
              </h2>
              <p className="text-lg text-gray-400 max-w-2xl mx-auto mt-4">
                {t("team.subheading")}
              </p>
            </div>
            {(() => {
              const renderCard = (member: (typeof teamMembers)[number], key: number, isFounder: boolean, smallImage: boolean = !isFounder) => {
                const cardClassName = isFounder
                  ? "group relative min-h-40 pt-2 px-1 md:px-2 pb-4 rounded-lg border border-gray-700 flex flex-col items-center justify-center transition-[background-color,transform] duration-300 bg-white/10 hover:bg-white/5 backdrop-blur-sm text-center overflow-hidden hover:scale-105"
                  : "group relative min-h-40 pt-3 px-1 md:px-3 pb-4 md:pb-8 rounded-lg border border-gray-700 flex flex-col items-center justify-center transition-[background-color,transform] duration-300 bg-white/10 hover:bg-white/5 backdrop-blur-sm text-center overflow-hidden hover:scale-105"
                return (
                  <div key={key} className={cardClassName}>
                    <div className={`flex flex-col items-center justify-center ${isFounder ? "space-y-1" : "space-y-2"} transition-opacity duration-300 group-hover:opacity-0`}>
                      <Image
                        src={`/Team/${member.image}`}
                        alt={member.name}
                        width={smallImage ? 64 : 160}
                        height={smallImage ? 64 : 160}
                        className={`${smallImage ? "w-16" : "w-36"} aspect-square max-w-full h-auto rounded-full mx-auto mb-2 object-cover`}
                      />
                      <h4 className="text-lg font-bold text-white">{member.name}</h4>
                      <p className="text-gray-400 text-sm">{t(member.titleKey)}</p>
                    </div>
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-3 sm:p-1 md:p-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                      <p className="text-xs text-gray-300 text-center px-2 sm:px-0 md:px-2">{t(member.descKey)}</p>
                      {member.socials.length > 0 && (
                        <div className="flex items-center justify-center gap-3 mt-3">
                          {member.socials.map((social) => {
                            const Icon = socialIconMap[social.type]
                            return (
                              <a
                                key={social.type}
                                href={social.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={`${member.name} on ${socialLabelMap[social.type]}`}
                                className="text-white hover:text-gray-300 transition-colors"
                              >
                                <Icon className="w-7 h-7" />
                              </a>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )
              }
              // Founders render as large cards; remaining team members match advisor card size
              const foundersGrid = (
                <div className="grid grid-cols-2 gap-4">
                  {founders.map((member, index) => renderCard(member, index, true, false))}
                </div>
              )
              // md and up: founders + small team stack in the left column
              const nonAdvisorColumn = (
                <div className="space-y-4">
                  {foundersGrid}
                  <div className="grid grid-cols-2 gap-4">
                    {teamMembersSmall.map((member, index) => renderCard(member, index, false))}
                  </div>
                </div>
              )
              const advisorColumn = (
                <div className="h-full grid grid-cols-2 gap-4 auto-rows-fr">
                  {advisors.map((member, index) => renderCard(member, index, false))}
                </div>
              )
              return (
                <>
                  {/* Below md: stacked — founders, then team + advisors flow together so an odd
                      number of team cards doesn't leave a gap before the advisors */}
                  <div className="md:hidden p-2 space-y-3">
                    {foundersGrid}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      {[...teamMembersSmall, ...advisors].map((member, index) => renderCard(member, index, false))}
                    </div>
                  </div>
                  {/* md and up: two columns — non-advisors left, advisors right */}
                  <div className="hidden md:grid md:grid-cols-2 gap-4 p-2 items-stretch">
                    {nonAdvisorColumn}
                    {advisorColumn}
                  </div>
                </>
              )
            })()}
          </div>

          {/* Latest articles from the SUBFROST blog (same-origin /api/articles) */}
          <LatestArticles />
        </div>
      </InfoSection>

      <Footer />
    </main>
  )
}
