import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma (named + default export, matching @/lib/prisma) and the cache.
vi.mock('@/lib/prisma', () => {
  const fuelAllocation = { findUnique: vi.fn() };
  const client = { fuelAllocation };
  return { prisma: client, default: client };
});
vi.mock('@/lib/redis', () => ({
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
  cacheDel: vi.fn(),
}));

import { NextRequest } from 'next/server';
import { GET as fuelGET } from '@/app/api/fuel/route';
import prisma from '@/lib/prisma';
import { cacheGet, cacheSet } from '@/lib/redis';

const KEY = 'test-fuel-key';
const fa = (prisma as unknown as { fuelAllocation: { findUnique: ReturnType<typeof vi.fn> } })
  .fuelAllocation;

function getReq(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(`https://subfrost.io${path}`, { method: 'GET', headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.FUEL_API_KEY = KEY;
  vi.mocked(cacheGet).mockResolvedValue(null);
  vi.mocked(cacheSet).mockResolvedValue(undefined);
});

describe('GET /api/fuel', () => {
  it('rejects requests without an x-api-key (401)', async () => {
    const res = await fuelGET(getReq('/api/fuel?address=bc1ptap'));
    expect(res.status).toBe(401);
  });

  it('rejects requests with a wrong x-api-key (401)', async () => {
    const res = await fuelGET(getReq('/api/fuel?address=bc1ptap', { 'x-api-key': 'nope' }));
    expect(res.status).toBe(401);
  });

  it('returns 503 when FUEL_API_KEY is not configured', async () => {
    delete process.env.FUEL_API_KEY;
    const res = await fuelGET(getReq('/api/fuel?address=bc1ptap', { 'x-api-key': KEY }));
    expect(res.status).toBe(503);
  });

  it('returns the amount for a known address with a valid key', async () => {
    fa.findUnique.mockResolvedValueOnce({ amount: 42 });
    const res = await fuelGET(getReq('/api/fuel?address=bc1ptap', { 'x-api-key': KEY }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ amount: 42 });
    expect(fa.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { address: 'bc1ptap' } }),
    );
  });

  it('returns amount 0 for an unknown address with a valid key', async () => {
    fa.findUnique.mockResolvedValueOnce(null);
    const res = await fuelGET(getReq('/api/fuel?address=bc1pmissing', { 'x-api-key': KEY }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ amount: 0 });
  });

  it('returns 400 when address is missing but the key is valid', async () => {
    const res = await fuelGET(getReq('/api/fuel', { 'x-api-key': KEY }));
    expect(res.status).toBe(400);
    expect(fa.findUnique).not.toHaveBeenCalled();
  });
});
