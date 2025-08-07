"use client"

import type React from "react"
import { useState, useEffect, useRef } from "react"
import { cn } from "@/lib/utils"
import { ArrowLeft, ArrowRight } from "lucide-react"
import CustomModal from "./CustomModal"

interface WhatIsSubfrostModalProps {
  isOpen: boolean
  onClose: () => void
}

const WhatIsSubfrostModal: React.FC<WhatIsSubfrostModalProps> = ({ isOpen, onClose }) => {
  const [currentPage, setCurrentPage] = useState<"overview" | "yield" | "security" | "tokens">("overview")
  const contentRef = useRef<HTMLDivElement>(null)

  const goToYieldPage = () => {
    setCurrentPage("yield")
  }

  const goToOverviewPage = () => {
    setCurrentPage("overview")
  }

  const goToSecurityPage = () => {
    setCurrentPage("security")
  }

  const goToTokensPage = () => {
    setCurrentPage("tokens")
  }

  // Scroll to top when page changes or modal opens
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = 0
    }
  }, [currentPage, isOpen])

  // Get the title based on current page
  const getTitle = () => {
    switch (currentPage) {
      case "overview":
        return "OVERVIEW"
      case "yield":
        return "WHERE DOES THE YIELD COME FROM?"
      case "security":
        return "PROTOCOL SECURITY"
      case "tokens":
        return "OFFICIAL SUBFROST TOKENS"
      default:
        return "OVERVIEW"
    }
  }

  return (
    <>
      <CustomModal isOpen={isOpen} onClose={onClose} title={getTitle()} contentRef={contentRef}>
        {currentPage === "overview" ? (
          <div className={cn("text-xs space-y-6 font-medium")}>
            <div className="flex justify-between items-center mb-2">
              <button onClick={goToSecurityPage} className="flex items-center text-[#284372] hover:text-blue-700">
                <ArrowLeft className="h-3 w-3 mr-1" /> Back to Protocol Security
              </button>
              <button
                onClick={goToYieldPage}
                className="flex items-center text-[#284372] hover:text-blue-700 font-bold"
              >
                BTC Yield <ArrowRight className="h-3 w-3 ml-1" />
              </button>
            </div>

            <div>
              <h3 className="font-bold text-sm underline mb-2">What Is SUBFROST?</h3>
              <p className="mb-4">
                We are a DeFi application on Bitcoin L1 programmable metaprotocols (like Alkanes, BRC2.0), focused on
                BTC yield generation for our users, while providing liquidity to platforms built on Bitcoin L1 smart
                contract ecosystems, when they are ready for mainnet (currently only Alkanes is live).
              </p>
            </div>

            <div>
              <h3 className="font-bold text-sm underline mb-2">Why We Exist</h3>
              <p className="mb-2">
                SUBFROST exists to bridge the gap between Bitcoin's store of value properties and the innovative DeFi
                capabilities available on other blockchains.
              </p>
              <p className="mb-4">
                Bitcoin, while being the largest and most secure cryptocurrency, has traditionally lacked these advanced
                financial capabilities that have driven growth in other blockchain ecosystems.
              </p>
              <p className="mb-4">
                Our approach is through bringing yield to Bitcoin holders{" "}
                <u>without requiring them to move their assets to other chains</u>, and providing BTC liquidity to
                platforms built on programmable metaprotocols (such as Alkanes, BRC2.0).
              </p>
            </div>

            <div>
              <h3 className="font-bold text-sm underline mb-2">Problems SUBFROST Solves</h3>

              <div className="space-y-3">
                <div>
                  <p className="font-bold">1. Limited Bitcoin Utility</p>
                  <p>
                    Bitcoin is primarily used as a store of value or investment vehicle. SUBFROST transforms BTC into a
                    productive asset through wrapping, staking, and yield generation.
                  </p>
                </div>

                <div>
                  <p className="font-bold">2. DeFi Accessibility for Bitcoin Holders</p>
                  <p>
                    Bitcoin holders are hesitant to use other blockchains due to security concerns, complexity, or
                    technical barriers. SUBFROST provides a Bitcoin-native DeFi experience that feels familiar and
                    secure, all in one intuitive platform.
                  </p>
                </div>

                <div>
                  <p className="font-bold">3. Yield Generation for BTC</p>
                  <p>
                    Bitcoin itself doesn't generate yield. Through SUBFROST's staking mechanisms, users can earn yield
                    while maintaining full exposure to BTC.
                  </p>
                </div>

                <div>
                  <p className="font-bold">4. Governance Participation</p>
                  <p>
                    Though the most secure blockchain, Bitcoin lacks native governance mechanisms. SUBFROST introduces a
                    governance system that allows community members to participate in protocol decisions while being
                    rewarded for it.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-center">
              <button onClick={goToYieldPage} className="px-6 py-2 mt-2 rounded-md font-bold modal-action-button">
                Next: BTC Yield Sources
              </button>
            </div>
          </div>
        ) : currentPage === "yield" ? (
          <div className={cn("text-xs space-y-6 font-medium")}>
            <div className="flex justify-between items-center mb-2">
              <button onClick={goToOverviewPage} className="flex items-center text-[#284372] hover:text-blue-700">
                <ArrowLeft className="h-3 w-3 mr-1" /> Back to Overview
              </button>
              <button
                onClick={goToTokensPage}
                className="flex items-center text-[#284372] hover:text-blue-700 font-bold"
              >
                SUBFROST Tokens <ArrowRight className="h-3 w-3 ml-1" />
              </button>
            </div>

            <div>
              <h3 className="font-bold text-sm underline mb-2">Yield in Bitcoin</h3>
              <p className="mb-4">For users, we're essentially a "Bitcoin High-Yield Savings Account":</p>
              <ol className="list-decimal pl-5 space-y-2 mb-4">
                <li>
                  Users stake their BTC with us in the simplest way possible (1 transaction). The user receives dxBTC,
                  which represents their staked BTC.
                </li>
                <li>Their BTC is wrapped into frBTC (trustlessly and atomically), and placed in our yield vault.</li>
                <li>
                  We deploy this frBTC into <u>market-neutral strategies</u> and{" "}
                  <u>over-collateralized lending protocols</u> across Bitcoin L1, earning yield{" "}
                  <u>regardless of BTC price movement</u>.
                </li>
                <li>We pass this yield back to our users in the form of BTC.</li>
                <li>
                  Users unstake their BTC with us in the simplest way possible (1 transaction). The dxBTC leaves their
                  wallet and is replaced with BTC.
                </li>
              </ol>
            </div>

            <div>
              <p className="mb-4">
                FROST stakers (in addition to securing the protocol) vote on which audited platforms we can deploy
                liquidity from our yield vault into.
              </p>
              <p className="mb-4">
                SUBFROST will benefit the entire DeFi ecosystem on Bitcoin L1 while rewarding users with yield in a
                simple and secure way—currently unheard of in the industry.
              </p>
            </div>

            <div>
              <h3 className="font-bold text-sm underline mb-2">Where We Are</h3>
              <p className="mb-4">
                We are built on Alkanes as it is the only programmable metaprotocol (smart contracts) live on Bitcoin
                Layer-1. We are comitted to interoperability and will evaluate and expand onto future programmable
                metaprotocols like BRC2.0, when they are ready for mainnet.
              </p>
            </div>

            <div className="flex justify-center">
              <button onClick={goToTokensPage} className="px-6 py-2 mt-2 rounded-md font-bold modal-action-button">
                Next: SUBFROST Tokens
              </button>
            </div>
          </div>
        ) : currentPage === "tokens" ? (
          <div className={cn("text-xs space-y-6 font-medium")}>
            <div className="flex justify-between items-center mb-2">
              <button onClick={goToYieldPage} className="flex items-center text-[#284372] hover:text-blue-700">
                <ArrowLeft className="h-3 w-3 mr-1" /> Back to Yield
              </button>
              <button
                onClick={goToSecurityPage}
                className="flex items-center text-[#284372] hover:text-blue-700 font-bold"
              >
                Protocol Security <ArrowRight className="h-3 w-3 ml-1" />
              </button>
            </div>

            <div>
              <h3 className="font-bold text-sm underline mb-2">frBTC (not yet released)</h3>
              <p className="mb-4">
                Backed 1:1 with BTC and never leaving the Bitcoin blockchain, frBTC will never lose its peg to BTC.
              </p>
              <p className="mb-4">
                frBTC is DeFi-compatable BTC, enabling users to fundamentally participate in DeFi on L1, namely,
                Alkanes.
              </p>
              <p className="mb-4">
                The reason frBTC is necessary is because native BTC has limited functionality beyond
                sending/receiving/paying network fees with it. Therefore, the ecosystem demands a compatible BTC
                synthetic, similar to WBTC, but with far fewer trust assumptions and never leaving the Bitcoin
                blockchain.
              </p>
              <p className="mb-4">
                <b>Tokenomics</b>: The exact amount of circulating frBTC will always be the exact amount of BTC in
                SUBFROST's reserve.
              </p>
            </div>

            <div>
              <h3 className="font-bold text-sm underline mb-2">dxBTC (not yet released)</h3>
              <p className="mb-4">
                dxBTC is a yield-earning BTC token representing staked BTC in SUBFROST's yield vault. Users maintain
                full exposure to BTC while earning an APY in BTC.
              </p>
              <p className="mb-4">Users can easily unstake this back to BTC directly, in a single transaction.</p>
              <p className="mb-4">
                <b>Tokenomics</b>: The exact amount of circulating dxBTC will always be the exact amount of BTC deployed
                to SUBFROST's yield vault.
              </p>
            </div>

            <div>
              <h3 className="font-bold text-sm underline mb-2">FROST (not yet released)</h3>
              <p className="mb-4">
                The SUBFROST protocol token. All protocol fees are used to buy & burn FROST, driving value to holders by
                increasing demand and decreasing supply.
              </p>
              <p className="mb-4">
                <u>Example to illustrate this process:</u>
              </p>
              <ol className="list-decimal pl-5 space-y-2 mb-4">
                <li>A user/entity wants to wrap 1 BTC to frBTC</li>
                <li>When they do this, they pay a small fee of 0.10%, or 0.001 BTC</li>
                <li>SUBFROST collects this 0.001 BTC fee and automatically buys FROST tokens from the open market</li>
                <li>SUBFROST then burns these FROST tokens</li>
              </ol>
              <p className="mb-4">
                <b>Tokenomics</b>: SUBFROST aims to be a foundational piller of the DeFi ecosystem on Bitcoin L1,
                maximizing value creation for holders and stakers of FROST for as long as Bitcoin miners are mining
                Bitcoin.
              </p>
              <p>Currently, this 1B FROST (expected) is allocated in the following ways:</p>
              <ul className="list-disc pl-5 space-y-2 mb-4">
                <li>15% to investors* (we are raising!)</li>
                <li>
                  85% to team, builder, and community incentive programs; our goal is to maximize alignment between
                  incentives and the best possible long-term outcomes of SUBFROST
                </li>
              </ul>
              <p className="mb-4">*equity converts to FROST, with a lockup/vesting period</p>
            </div>

            <div className="flex justify-center">
              <button onClick={goToSecurityPage} className="px-6 py-2 mt-2 rounded-md font-bold modal-action-button">
                Next: Protocol Security
              </button>
            </div>
          </div>
        ) : (
          <div className={cn("text-xs space-y-6 font-medium")}>
            <div className="flex justify-between items-center mb-2">
              <button onClick={goToTokensPage} className="flex items-center text-[#284372] hover:text-blue-700">
                <ArrowLeft className="h-3 w-3 mr-1" /> Back to Tokens
              </button>
              <button onClick={goToOverviewPage} className="text-[#284372] hover:text-blue-700">
                Back to Overview
              </button>
            </div>

            <div>
              <h3 className="font-bold text-sm underline mb-2">Trustless Wrapping & Unwrapping</h3>
              <p className="mb-4">
                The wrap from BTC to frBTC is atomic, while the unwrap from frBTC to BTC is the most secure and fault
                tolerant cryptographic mechanism ever developed (called SUBRAIL) but is subject to Bitcoin's block
                speed.
              </p>
            </div>

            <div>
              <h3 className="font-bold text-sm underline mb-2">Implementation of F.R.O.S.T. on Bitcoin</h3>
              <p className="mb-4">
                Similar to staking in the most secure of PoS networks, SUBFROST identifies the top 255 stakers as
                potential signers, and then randomly selects 170 of them.
              </p>
              <p className="mb-4">
                This is an implementation of FROST (Flexible Round-Optimized Schnorr Threshold signature scheme) to
                facilitate the trustless federated unwrap, and which we have named our protocol token after.
              </p>
            </div>

            <div>
              <h3 className="font-bold text-sm underline mb-2">Violator's BTC is at Stake</h3>
              <p className="mb-4">
                These stakers are highly incentivized to uphold the tightest security standards, and highly
                disincentivized to operate with anything less than honest behavior, as they are actually staking
                frBTC/FROST LP.
              </p>
              <p className="mb-4">
                This means violations result in the slashing of signer's BTC directly, along with their FROST tokens.
                Violations will range in slashing of 5-100% of the dishonest signers stake.
              </p>
            </div>

            <div className="text-center">
              <a
                href="https://drive.google.com/file/d/1rgDUaGILrsir4tiMgQXytNoUvQq8ySFQ/view"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block px-4 py-2 bg-gray-200 rounded-md text-[#284372] font-bold hover:bg-gray-300 transition-colors"
              >
                Read SUBFROST whitepaper
              </a>
            </div>
          </div>
        )}
      </CustomModal>
    </>
  )
}

export default WhatIsSubfrostModal
