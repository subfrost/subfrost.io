import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma (named + default, matching @/lib/prisma) and the cache.
vi.mock('@/lib/prisma', () => {
  const inviteCode = {
    findMany: vi.fn(),
    count: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  const inviteCodeRedemption = {
    findMany: vi.fn(),
    count: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
  };
  const client = { inviteCode, inviteCodeRedemption };
  return { prisma: client, default: client };
});
vi.mock('@/lib/redis', () => ({
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
  cacheDel: vi.fn(),
}));

import {
  listCodes,
  createCode,
  updateCode,
  deleteCode,
  addAddressToCode,
  bulkCreateCodes,
  buildCodeTree,
  redemptionsToCsv,
  CodeError,
} from '@/lib/referral/admin';
import { prisma } from '@/lib/prisma';
import { cacheDel } from '@/lib/redis';

const ic = prisma.inviteCode as unknown as {
  findMany: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  createMany: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
};

const red = prisma.inviteCodeRedemption as unknown as {
  findUnique: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
};

const TAPROOT = 'bc1p' + 'q'.repeat(58); // 62-char valid Taproot address

beforeEach(() => {
  vi.clearAllMocks();
});

describe('buildCodeTree', () => {
  const base = {
    description: null,
    isActive: true,
    ownerTaprootAddress: null,
    redemptionCount: 0,
  };

  it('nests children under their parent and leaves roots at top level', () => {
    const rows = [
      { id: 'a', code: 'ALPHA', parentCodeId: null, ...base },
      { id: 'b', code: 'BETA', parentCodeId: 'a', ...base },
      { id: 'c', code: 'GAMMA', parentCodeId: 'b', ...base },
      { id: 'd', code: 'DELTA', parentCodeId: null, ...base },
    ];
    const tree = buildCodeTree(rows);
    expect(tree.map((n) => n.code).sort()).toEqual(['ALPHA', 'DELTA']);
    const alpha = tree.find((n) => n.code === 'ALPHA')!;
    expect(alpha.children.map((n) => n.code)).toEqual(['BETA']);
    expect(alpha.children[0].children.map((n) => n.code)).toEqual(['GAMMA']);
  });

  it('treats a code whose parent is missing as a root', () => {
    const rows = [{ id: 'b', code: 'ORPHAN', parentCodeId: 'gone', ...base }];
    const tree = buildCodeTree(rows);
    expect(tree.map((n) => n.code)).toEqual(['ORPHAN']);
  });
});

describe('redemptionsToCsv', () => {
  it('emits a header plus one row per redemption with ISO timestamps', () => {
    const csv = redemptionsToCsv([
      {
        id: 'r1',
        taprootAddress: 'bc1ptap',
        segwitAddress: 'bc1qseg',
        taprootPubkey: 'pub',
        redeemedAt: new Date('2026-06-20T00:00:00.000Z'),
        inviteCode: { code: 'ALPHA', description: 'launch' },
      },
    ]);
    const [header, row] = csv.split('\n');
    expect(header).toBe(
      'id,code,code_description,taproot_address,segwit_address,taproot_pubkey,redeemed_at',
    );
    expect(row).toBe('r1,ALPHA,launch,bc1ptap,bc1qseg,pub,2026-06-20T00:00:00.000Z');
  });

  it('quotes and escapes fields containing commas or quotes', () => {
    const csv = redemptionsToCsv([
      {
        id: 'r1',
        taprootAddress: 'bc1ptap',
        segwitAddress: null,
        taprootPubkey: null,
        redeemedAt: new Date('2026-06-20T00:00:00.000Z'),
        inviteCode: { code: 'ALPHA', description: 'a,"b"' },
      },
    ]);
    const row = csv.split('\n')[1];
    expect(row).toContain('"a,""b"""');
    // null optional fields render as empty cells
    expect(row).toBe('r1,ALPHA,"a,""b""",bc1ptap,,,2026-06-20T00:00:00.000Z');
  });
});

describe('listCodes', () => {
  beforeEach(() => {
    ic.findMany.mockResolvedValue([
      {
        id: 'a',
        code: 'ALPHA',
        description: null,
        isActive: true,
        ownerTaprootAddress: null,
        createdAt: new Date('2026-06-20T00:00:00.000Z'),
        parentCode: null,
        _count: { redemptions: 3, childCodes: 1 },
      },
    ]);
    ic.count.mockResolvedValue(1);
  });

  it('defaults to newest-first, no filter, 25 per page', async () => {
    const res = await listCodes();
    expect(ic.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {}, take: 25, skip: 0, orderBy: { createdAt: 'desc' } }),
    );
    expect(res.codes[0]).toMatchObject({ code: 'ALPHA', redemptionCount: 3, childCount: 1 });
    expect(res.codes[0].createdAt).toBe('2026-06-20T00:00:00.000Z');
    expect(res.pagination).toEqual({ page: 1, limit: 25, total: 1, totalPages: 1 });
  });

  it('filters by active status', async () => {
    await listCodes({ status: 'active' });
    expect(ic.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true } }),
    );
  });

  it('searches code, description and owner address case-insensitively', async () => {
    await listCodes({ search: 'foo' });
    const arg = ic.findMany.mock.calls[0][0];
    expect(arg.where.OR).toEqual([
      { code: { contains: 'foo', mode: 'insensitive' } },
      { description: { contains: 'foo', mode: 'insensitive' } },
      { ownerTaprootAddress: { contains: 'foo', mode: 'insensitive' } },
    ]);
  });

  it('sorts by redemption count via the relation _count', async () => {
    await listCodes({ sortBy: 'redemptions', sortDir: 'asc' });
    expect(ic.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { redemptions: { _count: 'asc' } } }),
    );
  });

  it('treats limit 0 as unbounded (parent-options fetch)', async () => {
    const res = await listCodes({ limit: 0 });
    expect(ic.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: undefined, skip: 0 }),
    );
    expect(res.pagination.totalPages).toBe(1);
  });
});

