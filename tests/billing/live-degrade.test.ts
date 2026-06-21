import { describe, it, expect, vi } from 'vitest';
import { degradeIfUnavailable } from '@/lib/stripe/source/live/degrade';

describe('degradeIfUnavailable', () => {
  it('returns the fn result on success', async () => {
    expect(await degradeIfUnavailable(async () => [1, 2], [])).toEqual([1, 2]);
  });
  it('returns the fallback when fn throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await degradeIfUnavailable(async () => { throw new Error('issuing not enabled'); }, [] as number[]);
    expect(r).toEqual([]);
  });
});
