// components/PartnershipCard.tsx
// This component displays a single partner card.

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
      className="border border-[#284372] p-4 text-center bg-transparent aspect-[3/2] flex flex-col justify-between items-center w-full relative group"
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