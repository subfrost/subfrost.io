
// hooks/use-focus.ts
// SWR hook that polls the focus API endpoint for viewer-side layout.
//
// Journal:
// - 2026-02-28 (Claude): Created for focus-aware viewer layout.

import useSWR from 'swr';
import type { FocusState } from '@/lib/stream-types';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const DEFAULT_FOCUS: FocusState = { target: 'none', autofocus: false };

export function useFocus() {
  const { data } = useSWR<FocusState>('/api/stream/focus', fetcher, {
    refreshInterval: 2_000,
    fallbackData: DEFAULT_FOCUS,
  });

  return data ?? DEFAULT_FOCUS;
}
