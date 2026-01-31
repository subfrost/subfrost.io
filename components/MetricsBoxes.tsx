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
// - 2025-10-04 (Chadlina): Made metric value text-shadow responsive: dark blue on small screens, white on medium screens and up.
// - 2025-10-17 (Chadlina): Refactored responsive styles for metric values into globals.css. On small screens, the text is white with a dark blue shadow. On larger screens, the text is dark blue with a white shadow.
// - 2025-10-04 (Chadlina): Made metric value text-shadow responsive: dark blue on small screens, white on medium screens and up.
// - 2025-10-07 (Chadson): Added a toggle switch to display values in BTC or USD.
//   - Fetches BTC price from `/api/btc-price`.
//   - Implements state to manage the selected currency.
//   - Formats USD values with commas and uses "K" for values over 100,000.
// - 2025-10-07 (Chadson): Aligned the BTC/USD toggle to the left of the metrics boxes per user feedback.
// - 2025-10-07 (Chadson): Moved the toggle switch below the metrics boxes, on the same line as the refresh text.
// - 2025-10-07 (Chadson): Swapped the position of the toggle switch and the refresh text.
// - 2025-10-07 (Chadson): Updated toggle/refresh text section to stack vertically in the modal view by conditionally applying flexbox classes based on the `isModal` prop.
// - 2025-10-07 (Chadson): Added links to the contracts popover.
// - 2025-10-17 (Chadlina): Underlined the links in the metrics boxes.
// - 2025-10-17 (Chadlina): Increased the font size of the "Visit Them" link.
// - 2025-10-17 (Chadlina): Adjusted "Visit Them" link font size to match title font size on different screen sizes.

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
import { useMetric } from '@/hooks/use-metric';

