"use client"

import type React from "react"
import { useState } from "react"
import { cn } from "@/lib/utils"
import CustomModal from "./CustomModal"

const Footer: React.FC = () => {
  const [tosOpen, setTosOpen] = useState(false)
  const [privacyOpen, setPrivacyOpen] = useState(false)

  return (
    <footer
      className={cn(
        "fixed bottom-0 left-0 right-0 md:absolute w-full py-0.75 px-4 text-[0.3rem] sm:text-[0.4rem] md:text-[0.5rem] text-slate-800 flex justify-center md:justify-end items-center space-x-2 bg-transparent z-50 uppercase font-bold",
      )}
    >
      <div className="flex items-center space-x-2 md:pr-8">
        <p>&copy; 2025 SUBZERO RESEARCH INC.</p>
        <button onClick={() => setTosOpen(true)} className="underline hover:text-slate-600 transition-colors font-bold focus:outline-none bg-transparent">
          TERMS OF SERVICE
        </button>
        <button
          onClick={() => setPrivacyOpen(true)}
          className="underline hover:text-slate-600 transition-colors font-bold focus:outline-none bg-transparent"
        >
          PRIVACY POLICY
        </button>
      </div>

      <CustomModal
        isOpen={tosOpen}
        onClose={() => setTosOpen(false)}
        title="TERMS OF SERVICE"
        modalClassName="mb-32"
      >
        <div className={cn("text-xs space-y-6 text-muted-foreground uppercase font-bold")}>
          <p className="text-sm font-bold text-foreground">LAST UPDATED: JANUARY 7, 2025</p>

          <section>
            <h2 className="text-sm font-bold text-foreground mb-2">1. ACCEPTANCE OF TERMS</h2>
            <p>
              BY ACCESSING OR USING SERVICES PROVIDED BY SUBZERO RESEARCH INC. ("WE," "OUR," OR "US"), YOU AGREE TO BE
              BOUND BY THESE TERMS OF SERVICE.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-bold text-foreground mb-2">2. ASSUMPTION OF RISK</h2>
            <p>YOU UNDERSTAND AND AGREE THAT:</p>
            <ul className="list-disc pl-4 mt-2 space-y-2">
              <li>
                THE USE OF OUR SERVICES INVOLVES INHERENT RISKS ASSOCIATED WITH CRYPTOCURRENCY, SMART CONTRACTS, AND
                BLOCKCHAIN TECHNOLOGY.
              </li>
              <li>WE CANNOT GUARANTEE THE SECURITY OF ANY BLOCKCHAIN NETWORK OR SMART CONTRACT.</li>
              <li>YOU ARE SOLELY RESPONSIBLE FOR MAINTAINING THE SECURITY OF YOUR PRIVATE KEYS AND WALLETS.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-sm font-bold text-foreground mb-2">3. DISCLAIMER OF WARRANTIES</h2>
            <p>
              OUR SERVICES ARE PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS OR
              IMPLIED. SUBZERO RESEARCH INC. DISCLAIMS ALL WARRANTIES, INCLUDING BUT NOT LIMITED TO:
            </p>
            <ul className="list-disc pl-4 mt-2 space-y-2">
              <li>MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE</li>
              <li>ACCURACY, RELIABILITY, OR COMPLETENESS OF THE SERVICES</li>
              <li>UNINTERRUPTED OR ERROR-FREE OPERATION</li>
              <li>SECURITY AGAINST UNAUTHORIZED ACCESS</li>
            </ul>
          </section>

          <section>
            <h2 className="text-sm font-bold text-foreground mb-2">4. LIMITATION OF LIABILITY</h2>
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, SUBZERO RESEARCH INC. SHALL NOT BE LIABLE FOR ANY INDIRECT,
              INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF PROFITS, DATA, OR
              CRYPTOCURRENCY ASSETS.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-bold text-foreground mb-2">5. MODIFICATIONS</h2>
            <p>
              WE RESERVE THE RIGHT TO MODIFY OR DISCONTINUE OUR SERVICES AT ANY TIME WITHOUT NOTICE. WE MAY ALSO REVISE
              THESE TERMS OF SERVICE FROM TIME TO TIME.
            </p>
          </section>
        </div>
      </CustomModal>

      <CustomModal
        isOpen={privacyOpen}
        onClose={() => setPrivacyOpen(false)}
        title="PRIVACY POLICY"
        modalClassName="mb-32"
      >
        <div className={cn("text-xs space-y-6 text-muted-foreground uppercase font-bold")}>
          <p className="text-sm font-bold text-foreground">LAST UPDATED: JANUARY 7, 2025</p>

          <section>
            <h2 className="text-sm font-bold text-foreground mb-2">1. INTRODUCTION</h2>
            <p>
              AT SUBZERO RESEARCH INC., WE ARE COMMITTED TO PROTECTING YOUR PRIVACY AND ENSURING THE SECURITY OF ANY
              INFORMATION RELATED TO YOUR USE OF OUR SERVICES.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-bold text-foreground mb-2">2. NO COLLECTION POLICY</h2>
            <p>WE MAINTAIN A STRICT NO-COLLECTION POLICY:</p>
            <ul className="list-disc pl-4 mt-2 space-y-2">
              <li>WE DO NOT COLLECT OR STORE ANY PERSONAL INFORMATION</li>
              <li>WE DO NOT USE COOKIES OR TRACKING TECHNOLOGIES</li>
              <li>WE DO NOT MAINTAIN USER ACCOUNTS OR PROFILES</li>
              <li>WE DO not TRACK OR STORE TRANSACTION DATA</li>
            </ul>
          </section>

          <section>
            <h2 className="text-sm font-bold text-foreground mb-2">3. BLOCKCHAIN DATA</h2>
            <p>
              PLEASE BE AWARE THAT WHILE WE DO NOT COLLECT DATA, ANY TRANSACTIONS YOU MAKE ON THE BLOCKCHAIN ARE
              PUBLICLY VISIBLE AS PART OF THE BLOCKCHAIN'S INHERENT TRANSPARENCY.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-bold text-foreground mb-2">4. THIRD-PARTY SERVICES</h2>
            <p>
              OUR SERVICES MAY INTERACT WITH THIRD-PARTY BLOCKCHAIN NETWORKS AND PROTOCOLS. WE DO NOT CONTROL AND ARE
              NOT RESPONSIBLE FOR ANY INFORMATION THAT MAY BE COLLECTED BY THESE THIRD PARTIES.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-bold text-foreground mb-2">5. CONTACT</h2>
            <p>
              FOR PRIVACY-RELATED INQUIRIES, YOU MAY CONTACT US THROUGH OUR OFFICIAL COMMUNICATION CHANNELS WHILE
              MAINTAINING YOUR ANONYMITY.
            </p>
          </section>
        </div>
      </CustomModal>
    </footer>
  )
}

export default Footer
