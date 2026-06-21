import { describe, it, expect, vi } from 'vitest';
import {
  parseCopyBlock,
  parseInviteCodes,
  parseRedemptions,
  topoSortCodes,
  loadReferralData,
  type InviteCodeRecord,
  type RedemptionRecord,
} from '@/lib/referral/migrate';

const TAB = '\t';

describe('parseCopyBlock', () => {
  it('splits TSV rows, maps columns, and decodes \\N as null', () => {
    const sql = [
      'COPY public.t (a, b, c) FROM stdin;',
      `hello${TAB}world${TAB}\\N`,
      `x${TAB}y${TAB}z`,
      '\\.',
    ].join('\n');
    expect(parseCopyBlock(sql, 'public.t')).toEqual([
      { a: 'hello', b: 'world', c: null },
      { a: 'x', b: 'y', c: 'z' },
    ]);
  });

  it('decodes pg_dump escapes (\\t tab, \\n newline, \\\\ backslash) inside a field', () => {
    const sql = [
      'COPY public.t (a, b) FROM stdin;',
      // field b contains an escaped tab, escaped newline and escaped backslash —
      // none of which must break record/column splitting.
      `id1${TAB}wor\\tld\\nline2\\\\end`,
      '\\.',
    ].join('\n');
    const rows = parseCopyBlock(sql, 'public.t');
    expect(rows).toEqual([{ a: 'id1', b: 'wor\tld\nline2\\end' }]);
  });

  it('returns [] when the table block is absent', () => {
    expect(parseCopyBlock('-- nothing here', 'public.t')).toEqual([]);
  });
});

describe('parseInviteCodes', () => {
  it('maps snake_case columns to the InviteCode shape with typed values', () => {
    const sql = [
      'COPY public.invite_codes (id, code, description, is_active, created_at, parent_code_id, owner_taproot_address) FROM stdin;',
      `id1${TAB}ALPHA${TAB}\\N${TAB}t${TAB}2026-02-09 17:04:34.273${TAB}\\N${TAB}bc1pxxx`,
      `id2${TAB}BETA${TAB}sub-leader${TAB}f${TAB}2026-02-10 10:00:00${TAB}id1${TAB}\\N`,
      '\\.',
    ].join('\n');
    const codes = parseInviteCodes(sql);
    expect(codes[0]).toMatchObject({
      id: 'id1',
      code: 'ALPHA',
      description: null,
      isActive: true,
      parentCodeId: null,
      ownerTaprootAddress: 'bc1pxxx',
    });
    expect(codes[0].createdAt.toISOString()).toBe('2026-02-09T17:04:34.273Z');
    expect(codes[1]).toMatchObject({
      code: 'BETA',
      description: 'sub-leader',
      isActive: false,
      parentCodeId: 'id1',
      ownerTaprootAddress: null,
    });
  });
});

describe('parseRedemptions', () => {
  it('maps columns and treats \\N updated_at as null', () => {
    const sql = [
      'COPY public.invite_code_redemptions (id, code_id, taproot_address, segwit_address, taproot_pubkey, redeemed_at, updated_at) FROM stdin;',
      `r1${TAB}c1${TAB}bc1ptap${TAB}bc1qseg${TAB}pubkey${TAB}2026-03-01 00:00:00${TAB}\\N`,
      '\\.',
    ].join('\n');
    const [r] = parseRedemptions(sql);
    expect(r).toMatchObject({
      id: 'r1',
      codeId: 'c1',
      taprootAddress: 'bc1ptap',
      segwitAddress: 'bc1qseg',
      taprootPubkey: 'pubkey',
      updatedAt: null,
    });
    expect(r.redeemedAt.toISOString()).toBe('2026-03-01T00:00:00.000Z');
  });
});

const code = (id: string, parentCodeId: string | null): InviteCodeRecord => ({
  id,
  code: id.toUpperCase(),
  description: null,
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  parentCodeId,
  ownerTaprootAddress: null,
});

describe('topoSortCodes', () => {
  it('orders every parent before its children', () => {
    const scrambled = [code('grandchild', 'child'), code('child', 'root'), code('root', null)];
    const sorted = topoSortCodes(scrambled).map((c) => c.id);
    expect(sorted.indexOf('root')).toBeLessThan(sorted.indexOf('child'));
    expect(sorted.indexOf('child')).toBeLessThan(sorted.indexOf('grandchild'));
  });

  it('keeps a code whose parent is not in the set (treated as root)', () => {
    const sorted = topoSortCodes([code('orphan', 'missing')]).map((c) => c.id);
    expect(sorted).toEqual(['orphan']);
  });
});

describe('loadReferralData', () => {
  const redemption = (id: string, codeId: string): RedemptionRecord => ({
    id,
    codeId,
    taprootAddress: `tap-${id}`,
    segwitAddress: null,
    taprootPubkey: null,
    redeemedAt: new Date('2026-03-01T00:00:00Z'),
    updatedAt: null,
  });

  it('upserts codes parent-first, chunks redemptions, and skips orphans', async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const createMany = vi.fn().mockResolvedValue({ count: 0 });
    const prisma = {
      inviteCode: { upsert },
      inviteCodeRedemption: { createMany },
    } as never;

    const result = await loadReferralData(
      prisma,
      {
        codes: [code('child', 'root'), code('root', null)],
        redemptions: [redemption('r1', 'root'), redemption('r2', 'child'), redemption('r3', 'ghost')],
      },
      { batchSize: 2 },
    );

    // codes upserted in topological order (root before child)
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert.mock.calls[0][0].where).toEqual({ id: 'root' });
    expect(upsert.mock.calls[1][0].where).toEqual({ id: 'child' });

    // 2 valid redemptions (r3 references an unknown code) → one chunk of 2
    expect(createMany).toHaveBeenCalledTimes(1);
    expect(createMany.mock.calls[0][0]).toMatchObject({ skipDuplicates: true });
    expect(createMany.mock.calls[0][0].data.map((d: RedemptionRecord) => d.id)).toEqual(['r1', 'r2']);

    expect(result).toEqual({ codes: 2, redemptions: 2, orphaned: 1 });
  });
});
