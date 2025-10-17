// components/PartnershipsModal.tsx
// This component displays the partnerships modal.

"use client";

import React from 'react';
import CustomModal from './CustomModal';
import PartnershipCard from './PartnershipCard';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface PartnershipsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const partnershipSections = [
  {
    title: 'Alkanes Ecosystem Partners',
    partners: [
      {
        logo: '/Partner Logos/oylcorp.jpeg',
        name: 'OYL Corp',
        description: 'Premier AMM on Alkanes',
        link: 'https://app.oyl.io/portfolio/',
      },
      {
        logo: '/Partner Logos/idclub.png',
        name: 'iDclub',
        description: 'Alkanes Marketplace & Launchpad',
        link: 'https://idclub.io/marketplace',
      },
      {
        logo: '/Partner Logos/satonomylogo.png',
        name: 'Satonomy',
        description: 'UTXO Management Platform',
        link: 'https://app.satonomy.io/',
      },
      {
        logo: '/Partner Logos/ordiscan.jpg',
        name: 'Ordiscan',
        description: 'Bitcoin Metaprotocol Explorer & Tools',
        link: 'https://ordiscan.com/',
      },
      {
        logo: '/Partner Logos/bound money.png',
        name: 'Bound Money',
        description: 'USD Stablecoin (bUSD) on Bitcoin Layer-1',
        link: 'https://bound.money/',
      },
      {
        logo: '/Partner Logos/alkamon.png',
        name: 'Alkamon',
        description: 'First Advanced Game on Bitcoin Layer-1',
        link: 'https://mint.lasereyes.build/alkamon',
      },
      {
        logo: '/Partner Logos/fairmints.svg',
        name: 'Fairmints',
        description: 'Alkanes and Orbitals Marketplace & Tools',
        link: 'https://fairmints.io/',
      },
      {
        logo: '/Partner Logos/pizzadotfun.png',
        name: 'pizza.fun (TBA)',
        description: 'Alkanes Token Launchpad with Gasless Mints',
        link: 'https://x.com/pizzadotfunbtc',
      },
      {
        logo: '/Partner Logos/adorspng.png',
        name: 'ADOR Orbitals',
        description: 'Alkanes ArtFi Platform',
        link: 'https://orbital.adors.org/alkane/wrap-btc',
      },
    ],
  },
  {
    title: 'Ecosystem Expansion Partners (coming soon!)',
    partners: [
      {
        logo: '/Partner Logos/Saturn.svg',
        name: 'Saturn BTC',
        description: 'Premier AMM on Arch Network',
        link: 'https://www.saturnbtc.io/app/swap',
      },
      {
        logo: '/Partner Logos/bestinslot.png',
        name: '[Best in Slot]',
        description: 'Premier DEX on BRC2.0',
        link: 'https://bestinslot.xyz/',
      },
      {
        logo: '/Partner Logos/radfilogo.jpeg',
        name: 'radFi',
        description: 'Runes Marketplace & Mint Platform',
        link: 'https://www.radfi.co/',
      },
      {
        logo: '/Partner Logos/catswap.jpg',
        name: 'CatSwap',
        description: 'Premier AMM on BRC2.0',
        link: 'https://catswap.fun/',
      },
      {
        logo: '/Partner Logos/Yuzo.png',
        name: 'Yuzo',
        description: 'BRC2.0 ₿apps on Bitcoin Layer-1',
        link: 'https://yuzo.xyz/',
      },
    ],
  },
  {
    title: 'Enablement Partners',
    partners: [
      {
        logo: '/Partner Logos/layer1foundation.jpg',
        name: 'Layer 1 Foundation',
        description: 'BRC20 and Metaprotocol Development & Support',
        link: 'https://layer1.foundation/',
      },
      {
        logo: '/Partner Logos/red_lasereyes.png',
        name: 'LaserEyes',
        description: 'Bitcoin Wallet Infrastructure',
        link: 'https://www.lasereyes.build/',
      },
      {
        logo: '/Partner Logos/rebar.jpeg',
        name: 'Rebar Labs',
        description: 'MEV-aware Bitcoin Infrastructure',
        link: 'https://rebarlabs.io/',
      },
      {
        logo: '/Partner Logos/pashov.png',
        name: 'Pashov Audit Group',
        description: 'Initial Technical Audits (TBD) of SUBFROST',
        link: 'https://www.pashov.net/',
      },
    ],
  },
];

const PartnershipsModal: React.FC<PartnershipsModalProps> = ({ isOpen, onClose }) => {
  const subHeaderStyle = { textShadow: "0 0 10px rgba(255, 255, 255, 0.8)" };

  return (
    <CustomModal
      isOpen={isOpen}
      onClose={onClose}
      title="PARTNERSHIPS"
      modalClassName="md:max-w-[35rem] mb-32"
    >
      <div className="space-y-8">
        {partnershipSections.map((section, sectionIndex) => (
          <div key={sectionIndex}>
            {/* 
              * @chadlina_refactor (2025-09-22)
              * - Simplified the rendering logic to remove the nested `subSections` mapping.
              * - The `partnershipSections` data structure was flattened to remove the "Bitcoin DeFi Platforms" category
              *   and elevate its sub-sections to top-level sections, which resolved the TS errors.
              * - Changed h2 to h3 and text-lg to text-sm to reduce header size.
              */}
            {section.title && <h3 className="text-sm font-bold mb-4" style={subHeaderStyle}>{section.title}</h3>}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 justify-center">
              {section.partners && section.partners.map((partner, index) => (
                <PartnershipCard
                  key={index}
                  logo={partner.logo}
                  name={partner.name}
                  description={partner.description}
                  link={partner.link}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="text-center mt-8 text-sm">
        Interested in integrating frBTC?{' '}
        <Popover>
          <PopoverTrigger asChild>
            {/* 
              * @chadlina_bugfix (2025-09-21)
              * - The text color of the "Contact Us" link was changed to blue to match the style of the contact popover in the social icons.
              * - The popover content was also updated to match the social icons' popover style.
              * - The button text was changed to "Contact us" for consistency.
              */}
            <button className="text-[#284372] hover:underline font-bold">Contact us.</button>
          </PopoverTrigger>
          <PopoverContent className="w-auto">
            <div className="flex flex-col gap-2 text-sm">
              <a
                href="mailto:inquiries@subfrost.io"
                className="text-[#284372] hover:underline"
              >
                Email Us
              </a>
              <a
                href="https://x.com/SUBFROSTio/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#284372] hover:underline"
              >
                Message us on X
              </a>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </CustomModal>
  );
};

export default PartnershipsModal;