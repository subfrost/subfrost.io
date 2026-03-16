/**
 * Tests for AddressAvatar component
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import AddressAvatar from '@/components/conference/AddressAvatar';

describe('AddressAvatar', () => {
  it('renders an SVG element', () => {
    const { container } = render(<AddressAvatar address="bc1ptest123" />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
  });

  it('uses the default size of 32', () => {
    const { container } = render(<AddressAvatar address="bc1ptest123" />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('32');
    expect(svg?.getAttribute('height')).toBe('32');
  });

  it('accepts a custom size', () => {
    const { container } = render(<AddressAvatar address="bc1ptest123" size={48} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('48');
    expect(svg?.getAttribute('height')).toBe('48');
  });

  it('generates different colors for different addresses', () => {
    const { container: c1 } = render(<AddressAvatar address="bc1paddr1" />);
    const { container: c2 } = render(<AddressAvatar address="bc1paddr2" />);
    const bg1 = c1.querySelector('svg')?.style.backgroundColor;
    const bg2 = c2.querySelector('svg')?.style.backgroundColor;
    // Different addresses should produce different colors
    expect(bg1).not.toBe(bg2);
  });

  it('generates the same color for the same address', () => {
    const { container: c1 } = render(<AddressAvatar address="bc1psame" />);
    const { container: c2 } = render(<AddressAvatar address="bc1psame" />);
    const bg1 = c1.querySelector('svg')?.style.backgroundColor;
    const bg2 = c2.querySelector('svg')?.style.backgroundColor;
    expect(bg1).toBe(bg2);
  });

  it('has rounded-full class', () => {
    const { container } = render(<AddressAvatar address="bc1ptest" />);
    const svg = container.querySelector('svg');
    expect(svg?.classList.contains('rounded-full')).toBe(true);
  });

  it('applies custom className', () => {
    const { container } = render(<AddressAvatar address="bc1ptest" className="my-class" />);
    const svg = container.querySelector('svg');
    expect(svg?.classList.contains('my-class')).toBe(true);
  });
});
