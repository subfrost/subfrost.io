// components/MetricsBoxes.tsx
// This component will display the four metric boxes as requested.
// It will be styled with Tailwind CSS to be responsive and match the ActionButtons component.
// 2025-09-19: Adjusted text-shadow on metric values for better visibility, now using a blue tint.
// 2025-09-20: Added `isModal` prop to adjust grid layout and text color when rendered inside a modal.
// 2025-09-20: Increased title font size and changed link color to white in modal view.
// 2025-09-20: Made metric titles bold.

"use client";

import React from 'react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface MetricsBoxesProps {
  onPartnershipsClick: () => void;
  isModal?: boolean;
}

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

const MetricsBoxes: React.FC<MetricsBoxesProps> = ({ onPartnershipsClick, isModal }) => {
  const renderLink = (metric: any) => {
    const linkClasses = isModal ? "text-white underline" : "text-[#284372] underline";
    const linkStyle = { fontSize: isModal ? '0.7rem' : '0.6rem' };

    const linkElement = (
      <button className={linkClasses} style={linkStyle}>
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
            <button onClick={onPartnershipsClick} className={linkClasses} style={linkStyle}>
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
        <div className={`inline-grid gap-4 ${isModal ? 'grid-cols-2' : 'grid-cols-2 md:grid-cols-4'}`}>
          {metrics.map((metric, index) => (
            <div 
              key={index} 
              className="border border-white p-4 text-center bg-transparent aspect-[3/2] flex flex-col justify-between items-center w-[7.5rem] md:w-[9rem]"
            >
              <div>
                <p className={`${isModal ? "text-white" : "text-[#284372]"} font-bold`} style={{ fontSize: isModal ? '0.7rem' : '0.6rem' }}>{metric.title}</p>
                <p className="font-bold text-white" style={{ fontSize: '1.8rem', textShadow: '0 0 10px rgba(190, 227, 248, 0.8)' }}>{metric.value}</p>
              </div>
              <div className="mt-auto">
                {renderLink(metric)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

export default MetricsBoxes;