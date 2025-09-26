// components/PartnershipCard.tsx
// This component displays a single partner card.
//
// Prompt: My goal is to soften the edges of the partnershipscards in the partnershipsmodal. Please change the color of the boarder from blue to white and give the background a white outer shadow.
//
// Changes (2025-09-20):
// - Changed border color from custom blue (#284372) to white.
// - Added a white outer shadow using a custom Tailwind CSS shadow utility to create a "soft edge" effect.
// - Reduced horizontal padding from p-4 to px-2 to give the description more space.

import React from 'react';
import Image from 'next/image';
import { ArrowUpRight } from 'lucide-react';

interface PartnershipCardProps {
  logo: string;
  name: string;
  description: string;
  link: string;
}

const PartnershipCard: React.FC<PartnershipCardProps> = ({ logo, name, description, link }) => {
  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      className="border border-white px-2 py-4 text-center bg-white aspect-[3/2] flex flex-col justify-between items-center w-full relative group shadow-[0_0_10px_rgba(255,255,255,0.8)]"
    >
      <ArrowUpRight
        size={16}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-[#284372]"
      />
      <div className="w-full flex-grow flex items-center justify-center">
        <Image src={logo} alt={`${name} logo`} width={64} height={64} className="w-16 h-16 object-contain" />
      </div>
      <div className="w-full text-center h-10 flex items-center justify-center">
        <p className="font-bold text-[#284372]" style={{ fontSize: '0.9rem' }}>{name}</p>
      </div>
      <div className="w-full text-center h-10 flex items-start justify-center">
        <p className="text-gray-500 overflow-hidden text-ellipsis" style={{ fontSize: '0.7rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{description}</p>
      </div>
    </a>
  );
};

export default PartnershipCard;