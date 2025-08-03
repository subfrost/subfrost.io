"use client"

import type React from "react"
import ScrollArrow from "../ScrollArrow"

interface SecuritySectionProps {
  scrollToNext: () => void
}

const SecuritySection: React.FC<SecuritySectionProps> = ({ scrollToNext }) => {
  return (
    <div className="space-y-8 animate-fade-in">
      <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-center mb-4 sm:mb-6 md:mb-8 text-[#284372]">
        PROTOCOL SECURITY
      </h2>

      <div>
        <h3 className="font-bold text-base sm:text-base md:text-lg underline mb-2 text-[#284372]">
          Trustless Wrapping & Unwrapping
        </h3>
        <p className="mb-4 text-xs sm:text-xs md:text-sm">
          The wrap from BTC to frBTC is atomic, while the unwrap from frBTC to BTC is the most secure and fault tolerant
          cryptographic mechanism ever developed (called SUBRAIL) but is subject to Bitcoin's block speed.
        </p>
      </div>

      <div>
        <h3 className="font-bold text-base sm:text-base md:text-lg underline mb-2 text-[#284372]">
          Implementation of F.R.O.S.T. on Bitcoin
        </h3>
        <p className="mb-4 text-xs sm:text-xs md:text-sm">
          Similar to staking in the most secure of PoS networks, SUBFROST identifies the top 255 stakers as potential
          signers, and then randomly selects 170 of them.
        </p>
        <p className="mb-4 text-xs sm:text-xs md:text-sm">
          This is an implementation of F.R.O.S.T. (Flexible Round-Optimized Schnorr Threshold signature scheme) to
          facilitate the trustless federated unwrap, and which we have named our protocol token after.
        </p>
      </div>

      <div>
        <h3 className="font-bold text-base sm:text-base md:text-lg underline mb-2 text-[#284372]">
          Violator's BTC is at Stake
        </h3>
        <p className="mb-4 text-xs sm:text-xs md:text-sm">
          These stakers are highly incentivized to uphold the tightest security standards, and highly disincentivized to
          operate with anything less than honest behavior, as they are actually staking frBTC/FROST LP.
        </p>
        <p className="mb-4 text-xs sm:text-xs md:text-sm">
          This means violations result in the slashing of signer's BTC directly, along with their FROST tokens.
          Violations will range in slashing of 5-100% of the dishonest signers stake.
        </p>
      </div>

      {/* Down arrow to scroll to next section */}
      <ScrollArrow direction="down" onClick={scrollToNext} color="#284372" label="GET INVOLVED" useSnowEffect={true} />
    </div>
  )
}

export default SecuritySection