describe('createCode', () => {
  it('rejects codes shorter than 3 chars after normalization', async () => {
    await expect(createCode({ code: ' ab ' })).rejects.toBeInstanceOf(CodeError);
    expect(ic.create).not.toHaveBeenCalled();
  });

  it('normalizes to uppercase and creates when unique', async () => {
    ic.findUnique.mockResolvedValueOnce(null);
    ic.create.mockResolvedValueOnce({ id: 'x', code: 'ABC' });
    await createCode({ code: ' abc ', description: ' launch ' });
    expect(ic.findUnique).toHaveBeenCalledWith({ where: { code: 'ABC' } });
    expect(ic.create).toHaveBeenCalledWith({
      data: {
        code: 'ABC',
        description: 'launch',
        parentCodeId: null,
        ownerTaprootAddress: null,
      },
    });
  });

  it('rejects duplicates', async () => {
    ic.findUnique.mockResolvedValueOnce({ id: 'existing' });
    await expect(createCode({ code: 'ABC' })).rejects.toBeInstanceOf(CodeError);
    expect(ic.create).not.toHaveBeenCalled();
  });
});

describe('updateCode', () => {
  it('drops the validation cache when a code is deactivated', async () => {
    ic.update.mockResolvedValueOnce({ id: 'x', code: 'ABC', isActive: false });
    await updateCode('x', { isActive: false });
    expect(ic.update).toHaveBeenCalledWith({
      where: { id: 'x' },
      data: { isActive: false },
    });
    expect(cacheDel).toHaveBeenCalledWith('invite:valid:ABC');
  });

  it('does not touch the cache when only the description changes', async () => {
    ic.update.mockResolvedValueOnce({ id: 'x', code: 'ABC', isActive: true });
    await updateCode('x', { description: 'new' });
    expect(cacheDel).not.toHaveBeenCalled();
  });
});

describe('bulkCreateCodes', () => {
  it('rejects a prefix shorter than 2 chars', async () => {
    await expect(bulkCreateCodes({ prefix: 'A', count: 5 })).rejects.toBeInstanceOf(CodeError);
    expect(ic.createMany).not.toHaveBeenCalled();
  });

  it('rejects a count outside 1..500', async () => {
    await expect(bulkCreateCodes({ prefix: 'AB', count: 0 })).rejects.toBeInstanceOf(CodeError);
    await expect(bulkCreateCodes({ prefix: 'AB', count: 501 })).rejects.toBeInstanceOf(CodeError);
  });

  it('generates `count` unique PREFIX-XXXXX codes and bulk-inserts them', async () => {
    ic.findMany.mockResolvedValueOnce([]); // no existing codes with that prefix
    ic.createMany.mockResolvedValueOnce({ count: 5 });
    const res = await bulkCreateCodes({ prefix: ' promo ', count: 5, description: ' launch ' });

    expect(res.codes).toHaveLength(5);
    expect(new Set(res.codes).size).toBe(5); // all unique
    res.codes.forEach((c) => expect(c).toMatch(/^PROMO-[0-9A-F]{5}$/));
    expect(ic.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { code: { startsWith: 'PROMO' } } }),
    );
    expect(ic.createMany).toHaveBeenCalledWith({
      data: res.codes.map((code) => ({ code, description: 'launch', parentCodeId: null })),
    });
    expect(res.count).toBe(5);
  });

  it('does not reuse codes that already exist with that prefix', async () => {
    // Pre-seed every short suffix space is improbable; assert generated ∉ existing set.
    ic.findMany.mockResolvedValueOnce([{ code: 'PROMO-EXIST' }]);
    ic.createMany.mockResolvedValueOnce({ count: 3 });
    const res = await bulkCreateCodes({ prefix: 'PROMO', count: 3 });
    expect(res.codes).not.toContain('PROMO-EXIST');
  });
});

