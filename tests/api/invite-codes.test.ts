import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma (named + default export, matching @/lib/prisma) and the cache.
vi.mock('@/lib/prisma', () => {
  const inviteCode = { findUnique: vi.fn() };
  const inviteCodeRedemption = { upsert: vi.fn(), findFirst: vi.fn() };
  const client = { inviteCode, inviteCodeRedemption };
  return { prisma: client, default: client };
});
vi.mock('@/lib/redis', () => ({
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
  cacheDel: vi.fn(),
}));

import { NextRequest } from 'next/server';
import { POST as validatePOST } from '@/app/api/invite-codes/validate/route';
import { POST as redeemPOST } from '@/app/api/invite-codes/redeem/route';
import { GET as lookupGET } from '@/app/api/invite-codes/lookup/route';
import { prisma } from '@/lib/prisma';
import { cacheGet, cacheSet, cacheDel } from '@/lib/redis';

const KEY = 'test-referral-key';
const ic = prisma.inviteCode as unknown as { findUnique: ReturnType<typeof vi.fn> };
const icr = prisma.inviteCodeRedemption as unknown as {
  upsert: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
};

function postReq(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`https://subfrost.io${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...headers },
  });
}
function getReq(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(`https://subfrost.io${path}`, { method: 'GET', headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.REFERRAL_API_KEY = KEY;
  vi.mocked(cacheGet).mockResolvedValue(null);
  vi.mocked(cacheSet).mockResolvedValue(undefined);
  vi.mocked(cacheDel).mockResolvedValue(undefined);
});

describe('POST /api/invite-codes/validate', () => {
  it('rejects requests without a valid service key (401)', async () => {
    const res = await validatePOST(postReq('/api/invite-codes/validate', { code: 'ALPHA' }));
    expect(res.status).toBe(401);
  });

  it('returns valid:true for an active code (and normalizes to uppercase)', async () => {
    ic.findUnique.mockResolvedValueOnce({ isActive: true });
    const res = await validatePOST(
      postReq('/api/invite-codes/validate', { code: ' alpha ' }, { 'x-api-key': KEY }),
    );
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.valid).toBe(true);
    expect(ic.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { code: 'ALPHA' } }),
    );
  });

  it('returns valid:false for a missing code', async () => {
    ic.findUnique.mockResolvedValueOnce(null);
    const res = await validatePOST(
      postReq('/api/invite-codes/validate', { code: 'NOPE' }, { 'x-api-key': KEY }),
    );
    const data = await res.json();
    expect(data.valid).toBe(false);
  });

  it('returns valid:false for an inactive code', async () => {
    ic.findUnique.mockResolvedValueOnce({ isActive: false });
    const res = await validatePOST(
      postReq('/api/invite-codes/validate', { code: 'OLD' }, { 'x-api-key': KEY }),
    );
    const data = await res.json();
    expect(data.valid).toBe(false);
  });
});

describe('POST /api/invite-codes/redeem', () => {
  it('rejects requests without a valid service key (401)', async () => {
    const res = await redeemPOST(
      postReq('/api/invite-codes/redeem', { code: 'ALPHA', taprootAddress: 'bc1p...' }),
    );
    expect(res.status).toBe(401);
  });

  it('records a redemption for an active code', async () => {
    ic.findUnique.mockResolvedValueOnce({ id: 'code1', isActive: true });
    icr.upsert.mockResolvedValueOnce({ id: 'red1' });
    const res = await redeemPOST(
      postReq(
        '/api/invite-codes/redeem',
        { code: 'alpha', taprootAddress: 'bc1ptap', segwitAddress: 'bc1qseg' },
        { 'x-api-key': KEY },
      ),
    );
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(icr.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { codeId_taprootAddress: { codeId: 'code1', taprootAddress: 'bc1ptap' } },
      }),
    );
  });

  it('returns success:false for an invalid code', async () => {
    ic.findUnique.mockResolvedValueOnce(null);
    const res = await redeemPOST(
      postReq(
        '/api/invite-codes/redeem',
        { code: 'NOPE', taprootAddress: 'bc1ptap' },
        { 'x-api-key': KEY },
      ),
    );
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(icr.upsert).not.toHaveBeenCalled();
  });

  it('rejects when taprootAddress is missing (400)', async () => {
    ic.findUnique.mockResolvedValueOnce({ id: 'code1', isActive: true });
    const res = await redeemPOST(
      postReq('/api/invite-codes/redeem', { code: 'ALPHA' }, { 'x-api-key': KEY }),
    );
    expect(res.status).toBe(400);
  });
});

describe('GET /api/invite-codes/lookup', () => {
  it('rejects requests without a valid service key (401)', async () => {
    const res = await lookupGET(getReq('/api/invite-codes/lookup?address=bc1ptap'));
    expect(res.status).toBe(401);
  });

  it('returns found:false when no redemption exists', async () => {
    icr.findFirst.mockResolvedValueOnce(null);
    const res = await lookupGET(
      getReq('/api/invite-codes/lookup?address=bc1ptap', { 'x-api-key': KEY }),
    );
    const data = await res.json();
    expect(data.found).toBe(false);
  });

  it('returns the code and parent code for a redeemed address', async () => {
    icr.findFirst.mockResolvedValueOnce({
      code: { code: 'BETA', description: 'sub-leader', parentCode: { code: 'ALPHA' } },
    });
    const res = await lookupGET(
      getReq('/api/invite-codes/lookup?address=bc1ptap', { 'x-api-key': KEY }),
    );
    const data = await res.json();
    expect(data).toEqual({
      found: true,
      code: 'BETA',
      codeDescription: 'sub-leader',
      parentCode: 'ALPHA',
    });
  });
});
