// components/MetricsBoxes.tsx
// This component will display the four metric boxes as requested.
// It will be styled with Tailwind CSS to be responsive and match the ActionButtons component.

"use client";

import React, { useState } from 'react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import DevelopmentModal from "@/components/DevelopmentModal";

const metrics = [
  { 
    title: 'frBTC Issued', 
    value: '0.000', 
    linkText: 'Contracts', 
    linkType: 'popover',
    popoverContent: (
      <div className="flex flex-col gap-2 text-sm text-[#284372]">
        <p>Alkanes: Link TBD</p>
        <p>BRC2.0: Link TBD</p>
      </div>
    )
  },
  { 
    title: 'BTC Locked', 
    value: '0.000', 
    linkText: 'Verify', 
    linkType: 'popover',
    popoverContent: (
      <div className="flex flex-col gap-2 text-sm text-[#284372]">
        <p>Alkanes: Link TBD</p>
      </div>
    )
  },
  { title: 'Lifetime Volume', value: '0.000' },
  { 
    title: 'Partnerships', 
    value: '16', 
    linkText: 'Who Are They?',
    linkType: 'modal' 
  },
];

const MetricsBoxes = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalContent, setModalContent] = useState({ title: "", body: "" });

  const handleOpenModal = (title: string, body: string) => {
    setModalContent({ title, body });
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  const renderLink = (metric: any) => {
    const linkElement = (
      <button className="text-[#284372] underline" style={{ fontSize: '0.6rem' }}>
        {metric.linkText || ''}
      </button>
    );

    if (metric.linkType === 'popover') {
      return (
        <Popover>
          <PopoverTrigger asChild>
            {linkElement}
          </PopoverTrigger>
          <PopoverContent className="w-auto">
            {metric.popoverContent}
          </PopoverContent>
        </Popover>
      );
    }
    if (metric.linkType === 'modal') {
        return (
            <button onClick={() => handleOpenModal(metric.title, "This feature is under development.")} className="text-[#284372] underline" style={{ fontSize: '0.6rem' }}>
                {metric.linkText}
            </button>
        )
    }
    // Render an invisible placeholder to maintain consistent height
    return <div className="invisible" aria-hidden="true">{linkElement}</div>;
  };

  return (
    <>
      <div className="flex justify-center my-8">
        <div className="inline-grid grid-cols-2 md:grid-cols-4 gap-4">
          {metrics.map((metric, index) => (
            <div 
              key={index} 
              className="border border-white p-4 text-center bg-transparent aspect-[3/2] flex flex-col justify-between items-center w-[6.75rem] sm:w-[7.5rem] md:w-[9rem]"
            >
              <div>
                <p className="text-[#284372]" style={{ fontSize: '0.6rem' }}>{metric.title}</p>
                <p className="font-bold text-white" style={{ fontSize: '1.8rem', textShadow: '0 0 5px rgba(255,255,255,0.5)' }}>{metric.value}</p>
              </div>
              <div className="mt-auto">
                {renderLink(metric)}
              </div>
            </div>
          ))}
        </div>
      </div>
      <DevelopmentModal 
        isOpen={isModalOpen} 
        onClose={handleCloseModal} 
        onConfirm={handleCloseModal}
        title={modalContent.title}
        body={<p>{modalContent.body}</p>}
      />
    </>
  );
};

export default MetricsBoxes;