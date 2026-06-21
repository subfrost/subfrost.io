/**
 * Tests for community bridge (lib/community-bridge.ts) — now reads the LOCAL
 * referral graph (lib/referral/codes) instead of calling app.subfrost.io.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/referral/codes', () => ({ lookupByAddress: vi.fn() }));

import { lookupCommunityData } from '@/lib/community-bridge';
import { lookupByAddress } from '@/lib/referral/codes';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('community-bridge', () => {
  it('returns null for empty address without querying', async () => {
    expect(await lookupCommunityData('')).toBeNull();
    expect(lookupByAddress).not.toHaveBeenCalled();
  });

  it('maps a found redemption to CommunityData', async () => {
    vi.mocked(lookupByAddress).mockResolvedValueOnce({
      found: true,
      code: 'ALPHA',
      codeDescription: 'launch',
      parentCode: 'ROOT',
    });
    expect(await lookupCommunityData('bc1pfound')).toEqual({
      found: true,
      code: 'ALPHA',
      codeDescription: 'launch',
      parentCode: 'ROOT',
    });
  });

  it('normalizes null description/parent to undefined', async () => {
    vi.mocked(lookupByAddress).mockResolvedValueOnce({
      found: true,
      code: 'BETA',
      codeDescription: null,
      parentCode: null,
    });
    expect(await lookupCommunityData('bc1pnulls')).toEqual({ found: true, code: 'BETA' });
  });

  it('returns {found:false} when no redemption exists', async () => {
    vi.mocked(lookupByAddress).mockResolvedValueOnce({ found: false });
    expect(await lookupCommunityData('bc1pnone')).toEqual({ found: false });
  });

  it('never throws — returns null on a lookup error', async () => {
    vi.mocked(lookupByAddress).mockRejectedValueOnce(new Error('db down'));
    expect(await lookupCommunityData('bc1perr')).toBeNull();
  });

  it('caches results (second call does not re-query)', async () => {
    vi.mocked(lookupByAddress).mockResolvedValueOnce({ found: true, code: 'GAMMA' });
    await lookupCommunityData('bc1pcache');
    await lookupCommunityData('bc1pcache');
    expect(lookupByAddress).toHaveBeenCalledTimes(1);
  });
});
