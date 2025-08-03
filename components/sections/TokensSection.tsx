"use client"

import type React from "react"
import ScrollArrow from "../ScrollArrow"

interface TokensSectionProps {
  scrollToNext: () => void
}

const TokensSection: React.FC<TokensSectionProps> = ({ scrollToNext }) => {
  return (
    <div className="space-y-8 animate-fade-in">
      <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-center mb-4 sm:mb-6 md:mb-8 text-[#284372]">
        SUBFROST TOKENS
      </h2>

      <div>
        <h3 className="font-bold text-base sm:text-base md:text-lg underline mb-2 text-[#284372]">
          frBTC (not yet released)
        </h3>
        <p className="mb-4 text-xs sm:text-xs md:text-sm">
          Backed 1:1 with BTC and never leaving the Bitcoin blockchain, frBTC will never lose its peg to BTC.
        </p>
        <p className="mb-4 text-xs sm:text-xs md:text-sm">
          frBTC is DeFi-compatable BTC, enabling users to fundamentally participate in DeFi on L1, namely, Alkanes. The
          reason frBTC is necessary is because native BTC has limited functionality beyond sending/receiving/paying
          network fees with it. Therefore, the ecosystem demands a compatible BTC synthetic, similar to WBTC, but with
          far fewer trust assumptions and never leaving the Bitcoin blockchain.
        </p>
        <p className="mb-4 text-xs sm:text-xs md:text-sm">
          <b>Tokenomics</b>: The exact amount of circulating frBTC will always be the exact amount of BTC in SUBFROST's
          reserve.
        </p>
      </div>

      <div>
        <h3 className="font-bold text-base sm:text-base md:text-lg underline mb-2 text-[#284372]">
          dxBTC (not yet released)
        </h3>
        <p className="mb-4 text-xs sm:text-xs md:text-sm">
          dxBTC is a yield-earning BTC token representing staked BTC in SUBFROST's yield vault. Users maintain full
          exposure to BTC while earning an APY in BTC. Users can easily unstake this back to BTC directly, in a single
          transaction.
        </p>
        <p className="mb-4 text-xs sm:text-xs md:text-sm">
          <b>Tokenomics</b>: The exact amount of circulating dxBTC will always be the exact amount of BTC deployed to
          SUBFROST's yield vault.
        </p>
      </div>

      <div>
        <h3 className="font-bold text-base sm:text-base md:text-lg underline mb-2 text-[#284372]">
          FROST (not yet released)
        </h3>
        <p className="mb-4 text-xs sm:text-xs md:text-sm">
          The SUBFROST protocol token. All protocol fees are used to buy & burn FROST, driving value to holders by
          increasing demand and decreasing supply.
        </p>
        <p className="mb-4 text-xs sm:text-xs md:text-sm">
          <u>Example to illustrate this process:</u>
        </p>
        <ol className="list-decimal pl-5 space-y-2 mb-4 text-xs sm:text-xs md:text-sm">
          <li>A user/entity wraps 1 BTC to frBTC and they pay a small fee of 0.10% to do this</li>
          <li>SUBFROST collects this 0.001 BTC fee and automatically buys FROST tokens from the open market</li>
          <li>SUBFROST then burns these FROST tokens</li>
        </ol>
        <p className="mb-4 text-xs sm:text-xs md:text-sm">
          <b>Tokenomics</b>: SUBFROST aims to be a foundational piller of the DeFi ecosystem on Bitcoin L1, maximizing
          value creation for holders and stakers of FROST for as long as Bitcoin miners are mining Bitcoin. Therefore,
          this will not be a "fair mint", as this is not a community token.
        </p>
        <p className="text-xs sm:text-xs md:text-sm">
          Currently, this 1B FROST (expected) is allocated in the following ways:
        </p>
        <ul className="list-disc pl-5 space-y-2 mb-4 text-xs sm:text-xs md:text-sm">
          <li>15% to investors where equity converts to FROST, with a lockup/vesting period (we are raising!)</li>
          <li>
            85% to team, builder, and community incentive programs; our goal is to maximize alignment between incentives
            and the best possible long-term outcomes of SUBFROST
          </li>
        </ul>
      </div>

      {/* Down arrow to scroll to next section with label */}
      <ScrollArrow
        direction="down"
        onClick={scrollToNext}
        color="#284372"
        label="PROTOCOL SECURITY"
        useSnowEffect={true}
      />
    </div>
  )
}

export default TokensSection
