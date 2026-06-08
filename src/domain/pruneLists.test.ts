import { describe, it, expect } from 'vitest';
import { listsToPrune } from './pruneLists';

const A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

describe('listsToPrune', () => {
  it('keeps lists the server still returns', () => {
    expect(listsToPrune([A, B], [A, B], new Set())).toEqual([]);
  });

  it('prunes a list the server no longer returns (e.g. membership removed)', () => {
    expect(listsToPrune([A, B], [A], new Set())).toEqual([B]);
  });

  it('does NOT prune a server-absent list with a pending (un-pushed) local op', () => {
    // C was created offline and has not been pushed yet, so the server doesn't know it.
    expect(listsToPrune([A, C], [A], new Set([C]))).toEqual([]);
  });

  it('prunes server-absent + unprotected, keeps server-absent + protected, in one pass', () => {
    expect(listsToPrune([A, B, C], [A], new Set([C]))).toEqual([B]);
  });

  it('returns nothing when the mirror is empty', () => {
    expect(listsToPrune([], [A, B], new Set())).toEqual([]);
  });
});
