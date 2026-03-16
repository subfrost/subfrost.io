/**
 * Tests for community bridge (lib/community-bridge.ts)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { lookupCommunityData } from '@/lib/community-bridge';

describe('community-bridge', () => {
  it('returns null for empty address', async () => {
    const result = await lookupCommunityData('');
    expect(result).toBeNull();
  });
});