describe('deleteCode', () => {
  it('deletes the code and drops its validation cache', async () => {
    ic.findUnique.mockResolvedValueOnce({ id: 'x', code: 'ABC' });
    ic.delete.mockResolvedValueOnce({ id: 'x', code: 'ABC' });
    await deleteCode('x');
    expect(ic.delete).toHaveBeenCalledWith({ where: { id: 'x' } });
    expect(cacheDel).toHaveBeenCalledWith('invite:valid:ABC');
  });

  it('throws when the code does not exist', async () => {
    ic.findUnique.mockResolvedValueOnce(null);
    await expect(deleteCode('nope')).rejects.toBeInstanceOf(CodeError);
    expect(ic.delete).not.toHaveBeenCalled();
  });
});

describe('addAddressToCode', () => {
  it('rejects a non-Taproot address before touching the db', async () => {
    await expect(
      addAddressToCode({ codeId: 'c1', taprootAddress: 'bc1qnottaproot' }),
    ).rejects.toBeInstanceOf(CodeError);
    expect(ic.findUnique).not.toHaveBeenCalled();
    expect(red.create).not.toHaveBeenCalled();
  });

  it('records a redemption when the address is free', async () => {
    ic.findUnique.mockResolvedValueOnce({ id: 'c1', code: 'ABC' });
    red.findUnique.mockResolvedValueOnce(null); // not already on this code
    ic.findFirst.mockResolvedValueOnce(null); // owns no other code
    red.findFirst.mockResolvedValueOnce(null); // redeems no other code
    red.create.mockResolvedValueOnce({ id: 'r1' });

    const res = await addAddressToCode({ codeId: 'c1', taprootAddress: TAPROOT });

    expect(res).toEqual({ id: 'r1', code: 'ABC' });
    expect(red.create).toHaveBeenCalledWith({
      data: { codeId: 'c1', taprootAddress: TAPROOT },
    });
  });

  it('is a no-op when the address is already on this code', async () => {
    ic.findUnique.mockResolvedValueOnce({ id: 'c1', code: 'ABC' });
    red.findUnique.mockResolvedValueOnce({ id: 'existing' });

    const res = await addAddressToCode({ codeId: 'c1', taprootAddress: TAPROOT });

    expect(res).toEqual({ id: 'existing', code: 'ABC' });
    expect(red.create).not.toHaveBeenCalled();
  });

  it('rejects an address that owns a different code', async () => {
    ic.findUnique.mockResolvedValueOnce({ id: 'c1', code: 'ABC' });
    red.findUnique.mockResolvedValueOnce(null);
    ic.findFirst.mockResolvedValueOnce({ id: 'other' }); // owns a different code

    await expect(
      addAddressToCode({ codeId: 'c1', taprootAddress: TAPROOT }),
    ).rejects.toBeInstanceOf(CodeError);
    expect(red.create).not.toHaveBeenCalled();
  });

  it('rejects an address already redeemed on a different code', async () => {
    ic.findUnique.mockResolvedValueOnce({ id: 'c1', code: 'ABC' });
    red.findUnique.mockResolvedValueOnce(null);
    ic.findFirst.mockResolvedValueOnce(null);
    red.findFirst.mockResolvedValueOnce({ id: 'other-red' }); // on a different code

    await expect(
      addAddressToCode({ codeId: 'c1', taprootAddress: TAPROOT }),
    ).rejects.toBeInstanceOf(CodeError);
    expect(red.create).not.toHaveBeenCalled();
  });

  it('throws when the code does not exist', async () => {
    ic.findUnique.mockResolvedValueOnce(null);
    await expect(
      addAddressToCode({ codeId: 'nope', taprootAddress: TAPROOT }),
    ).rejects.toBeInstanceOf(CodeError);
    expect(red.create).not.toHaveBeenCalled();
  });
});
