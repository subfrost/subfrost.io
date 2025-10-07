// components/MetricsBoxes.tsx
// This component displays four metric boxes with responsive styling.
// It adapts its layout and styling based on whether it's rendered within a modal.
//
// Design Decisions:
// - Metric values have a responsive text-shadow for better visibility against various backgrounds.
// - The component uses an `isModal` prop to switch between a 4-column layout (desktop)
//   and a 2-column layout (modal/mobile).
// - All text (titles, links, and values) uses the brand's blue color (`--brand-blue`) for consistency on larger screens.
// - On smaller screens, metric values are white for better contrast.
//
// Journal:
// - 2025-09-19: Initial implementation with responsive grid and basic styling.
// - 2025-09-20: Introduced `isModal` prop to handle layout and style variations.
// - 2025-09-21 (Chadlina): Refactored styling to unify text colors across modal and non-modal
//   views for a consistent user experience on all screen sizes, per user feedback.
//   Titles and links are now consistently blue.
// - 2025-09-23 (Chadson): Integrated SWR to fetch "BTC Locked" data from the API.
//   The value now updates automatically every 15 minutes.
// - 2025-09-25 (Chadson): Reduced padding from `p-4` to `p-2` to prevent title text from wrapping on smaller screens.
// - 2025-09-25 (Chadson): Added a note below the metrics boxes indicating that the data is refreshed every 15 minutes and corrected the layout.
// - 2025-10-02 (Chadlina): Added `superTitle` to metrics to display labels like "Current" and "Lifetime" above metric titles.
// - 2025-10-04 (Chadson): Changed the metric value color to be the same as the titles (`--brand-blue`).
// - 2025-10-04 (Chadson): Changed the metric value text-shadow to white.
// - 2025-10-04 (Chadlina): Made metric value text-shadow responsive: light blue on small screens, white on medium screens and up.
// - 2025-10-04 (Chadlina): Made metric value color responsive: white on small screens, brand-blue on medium screens and up.
// - 2025-10-04 (Chadlina): Made metric value text-shadow responsive: dark blue on small screens, white on medium screens and up.
// - 2025-10-07 (Chadson): Added a toggle switch to display values in BTC or USD.
//   - Fetches BTC price from `/api/btc-price`.
//   - Implements state to manage the selected currency.
//   - Formats USD values with commas and uses "K" for values over 100,000.
// - 2025-10-07 (Chadson): Aligned the BTC/USD toggle to the left of the metrics boxes per user feedback.
// - 2025-10-07 (Chadson): Moved the toggle switch below the metrics boxes, on the same line as the refresh text.
// - 2025-10-07 (Chadson): Swapped the position of the toggle switch and the refresh text.

"use client";

