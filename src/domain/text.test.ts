import { describe, it, expect } from 'vitest';
import { oneLine } from './text';

describe('oneLine', () => {
  it('replaces line breaks with single spaces', () => {
    expect(oneLine('a\nb')).toBe('a b');
    expect(oneLine('a\r\nb')).toBe('a b');
    expect(oneLine('a\n\n\r\nb')).toBe('a b');
  });

  it('leaves break-free strings untouched', () => {
    expect(oneLine('plain title')).toBe('plain title');
    expect(oneLine('')).toBe('');
  });
});
