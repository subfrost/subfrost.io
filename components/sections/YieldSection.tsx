"use client"

import type React from "react"
import ScrollArrow from "../ScrollArrow"

interface YieldSectionProps {
  scrollToNext: () => void
}

const YieldSection: React.FC<YieldSectionProps> = ({ scrollToNext }) => {
  return (
    <div className="space-y-8 animate-fade-in">
      <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-center mb-4 sm:mb:6 md:mb-8 text-[#284372]">
        BITCOIN YIELD
      </h2>

      <div>
        <h3 className="font-bold text-base sm:text-base md:text-lg underline mb-2 text-[#284372]">Yield in Bitcoin</h3>
        <p className="mb-4 text-xs sm:text-xs md:text-sm">
          For users, we're essentially a "Bitcoin High-Yield Savings Account":
        </p>
        <ol className="list-decimal pl-5 space-y-2 mb-4 text-xs sm:text-xs md:text-sm">
          <li>
            Users stake their BTC with us in the simplest way possible (1 transaction). The user receives dxBTC, which
            represents their staked BTC.
          </li>
          <li>Their BTC is wrapped into frBTC (trustlessly and atomically), and placed in our yield vault.</li>
          <li>
            We deploy this frBTC into <u>market-neutral strategies</u> and <u>over-collateralized lending protocols</u>{" "}
            across Bitcoin L1, earning yield <u>regardless of BTC price movement</u>.
          </li>
          <li>We pass this yield back to our users in the form of BTC.</li>
          <li>
            Users unstake their BTC with us in the simplest way possible (1 transaction). The dxBTC leaves their wallet
            and is replaced with BTC.
          </li>
        </ol>
      </div>

      <div>
        <p className="mb-4 text-xs sm:text-xs md:text-sm">
          FROST stakers (in addition to securing the protocol) vote on which audited platforms we can deploy liquidity
          from our yield vault into.
        </p>
        <p className="mb-4 text-xs sm:text-xs md:text-sm">
          SUBFROST will benefit the entire DeFi ecosystem on Bitcoin L1 while rewarding users with yield in a simple and
          secure way—currently unheard of in the industry.
        </p>
      </div>

      <div>
        <h3 className="font-bold text-base sm:text-base md:text-lg underline mb-2 text-[#284372]">Where We Are</h3>
        <p className="mb-4 text-xs sm:text-xs md:text-sm">
          We are built on Alkanes as it is the only programmable metaprotocol (smart contracts) live on Bitcoin Layer-1.
          We are committed to interoperability and will evaluate and expand onto future programmable metaprotocols like
          BRC2.0, when they are ready for mainnet.
        </p>
      </div>

      {/* Down arrow to scroll to next section with label */}
      <ScrollArrow
        direction="down"
        onClick={scrollToNext}
        color="#284372"
        label="SUBFROST TOKENS"
        useSnowEffect={true}
      />
    </div>
  )
}

export default YieldSection
