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
    updateMany: vi.fn(),
    delete: vi.fn(),
  };
  const inviteCodeRedemption = {
    findMany: vi.fn(),
    count: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  };
  const client = {
    inviteCode,
    inviteCodeRedemption,
    // Interactive transaction: run the callback against the same mock client.
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(client)),
  };
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
  updateMany: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
};

const red = prisma.inviteCodeRedemption as unknown as {
  findMany: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  updateMany: ReturnType<typeof vi.fn>;
  deleteMany: ReturnType<typeof vi.fn>;
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
  it('deletes a root code, promotes its children to roots, and drops its cache', async () => {
    // Root code (parentCodeId null): no parent to inherit redemptions, so
    // children are reparented to null and redemptions are left to cascade.
    ic.findUnique.mockResolvedValueOnce({ id: 'x', code: 'ABC', parentCodeId: null });
    ic.updateMany.mockResolvedValueOnce({ count: 1 });
    ic.delete.mockResolvedValueOnce({ id: 'x', code: 'ABC' });

    await deleteCode('x');

    // Children of x move up to x's parent (null → they become roots).
    expect(ic.updateMany).toHaveBeenCalledWith({
      where: { parentCodeId: 'x' },
      data: { parentCodeId: null },
    });
    // No parent → redemptions are not moved, they cascade on delete.
    expect(red.updateMany).not.toHaveBeenCalled();
    expect(ic.delete).toHaveBeenCalledWith({ where: { id: 'x' } });
    expect(cacheDel).toHaveBeenCalledWith('invite:valid:ABC');
  });

  it('reparents children onto the grandparent and moves redemptions to the parent', async () => {
    // Deleting Child1 (parent = Parent): Child1's children (e.g. Child2) become
    // children of Parent, and Child1's redemptions are inherited by Parent.
    ic.findUnique.mockResolvedValueOnce({ id: 'child1', code: 'C1', parentCodeId: 'parent' });
    ic.updateMany.mockResolvedValueOnce({ count: 1 });
    // Parent already redeems ADDR_DUP; Child1 redeems ADDR_DUP + ADDR_NEW.
    red.findMany
      .mockResolvedValueOnce([{ taprootAddress: 'ADDR_DUP' }]) // parent's existing
      .mockResolvedValueOnce([
        { id: 'r_dup', taprootAddress: 'ADDR_DUP' },
        { id: 'r_new', taprootAddress: 'ADDR_NEW' },
      ]); // child1's own
    red.deleteMany.mockResolvedValueOnce({ count: 1 });
    red.updateMany.mockResolvedValueOnce({ count: 1 });
    ic.delete.mockResolvedValueOnce({ id: 'child1', code: 'C1' });

    await deleteCode('child1');

    // Child2 (and any sibling) reparented from Child1 up to Parent.
    expect(ic.updateMany).toHaveBeenCalledWith({
      where: { parentCodeId: 'child1' },
      data: { parentCodeId: 'parent' },
    });
    // The address Parent already holds is dropped (would break the unique key)…
    expect(red.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['r_dup'] } } });
    // …and the genuinely new address is reassigned to Parent.
    expect(red.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['r_new'] } },
      data: { codeId: 'parent' },
    });
    expect(ic.delete).toHaveBeenCalledWith({ where: { id: 'child1' } });
    expect(cacheDel).toHaveBeenCalledWith('invite:valid:C1');
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
