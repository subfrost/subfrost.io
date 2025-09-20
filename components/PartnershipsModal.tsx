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
    title: 'Bitcoin DeFi Platforms',
    subSections: [
      {
        title: 'Focus on Alkanes',
        partners: [
          {
            logo: '/Partner Logos/oyl.jpg',
            name: 'OYL',
            description: 'Premier AMM on Alkanes',
            link: 'https://app.oyl.io/portfolio/',
          },
          {
            logo: '/Partner Logos/idclub.png',
            name: 'iDClub',
            description: 'Alkanes Marketplace & Launchpad',
            link: 'https://idclub.io/marketplace',
          },
          {
            logo: '/Partner Logos/alkamon.jpg',
            name: 'Alkamon',
            description: 'First Game on Bitcoin L1 from Alkamist Team',
            link: '#',
          },
          {
            logo: '/Partner Logos/satonomy.png',
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
            logo: '/Partner Logos/fairmintssvg.svg',
            name: 'Fairmints',
            description: 'Alkanes and Counterparty Marketplace & Tools',
            link: 'https://fairmints.io/',
          },
        ],
      },
      {
        title: 'Focus Outside of Alkanes (not yet available)',
        partners: [
          {
            logo: '/Partner Logos/saturn.jpg',
            name: 'Saturn BTC',
            description: 'Premier AMM on Arch Network',
            link: 'https://www.saturnbtc.io/app/swap',
          },
          {
            logo: '/Partner Logos/best in slot.jpg',
            name: '[Best in Slot]',
            description: 'Premier DEX on BRC2.0',
            link: 'https://bestinslot.xyz/',
          },
          {
            logo: '/Partner Logos/radfi.png',
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
        ],
      },
    ],
  },
  {
    title: 'Enablement',
    partners: [
      {
        logo: '/Partner Logos/bound money.png',
        name: 'Bound Money (bUSD)',
        description: 'USD stablecoin on Bitcoin Layer 1',
        link: 'https://bound.money/',
      },
      {
        logo: '/Partner Logos/layer1foundation.jpg',
        name: 'Layer 1 Foundation',
        description: 'BRC20 and Metaprotocol Development & Support',
        link: 'https://layer1.foundation/',
      },
      {
        logo: '/Partner Logos/lasereyes.png',
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
        description: 'Initial Technical Audits of SUBFROST',
        link: 'https://www.pashov.net/',
      },
    ],
  },
];

const PartnershipsModal: React.FC<PartnershipsModalProps> = ({ isOpen, onClose }) => {
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
            {section.title && <h2 className="text-lg font-bold text-[#284372] mb-4">{section.title}</h2>}
            {section.subSections ? (
              section.subSections.map((subSection, subIndex) => (
                <div key={subIndex} className="mb-8">
                  {subSection.title && <h3 className="text-md font-bold text-[#284372] mb-4">{subSection.title}</h3>}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 justify-center">
                    {subSection.partners.map((partner, index) => (
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
              ))
            ) : (
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
            )}
          </div>
        ))}
      </div>
      <div className="text-center mt-8 text-sm text-gray-500">
        Interested in integrating frBTC?{' '}
        <Popover>
          <PopoverTrigger asChild>
            <button className="text-[#284372] hover:underline font-bold">Contact Us!</button>
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