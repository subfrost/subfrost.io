// components/FrbtcActivityModal.tsx
/*
 * Chadson v69.69
 *
 * This component displays the frBTC Activity modal.
 *
 * This modal displays a list of frBTC wrap and unwrap transactions.
 * It includes a search bar to filter by Taproot address and a filter for activity type.
 * It fetches wrap and unwrap history from the respective API endpoints and includes pagination.
 *
 * 2025-10-16: Corrected API response parsing. The transaction data is in `data.items`.
 * 2025-10-16: Reordered columns to Type, Amount, Address, Tx Hash, Time.
 * 2025-10-16: Added data formatting for amount, address, tx hash, and timestamp.
 * 2025-10-16: Made table background transparent.
 * 2025-10-16: Applied dark blue color to table headers and links.
 * 2025-10-16: Swapped Time and Tx Hash columns.
 * 2025-10-16: Removed "Transaction History" header.
 *
 * Guidelines:
 * - Use responsive design for both desktop and mobile.
 * - Ensure accessibility standards are met.
 * - Component-driven development.
 *
 */
"use client";

import React, { useState, useEffect } from 'react';
import CustomModal from './CustomModal';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";

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
  if (address.length <= 8) return address;
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

  useEffect(() => {
    if (isOpen) {
      fetchTransactions();
    }
  }, [isOpen, page, activityType]);

  const fetchTransactions = async () => {
    setIsLoading(true);
    try {
      const offset = (page - 1) * 25;
      let wrapTxs: Transaction[] = [];
      let unwrapTxs: Transaction[] = [];

      if (activityType === 'Wrap' || activityType === 'Both') {
        const res = await fetch(`/api/wrap-history?count=25&offset=${offset}`);
        const data = await res.json();
        wrapTxs = (Array.isArray(data?.data?.items) ? data.data.items : []).map((tx: any) => ({ ...tx, type: 'Wrap' }));
      }

      if (activityType === 'Unwrap' || activityType === 'Both') {
        const res = await fetch(`/api/unwrap-history?count=25&offset=${offset}`);
        const data = await res.json();
        unwrapTxs = (Array.isArray(data?.data?.items) ? data.data.items : []).map((tx: any) => ({ ...tx, type: 'Unwrap' }));
      }

      const allTxs = [...wrapTxs, ...unwrapTxs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      
      setTransactions(allTxs.slice(0, 25));
      setHasMore(allTxs.length > 0 && allTxs.length === (activityType === 'Both' ? 50 : 25));

    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNextPage = () => {
    setPage(prevPage => prevPage + 1);
  };

  const handlePreviousPage = () => {
    setPage(prevPage => Math.max(prevPage - 1, 1));
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
          <Input
            type="text"
            placeholder="Enter Taproot Address"
            className="pr-10"
          />
          <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
            <Search className="h-5 w-5 text-gray-400" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Activity Type:</span>
          <div className="flex items-center gap-2">
            <Button variant={activityType === 'Wrap' ? 'default' : 'outline'} size="sm" onClick={() => setActivityType('Wrap')}>Wrap</Button>
            <Button variant={activityType === 'Unwrap' ? 'default' : 'outline'} size="sm" onClick={() => setActivityType('Unwrap')}>Unwrap</Button>
            <Button variant={activityType === 'Both' ? 'default' : 'outline'} size="sm" onClick={() => setActivityType('Both')}>Both</Button>
          </div>
        </div>
      </div>
      <div>
        <div className="border rounded-lg p-4">
          {isLoading ? (
            <p className="text-center text-gray-500">Loading...</p>
          ) : transactions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-[#284372] uppercase tracking-wider">Type</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-[#284372] uppercase tracking-wider">Amount</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-[#284372] uppercase tracking-wider">Address</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-[#284372] uppercase tracking-wider">Time</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-[#284372] uppercase tracking-wider">Tx Hash</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {transactions.map((tx) => (
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
        <div className="flex justify-between items-center mt-4">
            <Button onClick={handlePreviousPage} disabled={page === 1 || isLoading}>
              Previous
            </Button>
            <span className="text-sm text-gray-700">Page {page}</span>
            <Button onClick={handleNextPage} disabled={!hasMore || isLoading}>
              Next
            </Button>
        </div>
      </div>
    </CustomModal>
  );
};

export default FrbtcActivityModal;