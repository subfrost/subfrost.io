// components/FrbtcActivityModal.tsx
/*
 * Chadlina v69.69
 *
 * This component displays the frBTC Activity modal.
 *
 * This modal displays a list of frBTC wrap and unwrap transactions.
 * It includes a search bar to filter by Taproot address and a filter for activity type.
 * It fetches wrap and unwrap history from the respective API endpoints and includes pagination.
 * It also allows for client-side sorting of the 'Amount' and 'Time' columns.
 *
 * 2025-10-16: Corrected API response parsing. The transaction data is in `data.items`.
 * 2025-10-16: Reordered columns to Type, Amount, Address, Tx Hash, Time.
 * 2025-10-16: Added data formatting for amount, address, tx hash, and timestamp.
 * 2025-10-16: Made table background transparent.
 * 2025-10-16: Applied dark blue color to table headers and links.
 * 2025-10-16: Swapped Time and Tx Hash columns.
 * 2025-10-16: Removed "Transaction History" header.
 * 2025-10-16: Added client-side filtering for Taproot address.
 * 2025-10-16: Fixed pagination bug where it would stop prematurely.
 * 2025-10-16: Added defensive check to handle null addresses from the API.
 * 2025-10-16: Reset pagination to page 1 when activity type changes.
 * 2025-10-16: Display current page number above the table.
 * 2025-10-16: Added lightweight pagination controls next to the page number.
 * 2025-10-16: Implemented client-side sorting for Amount and Time columns.
 * 2025-10-16: Formatted sortable headers to be uppercase.
 *
 * Guidelines:
 * - Use responsive design for both desktop and mobile.
 * - Ensure accessibility standards are met.
 * - Component-driven development.
 *
 */
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import CustomModal from './CustomModal';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X, ChevronLeft, ChevronRight, ChevronsUpDown, ChevronUp, ChevronDown } from "lucide-react";

type SortKey = 'amount' | 'timestamp';
type SortDirection = 'asc' | 'desc';

interface FrbtcActivityModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Transaction {
  transactionId: string;
  address: string;
  amount: string;
  timestamp: string;
  type: 'Wrap' | 'Unwrap';
}

const formatAddress = (address: string) => {
  if (typeof address !== 'string' || address.length <= 8) return address || '';
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
};

const formatTxHash = (hash: string) => {
  if (hash.length <= 6) return hash;
  return `${hash.slice(0, 2)}...${hash.slice(-3)}`;
};

