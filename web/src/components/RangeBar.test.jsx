import { describe, expect, test } from 'vitest';
import { render } from '@testing-library/react';
import { RangeBar } from './RangeBar';

describe('RangeBar', () => {
  test('renders nothing when the value or both reference limits are missing', () => {
    expect(render(<RangeBar value={null} low={1} high={2} flag="normal" />).container.firstChild).toBeNull();
    expect(render(<RangeBar value={5} low={null} high={null} flag="normal" />).container.firstChild).toBeNull();
  });

  test('renders an SVG for a two-sided range, and for one-sided ranges (unit tests mirror the backend parser)', () => {
    const { container: a } = render(<RangeBar value={10.2} low={12} high={15.5} flag="low" />);
    expect(a.querySelector('svg')).toBeTruthy();
    const { container: b } = render(<RangeBar value={142} low={null} high={100} flag="high" />);
    expect(b.querySelector('svg')).toBeTruthy();
    const { container: c } = render(<RangeBar value={45} low={40} high={null} flag="normal" />);
    expect(c.querySelector('svg')).toBeTruthy();
  });

  test('the dot is placed inside the viewBox even when the value sits beyond the reference band', () => {
    const { container } = render(<RangeBar value={1000} low={0} high={100} flag="high" />);
    const dot = container.querySelector('circle');
    const cx = Number(dot.getAttribute('cx'));
    expect(cx).toBeGreaterThanOrEqual(0);
    expect(cx).toBeLessThanOrEqual(300);
  });
});