interface MetricsBoxesProps {
  onPartnershipsClick: () => void;
  isModal?: boolean;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const LoadingDots = () => (
  <span className="inline-flex">
    <span className="animate-pulse">.</span>
    <span className="animate-pulse" style={{ animationDelay: '0.2s' }}>.</span>
    <span className="animate-pulse" style={{ animationDelay: '0.4s' }}>.</span>
  </span>
);

const MetricsBoxes: React.FC<MetricsBoxesProps> = ({ onPartnershipsClick, isModal }) => {
  const [currency, setCurrency] = useState('BTC');

  const alkanesBtcLocked = useMetric('/api/alkanes-btc-locked', 'btcLocked');
  const brc20BtcLockedValue = useMetric('/api/brc20-btc-locked', 'btcLocked');
  const alkanesCirculatingFrbtc = useMetric('/api/alkanes-circulating', 'circulatingBtc');
  const brc20CirculatingFrbtc = useMetric('/api/brc20-circulating', 'circulatingBtc');
  const alkanesTotalUnwraps = useMetric('/api/alkanes-total-unwraps', 'totalUnwrapsBtc');
  const brc20TotalUnwraps = useMetric('/api/brc20-total-unwraps', 'totalUnwrapsBtc');

  // Fetch addresses from the btc-locked endpoints
  const { data: alkanesBtcLockedData } = useSWR('/api/alkanes-btc-locked', fetcher, {
    refreshInterval: 900000, // 15 minutes
  });
  const { data: brc20BtcLockedData } = useSWR('/api/brc20-btc-locked', fetcher, {
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

  const getDisplayValue = (btcValue: number | string | React.ReactNode): string | React.ReactNode => {
    if (typeof btcValue !== 'number') {
      return btcValue;
    }
    if (currency === 'USD') {
      if (btcPriceError || !btcPriceData) return <LoadingDots />;
      return formatUsd(btcValue * btcPriceData.btcPrice);
    }
    return btcValue >= 10 ? btcValue.toFixed(3) : btcValue.toFixed(4);
  };

  // Address values
  const alkanesAddress = alkanesBtcLockedData?.address ?? '';
  const brc20Address = brc20BtcLockedData?.address ?? '';

  // Helper to shorten address for display
  const shortenAddress = (addr: string) => {
    if (!addr) return '';
    return `${addr.slice(0, 4)}..${addr.slice(-3)}`;
  };

  // BRC2.0 values
  const brc20BtcLocked = typeof brc20BtcLockedValue === 'number' ? brc20BtcLockedValue : 0;
  const brc20Circulating = typeof brc20CirculatingFrbtc === 'number' ? brc20CirculatingFrbtc : 0;

  // Lifetime BTC Tx Value = alkanes unwraps + brc20 unwraps + frbtc issued (alkanes) + frbtc issued (brc20)
  const lifetimeBtcTxValue: number | React.ReactNode = (
    typeof alkanesTotalUnwraps !== 'number' ||
    typeof brc20TotalUnwraps !== 'number' ||
    typeof alkanesCirculatingFrbtc !== 'number' ||
    typeof brc20CirculatingFrbtc !== 'number'
      ? <LoadingDots />
      : alkanesTotalUnwraps + brc20TotalUnwraps + alkanesCirculatingFrbtc + brc20Circulating
  );

  // Combined totals (Alkanes + BRC2.0)
  const combinedFrbtcSupply: number | React.ReactNode = (
    typeof alkanesCirculatingFrbtc !== 'number' || typeof brc20CirculatingFrbtc !== 'number'
      ? <LoadingDots />
      : alkanesCirculatingFrbtc + brc20Circulating
  );
  const combinedBtcLocked: number | React.ReactNode = (
    typeof alkanesBtcLocked !== 'number' || typeof brc20BtcLockedValue !== 'number'
      ? <LoadingDots />
      : alkanesBtcLocked + brc20BtcLocked
  );

  const metrics = [
    {
      title: 'frBTC Supply',
      value: getDisplayValue(combinedFrbtcSupply),
      linkText: 'Breakdown',
      linkType: 'popover',
      popoverContent: (
        <div className="flex flex-col gap-2 text-sm text-[hsl(var(--brand-blue))]">
          <p>Alkanes: {typeof alkanesCirculatingFrbtc === 'number' ? alkanesCirculatingFrbtc.toFixed(5) : '...'} <a href="https://espo.sh/alkane/32:0" target="_blank" rel="noopener noreferrer" className="underline">frBTC</a></p>
          <p>BRC2.0: {brc20Circulating.toFixed(5)} <a href="https://explorer.brc20.build/token/0xdBB5b6A1D422fca2813cF486e5F986ADB09D8337" target="_blank" rel="noopener noreferrer" className="underline">fr-BTC</a></p>
        </div>
      )
    },
    {
      title: 'BTC Locked',
      value: getDisplayValue(combinedBtcLocked),
      linkText: 'Verify',
      linkType: 'popover',
      popoverContent: (
        <div className="flex flex-col gap-2 text-sm text-[hsl(var(--brand-blue))]">
          <p>Alkanes: {typeof alkanesBtcLocked === 'number' ? alkanesBtcLocked.toFixed(5) : '...'} {alkanesAddress && <a href={`https://mempool.space/address/${alkanesAddress}`} target="_blank" rel="noopener noreferrer" className="underline">{shortenAddress(alkanesAddress)}</a>}</p>
          <p>BRC2.0: {brc20BtcLocked.toFixed(5)} {brc20Address && <a href={`https://mempool.space/address/${brc20Address}`} target="_blank" rel="noopener noreferrer" className="underline">{shortenAddress(brc20Address)}</a>}</p>
        </div>
      )
    },
    {
      title: 'Total Tx Value',
      value: getDisplayValue(lifetimeBtcTxValue),
      linkText: 'Breakdown',
      linkType: 'popover',
      popoverContent: (
        <div className="flex flex-col gap-2 text-sm text-[hsl(var(--brand-blue))]">
          <p>Alkanes: {typeof alkanesTotalUnwraps === 'number' && typeof alkanesCirculatingFrbtc === 'number' ? (alkanesTotalUnwraps + alkanesCirculatingFrbtc).toFixed(5) : '...'} <a href="https://espo.sh/alkane/32:0" target="_blank" rel="noopener noreferrer" className="underline">frBTC</a></p>
          <p>BRC2.0: {typeof brc20TotalUnwraps === 'number' && typeof brc20CirculatingFrbtc === 'number' ? (brc20TotalUnwraps + brc20Circulating).toFixed(5) : '...'} <a href="https://explorer.brc20.build/token/0xdBB5b6A1D422fca2813cF486e5F986ADB09D8337" target="_blank" rel="noopener noreferrer" className="underline">fr-BTC</a></p>
        </div>
      )
    },
    {
      title: 'Partnerships',
      value: '20+',
      linkText: 'Visit Them',
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
            <button onClick={onPartnershipsClick} className="text-[hsl(var(--brand-blue))] glowing-button" style={{ fontSize: isModal ? '0.7rem' : '0.6rem' }}>
                {metric.linkText}
            </button>
        )
    }
    // Render an invisible placeholder to maintain consistent height
    return <div className="invisible" aria-hidden="true">{linkElement}</div>;
  };

  return (
    <div className="flex flex-col items-center my-8">
      <div className={`inline-grid ${isModal ? 'gap-6 grid-cols-2' : 'gap-4 grid-cols-2 md:grid-cols-4'}`}>
        {metrics.map((metric, index) => (
          <div 
            key={index} 
            className={`border border-white p-2 text-center bg-transparent aspect-[3/2] flex flex-col justify-between items-center ${isModal ? 'w-[10rem]' : 'w-[7.5rem] md:w-[9rem]'}`}
          >
            <div>
              {metric.superTitle && <p className="text-[hsl(var(--brand-blue))] font-bold" style={{ fontSize: isModal ? '0.7rem' : '0.6rem' }}>{metric.superTitle}</p>}
              <p className="text-[hsl(var(--brand-blue))] font-bold" style={{ fontSize: isModal ? '0.7rem' : '0.6rem' }}>{metric.title}</p>
              <p className="font-bold responsive-shadow" style={{ fontSize: '1.8rem', ...(isModal && { textShadow: '0 0 3px hsl(var(--brand-blue))' }) }}>{metric.value}</p>
            </div>
            <div className="mt-auto">
              {renderLink(metric)}
            </div>
          </div>
        ))}
      </div>
      <div className={`w-full flex items-center mt-4 px-2 gap-2 ${isModal ? 'flex-col justify-center' : 'flex-col md:flex-row justify-center md:justify-between'}`} style={{ maxWidth: isModal ? 'calc(15rem + 1rem)' : 'calc(39rem + 1rem)' }}>
        <div className="relative flex flex-col items-center">
          <div className="flex items-center space-x-2">
            <Label htmlFor="currency-toggle" className="text-[hsl(var(--brand-blue))]">BTC</Label>
            <Switch
              id="currency-toggle"
              checked={currency === 'USD'}
              onCheckedChange={(checked) => setCurrency(checked ? 'USD' : 'BTC')}
            />
            <Label htmlFor="currency-toggle" className="text-[hsl(var(--brand-blue))]">USD</Label>
          </div>
          {currency === 'USD' && (
            <div className="absolute top-full mt-1 text-center text-[hsl(var(--brand-blue))]" style={{ fontSize: isModal ? '0.7rem' : '0.6rem' }}>
              BTC Price: {btcPriceData?.btcPrice ? `$${Math.round(btcPriceData.btcPrice).toLocaleString('en-US')}` : '...'}
            </div>
          )}
        </div>
        <div className={`text-center text-[hsl(var(--brand-blue))] ${isModal ? 'mt-4' : ''}`} style={{ fontSize: isModal ? '0.7rem' : '0.6rem' }}>
          Metrics refresh every 15 minutes.
        </div>
      </div>
    </div>
  );
};

export default MetricsBoxes;