const formatTimestamp = (timestamp: string) => {
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', {
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

const FrbtcActivityModal: React.FC<FrbtcActivityModalProps> = ({ isOpen, onClose }) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [activityType, setActivityType] = useState<'Wrap' | 'Unwrap' | 'Both'>('Both');
  const [searchAddress, setSearchAddress] = useState('');
  const [submittedSearchAddress, setSubmittedSearchAddress] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('timestamp');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  useEffect(() => {
    if (isOpen) {
      fetchTransactions(submittedSearchAddress);
    }
  }, [isOpen, page, activityType, submittedSearchAddress]);

  useEffect(() => {
    setPage(1);
  }, [activityType, submittedSearchAddress]);

  const fetchTransactions = async (address = submittedSearchAddress) => {
    setIsLoading(true);
    try {
      const offset = (page - 1) * 25;
      let wrapTxs: Transaction[] = [];
      let unwrapTxs: Transaction[] = [];
      let hasMoreWraps = false;
      let hasMoreUnwraps = false;

      const fetchOptions = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      };

      if (activityType === 'Wrap' || activityType === 'Both') {
        const url = address ? `/api/get-address-wrap-history?count=25&offset=${offset}` : `/api/wrap-history?count=25&offset=${offset}`;
        const res = await fetch(url, address ? fetchOptions : {});
        const data = await res.json();
        wrapTxs = (Array.isArray(data?.data?.items) ? data.data.items : []).map((tx: any) => ({ ...tx, type: 'Wrap' }));
        hasMoreWraps = wrapTxs.length === 25;
      }

      if (activityType === 'Unwrap' || activityType === 'Both') {
        const url = address ? `/api/get-address-unwrap-history?count=25&offset=${offset}` : `/api/unwrap-history?count=25&offset=${offset}`;
        const res = await fetch(url, address ? fetchOptions : {});
        const data = await res.json();
        unwrapTxs = (Array.isArray(data?.data?.items) ? data.data.items : []).map((tx: any) => ({ ...tx, type: 'Unwrap' }));
        hasMoreUnwraps = unwrapTxs.length === 25;
      }

      const allTxs = [...wrapTxs, ...unwrapTxs];
      setTransactions(allTxs);

      if (activityType === 'Both') {
        setHasMore(hasMoreWraps || hasMoreUnwraps);
      } else if (activityType === 'Wrap') {
        setHasMore(hasMoreWraps);
      } else {
        setHasMore(hasMoreUnwraps);
      }

    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = () => {
    setSubmittedSearchAddress(searchAddress);
  };

  const handleClearSearch = () => {
    setSearchAddress('');
    setSubmittedSearchAddress('');
  };

  const handleNextPage = () => {
    setPage(prevPage => prevPage + 1);
  };

  const handlePreviousPage = () => {
    setPage(prevPage => Math.max(prevPage - 1, 1));
  };

  const handleActivityTypeChange = (type: 'Wrap' | 'Unwrap' | 'Both') => {
    setActivityType(type);
    setPage(1);
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('desc');
    }
  };

  const sortedTransactions = useMemo(() => {
    const processedTransactions = [...transactions];

    processedTransactions.sort((a, b) => {
      if (sortKey === 'amount') {
        const amountA = parseFloat(a.amount);
        const amountB = parseFloat(b.amount);
        return sortDirection === 'asc' ? amountA - amountB : amountB - amountA;
      }
      if (sortKey === 'timestamp') {
        const timeA = new Date(a.timestamp).getTime();
        const timeB = new Date(b.timestamp).getTime();
        return sortDirection === 'asc' ? timeA - timeB : timeB - timeA;
      }
      return 0;
    });

    return processedTransactions;
  }, [transactions, sortKey, sortDirection]);

  const SortableHeader = ({ columnKey, title }: { columnKey: SortKey, title: string }) => {
    const isCurrentKey = sortKey === columnKey;
    const Icon = isCurrentKey ? (sortDirection === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown;
    return (
      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-[#284372] uppercase tracking-wider">
        <button className="flex items-center gap-1 uppercase" onClick={() => handleSort(columnKey)}>
          {title}
          <Icon className="h-4 w-4" />
        </button>
      </th>
    );
  };

  return (
    <CustomModal
      isOpen={isOpen}
      onClose={onClose}
      title="frBTC ACTIVITY"
      modalClassName="md:max-w-4xl mb-32"
    >
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div className="relative w-full md:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <Input
            type="text"
            placeholder="Enter Taproot Address"
            className="pl-10 pr-16"
            value={searchAddress}
            onChange={(e) => setSearchAddress(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <div className="absolute inset-y-0 right-0 flex items-center">
            {searchAddress && (
              <Button onClick={handleClearSearch} variant="ghost" size="icon" className="h-8 w-8">
                <X className="h-5 w-5 text-gray-400" />
              </Button>
            )}
            <Button onClick={handleSearch} variant="ghost" size="icon" className="h-8 w-8">
              <Search className="h-5 w-5 text-gray-400" />
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <Button variant={activityType === 'Both' ? 'default' : 'outline'} size="sm" onClick={() => handleActivityTypeChange('Both')}>All</Button>
            <Button variant={activityType === 'Wrap' ? 'default' : 'outline'} size="sm" onClick={() => handleActivityTypeChange('Wrap')}>Wrap</Button>
            <Button variant={activityType === 'Unwrap' ? 'default' : 'outline'} size="sm" onClick={() => handleActivityTypeChange('Unwrap')}>Unwrap</Button>
          </div>
        </div>
      </div>
      <div>
        <div className="flex justify-end items-center gap-2 mb-2">
            <Button variant="ghost" size="icon" onClick={handlePreviousPage} disabled={page === 1 || isLoading} className="h-6 w-6">
              <ChevronLeft className="h-4 w-4 text-gray-500" />
            </Button>
            <span className="text-sm text-gray-700">Page {page}</span>
            <Button variant="ghost" size="icon" onClick={handleNextPage} disabled={!hasMore || isLoading} className="h-6 w-6">
              <ChevronRight className="h-4 w-4 text-gray-500" />
            </Button>
        </div>
        <div className="border rounded-lg p-4">
          {isLoading ? (
            <p className="text-center text-gray-500">Loading...</p>
          ) : sortedTransactions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-[#284372] uppercase tracking-wider">Type</th>
                    <SortableHeader columnKey="amount" title="Amount" />
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-[#284372] uppercase tracking-wider">Address</th>
                    <SortableHeader columnKey="timestamp" title="Time" />
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-[#284372] uppercase tracking-wider">Tx Hash</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {sortedTransactions.map((tx) => (
                    <tr key={tx.transactionId}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-[#284372]">{tx.type}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{parseFloat(tx.amount) / 1e8}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 truncate max-w-xs">
                        <a href={`https://ordiscan.com/address/${tx.address}`} target="_blank" rel="noopener noreferrer" className="text-[#284372] hover:underline">
                          {formatAddress(tx.address)}
                        </a>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatTimestamp(tx.timestamp)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 truncate max-w-xs">
                        <a href={`https://ordiscan.com/tx/${tx.transactionId}`} target="_blank" rel="noopener noreferrer" className="text-[#284372] hover:underline">
                          {formatTxHash(tx.transactionId)}
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-center text-gray-500">No transactions found.</p>
          )}
        </div>
      </div>
    </CustomModal>
  );
};

export default FrbtcActivityModal;