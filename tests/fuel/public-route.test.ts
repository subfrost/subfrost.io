import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => {
  const fuelAllocation = { findUnique: vi.fn() };
  const client = { fuelAllocation };
  return { prisma: client, default: client };
});

vi.mock('@/lib/redis', () => ({
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
}));

import { GET } from '@/app/api/fuel/route';
import prisma from '@/lib/prisma';
import { cacheGet, cacheSet } from '@/lib/redis';

const fa = (prisma as unknown as { fuelAllocation: { findUnique: ReturnType<typeof vi.fn> } }).fuelAllocation;
const get = cacheGet as unknown as ReturnType<typeof vi.fn>;
const set = cacheSet as unknown as ReturnType<typeof vi.fn>;

const req = (url: string) => new Request(url) as never;

beforeEach(() => {
  vi.clearAllMocks();
  get.mockResolvedValue(null);
});

describe('GET /api/fuel', () => {
  it('returns the allocation amount for a known address', async () => {
    fa.findUnique.mockResolvedValueOnce({ amount: 12.5 });
    const res = await GET(req('http://localhost/api/fuel?address=bc1pa'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ amount: 12.5 });
    expect(fa.findUnique).toHaveBeenCalledWith({ where: { address: 'bc1pa' }, select: { amount: true } });
    expect(set).toHaveBeenCalledWith('fuel:public:bc1pa', { amount: 12.5 }, 60);
  });

  it('returns amount 0 for an address with no allocation', async () => {
    fa.findUnique.mockResolvedValueOnce(null);
    const res = await GET(req('http://localhost/api/fuel?address=bc1pz'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ amount: 0 });
  });

  it('returns 400 when address is missing', async () => {
    const res = await GET(req('http://localhost/api/fuel'));
    expect(res.status).toBe(400);
    expect(fa.findUnique).not.toHaveBeenCalled();
  });

  it('serves a cache hit without touching the DB', async () => {
    get.mockResolvedValueOnce({ amount: 7 });
    const res = await GET(req('http://localhost/api/fuel?address=bc1pa'));
    expect(await res.json()).toEqual({ amount: 7 });
    expect(fa.findUnique).not.toHaveBeenCalled();
  });
});