import React, { useState } from 'react';
import useSWR from 'swr';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface MetricsBoxesProps {
  onPartnershipsClick: () => void;
  isModal?: boolean;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const MetricsBoxes: React.FC<MetricsBoxesProps> = ({ onPartnershipsClick, isModal }) => {
  const [currency, setCurrency] = useState('BTC');

  const { data: btcData, error: btcError } = useSWR('/api/btc-locked', fetcher, {
    refreshInterval: 900000, // 15 minutes
  });
  const { data: frBtcData, error: frBtcError } = useSWR('/api/frbtc-issued', fetcher, {
    refreshInterval: 900000, // 15 minutes
  });
  const { data: totalUnwrapsData, error: totalUnwrapsError } = useSWR('/api/total-unwraps', fetcher, {
    refreshInterval: 900000, // 15 minutes
  });
  const { data: btcPriceData, error: btcPriceError } = useSWR('/api/btc-price', fetcher, {
    refreshInterval: 900000, // 15 minutes
  });

  const formatUsd = (value: number) => {
    if (value >= 100000) {
      return `$${(value / 1000).toFixed(1)}K`;
    }
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  const getDisplayValue = (btcValue: number | string) => {
    if (typeof btcValue !== 'number') return btcValue;
    if (currency === 'USD') {
      if (btcPriceError || !btcPriceData) return '...';
      return formatUsd(btcValue * btcPriceData.btcPrice);
    }
    return btcValue.toFixed(5);
  };

  const btcLockedValue = btcError ? 'Error' : !btcData ? '...' : btcData.btcLocked;
  const frBtcIssuedValue = frBtcError ? 'Error' : !frBtcData ? '...' : frBtcData.frBtcIssued;
  const totalUnwrapsValue = totalUnwrapsError ? 'Error' : !totalUnwrapsData || totalUnwrapsData.totalUnwraps === undefined ? '...' : (Number(totalUnwrapsData.totalUnwraps) / 1e8);

  const lifetimeBtcTxValue = (
    frBtcError || totalUnwrapsError ? 'Error' :
    !frBtcData || !totalUnwrapsData || totalUnwrapsData.totalUnwraps === undefined ? '...' :
    (frBtcData.frBtcIssued + (Number(totalUnwrapsData.totalUnwraps) / 1e8))
  );

  const metrics = [
    { 
      superTitle: 'Current',
      title: 'frBTC Supply', 
      value: getDisplayValue(frBtcIssuedValue), 
      linkText: 'Contracts', 
      linkType: 'popover',
      popoverContent: (
        <div className="flex flex-col gap-2 text-sm text-[hsl(var(--brand-blue))]">
          <p>Alkanes: frBTC [32, 0]</p>
          <p>BRC2.0: fr-BTC (6-byte)</p>
        </div>
      )
    },
    { 
      superTitle: 'Current',
      title: 'BTC Locked', 
      value: getDisplayValue(btcLockedValue), 
      linkText: 'Verify', 
      linkType: 'popover',
      popoverContent: (
        <div className="flex flex-col gap-2 text-sm text-[hsl(var(--brand-blue))]">
          <p>Alkanes: <a href="https://mempool.space/address/bc1p5lushqjk7kxpqa87ppwn0dealucyqa6t40ppdkhpqm3grcpqvw9s3wdsx7" target="_blank" rel="noopener noreferrer" className="underline">bc1p..sx7</a></p>
          <p>BRC2.0: TBD</p>
        </div>
      )
    },
    { superTitle: 'Lifetime', title: 'BTC Tx Value', value: getDisplayValue(lifetimeBtcTxValue) },
    { 
      superTitle: 'Early',
      title: 'Partnerships', 
      value: '17', 
      linkText: 'Who Are They?',
      linkType: 'modal' 
    },
  ];

  const renderLink = (metric: any) => {
    const linkClasses = "text-[hsl(var(--brand-blue))] underline";
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
    <div className="flex flex-col items-center my-8">
      <div className={`inline-grid gap-4 ${isModal ? 'grid-cols-2' : 'grid-cols-2 md:grid-cols-4'}`}>
        {metrics.map((metric, index) => (
          <div 
            key={index} 
            className="border border-white p-2 text-center bg-transparent aspect-[3/2] flex flex-col justify-between items-center w-[7.5rem] md:w-[9rem]"
          >
            <div>
              {metric.superTitle && <p className="text-[hsl(var(--brand-blue))] font-bold" style={{ fontSize: isModal ? '0.7rem' : '0.6rem' }}>{metric.superTitle}</p>}
              <p className="text-[hsl(var(--brand-blue))] font-bold" style={{ fontSize: isModal ? '0.7rem' : '0.6rem' }}>{metric.title}</p>
              <p className="font-bold text-white md:text-[hsl(var(--brand-blue))] responsive-shadow" style={{ fontSize: '1.8rem' }}>{metric.value}</p>
            </div>
            <div className="mt-auto">
              {renderLink(metric)}
            </div>
          </div>
        ))}
      </div>
      <div className="w-full flex justify-between items-center mt-4 px-2" style={{ maxWidth: isModal ? 'calc(15rem + 1rem)' : 'calc(39rem + 1rem)' }}>
        <div className="flex items-center space-x-2">
          <Label htmlFor="currency-toggle" className="text-[hsl(var(--brand-blue))]">BTC</Label>
          <Switch
            id="currency-toggle"
            checked={currency === 'USD'}
            onCheckedChange={(checked) => setCurrency(checked ? 'USD' : 'BTC')}
          />
          <Label htmlFor="currency-toggle" className="text-[hsl(var(--brand-blue))]">USD</Label>
        </div>
        <div className="text-center text-[hsl(var(--brand-blue))]" style={{ fontSize: isModal ? '0.7rem' : '0.6rem' }}>
          Metrics refresh every 15 minutes.
        </div>
      </div>
    </div>
  );
};

export default MetricsBoxes;