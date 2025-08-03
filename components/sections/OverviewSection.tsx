"use client"

import type React from "react"
import ScrollArrow from "../ScrollArrow"

interface OverviewSectionProps {
  scrollToNext: () => void
}

const OverviewSection: React.FC<OverviewSectionProps> = ({ scrollToNext }) => {
  return (
    <div className="space-y-8 animate-fade-in">
      <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-center mb-4 sm:mb-6 md:mb-8 text-[#284372]">
        OVERVIEW OF SUBFROST
      </h2>

      <div>
        <h3 className="font-bold text-base sm:text-base md:text-lg underline mb-2 text-[#284372]">What Is SUBFROST?</h3>
        <p className="mb-4 text-xs sm:text-xs md:text-sm">
          Our primarily focus is generating BTC yield for our users, while providing liquidity to platforms built on
          Bitcoin L1 smart contract ecosystems (currently only Alkanes is live).
        </p>
      </div>

      <div>
        <h3 className="font-bold text-base sm:text-base md:text-lg underline mb-2 text-[#284372]">Why We Exist</h3>
        <p className="mb-2 text-xs sm:text-xs md:text-sm">
          SUBFROST exists to unite Bitcoin's store of value properties with the innovative financial capabilities that
          have driven growth in other blockchain ecosystems.
        </p>
        <p></p>
        <p className="mb-4 text-xs sm:text-xs md:text-sm">
          Our approach is through bringing yield to Bitcoin holders{" "}
          <u>without requiring them to move their assets to other chains</u>, and providing BTC liquidity to platforms
          built on programmable metaprotocols (such as Alkanes, BRC2.0).
        </p>
      </div>

      <div>
        <h3 className="font-bold text-base sm:text-base md:text-lg underline mb-2 text-[#284372]">
          Problems SUBFROST Solves
        </h3>

        <div className="space-y-3">
          <div>
            <p className="font-bold">1. Limited Bitcoin Utility</p>
            <p className="text-xs sm:text-xs md:text-sm">
              Bitcoin is primarily used as a store of value or investment vehicle. SUBFROST transforms BTC into a
              productive asset through wrapping, staking, and yield generation across the emerging Bitcoin DeFi
              landscape.
            </p>
          </div>

          <div>
            <p className="font-bold">2. DeFi Accessibility for Bitcoin Holders</p>
            <p className="text-xs sm:text-xs md:text-sm">
              Bitcoin holders are hesitant to use other blockchains due to security concerns, complexity, or technical
              barriers. SUBFROST provides a Bitcoin-native DeFi experience that feels familiar and secure, all in one
              intuitive platform.
            </p>
          </div>

          <div>
            <p className="font-bold">3. Yield Generation for BTC</p>
            <p className="text-xs sm:text-xs md:text-sm">
              Bitcoin itself doesn't generate yield. Through SUBFROST's staking mechanisms, users can earn yield while
              maintaining full exposure to BTC.
            </p>
          </div>

          <div>
            <p className="font-bold">4. Governance Participation</p>
            <p className="text-xs sm:text-xs md:text-sm">
              Though the most secure blockchain, Bitcoin lacks native governance mechanisms. SUBFROST introduces a
              governance system that allows community members to participate in protocol decisions while being rewarded
              for it.
            </p>
          </div>
        </div>
      </div>

      {/* Down arrow to scroll to next section with label */}
      <ScrollArrow direction="down" onClick={scrollToNext} color="#284372" label="BITCOIN YIELD" useSnowEffect={true} />
    </div>
  )
}

export default OverviewSection
