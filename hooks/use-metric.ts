
// hooks/use-metric.ts
// This custom hook fetches metric data using SWR and handles loading/error states.
//
// Design Decisions:
// - On initial load, it returns "..." until data is fetched.
// - If a subsequent fetch fails, it returns the last successfully fetched value.
// - This prevents displaying "Error" and provides a smoother user experience.
//
// Journal:
// - 2025-10-09 (Gemini): Created this hook to abstract metric fetching logic
//   and implement the desired loading/error handling behavior.

import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export const useMetric = (
  apiEndpoint: string,
  dataKey: string,
  transform?: (value: any) => any
) => {
  const { data, error } = useSWR(apiEndpoint, fetcher, {
    refreshInterval: 900000, // 15 minutes
  });

  const processData = (d: any) => {
    if (!d) return undefined;
    const value = d[dataKey];
    if (transform && value !== undefined) {
      return transform(value);
    }
    return value;
  };

  if (error) {
    if (data) {
      return processData(data); // Return stale data if available
    }
    return '...'; // Return '...' on initial error
  }

  if (!data) {
    return '...'; // Return '...' while loading
  }

  return processData(data);
};
