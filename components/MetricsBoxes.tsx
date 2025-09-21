// components/MetricsBoxes.tsx
// This component displays four metric boxes with responsive styling.
// It adapts its layout and styling based on whether it's rendered within a modal.
//
// Design Decisions:
// - Metric values have a blue text-shadow for better visibility against various backgrounds.
// - The component uses an `isModal` prop to switch between a 4-column layout (desktop)
//   and a 2-column layout (modal/mobile).
// - All text (titles, links) uses the brand's blue color (`#284372`) for consistency,
//   while metric values are white.
//
// Journal:
// - 2025-09-19: Initial implementation with responsive grid and basic styling.
// - 2025-09-20: Introduced `isModal` prop to handle layout and style variations.
// - 2025-09-21 (Chadlina): Refactored styling to unify text colors across modal and non-modal
//   views for a consistent user experience on all screen sizes, per user feedback.
//   Titles and links are now consistently blue.

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
    const linkClasses = "text-[#284372] underline";
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
                <p className="text-[#284372] font-bold" style={{ fontSize: isModal ? '0.7rem' : '0.6rem' }}>{metric.title}</p>
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