import { describe, it, expect } from 'vitest';
import { centsToUsd, centsToDisplay } from '@/lib/stripe/format';

describe('format', () => {
  it('centsToUsd is unsigned with 2 decimals', () => {
    expect(centsToUsd(1234)).toBe('$12.34');
    expect(centsToUsd(-500)).toBe('$5.00');
    expect(centsToUsd(0)).toBe('$0.00');
  });
  it('centsToDisplay is signed', () => {
    expect(centsToDisplay(1234)).toBe('$12.34');
    expect(centsToDisplay(-500)).toBe('-$5.00');
  });
});
