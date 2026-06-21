import { describe, it, expect } from 'vitest';
import {
  Form107Schema,
  SarSchema,
  CtrSchema,
  form107ToXml,
  validateAndSerializeForm107,
  FORM_107_DEFAULTS,
} from '@/lib/fincen/schemas';

describe('Form107Schema', () => {
  it('accepts the canonical defaults', () => {
    expect(() => Form107Schema.parse(FORM_107_DEFAULTS)).not.toThrow();
  });

  it('rejects a malformed EIN', () => {
    const bad = { ...FORM_107_DEFAULTS, ein: '12345' };
    expect(Form107Schema.safeParse(bad).success).toBe(false);
  });

  it('requires at least one officer', () => {
    const bad = { ...FORM_107_DEFAULTS, officers: [] };
    expect(Form107Schema.safeParse(bad).success).toBe(false);
  });
});

describe('SarSchema', () => {
  const base = {
    subject: { name: 'John Doe' },
    activity: { startDate: '2026-01-01', totalUsd: 25000, category: 'structuring' as const },
    narrative: 'x'.repeat(40),
    preparerName: 'Compliance Officer',
  };
  it('accepts a substantive narrative', () => {
    expect(SarSchema.safeParse(base).success).toBe(true);
  });
  it('rejects a too-short narrative', () => {
    expect(SarSchema.safeParse({ ...base, narrative: 'too short' }).success).toBe(false);
  });
});

describe('CtrSchema', () => {
  const base = {
    subject: { name: 'Jane', accountId: 'acct_1', address: { line1: '1 A St', city: 'Houston', state: 'TX', zip: '77006' } },
    transactionDate: '2026-02-02',
    cashIn: 8000,
    cashOut: 4000,
    preparerName: 'CO',
  };
  it('accepts a transaction over $10,000 total', () => {
    expect(CtrSchema.safeParse(base).success).toBe(true);
  });
  it('rejects a transaction at or under $10,000 total', () => {
    expect(CtrSchema.safeParse({ ...base, cashIn: 6000, cashOut: 4000 }).success).toBe(false);
  });
});

describe('form107ToXml', () => {
  it('serializes core fields and escapes XML special chars', () => {
    const data = Form107Schema.parse({ ...FORM_107_DEFAULTS, legalName: 'Sub & Zero <Inc>' });
    const xml = form107ToXml(data);
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<LegalName>Sub &amp; Zero &lt;Inc&gt;</LegalName>');
    expect(xml).toContain('<EIN>');
  });

  it('omits officers whose includeOnFiling is false', () => {
    const data = Form107Schema.parse({
      ...FORM_107_DEFAULTS,
      officers: [
        { name: 'Kept', title: 'CEO', role: 'ceo', includeOnFiling: true },
        { name: 'Dropped', title: 'X', role: 'other', includeOnFiling: false },
      ],
    });
    const xml = form107ToXml(data);
    expect(xml).toContain('<Name>Kept</Name>');
    expect(xml).not.toContain('<Name>Dropped</Name>');
  });

  it('validateAndSerializeForm107 returns both xml and parsed data', () => {
    const { xml, data } = validateAndSerializeForm107(FORM_107_DEFAULTS);
    expect(typeof xml).toBe('string');
    expect(data.legalName).toBe(FORM_107_DEFAULTS.legalName);
  });
});
