import { describe, expect, it } from 'vitest';
import { LIMITS, mergeCapture } from '../src/shared/store';
import type { CaptureInput } from '../src/shared/types';

const T0 = Date.UTC(2026, 9, 19, 9);
const M = 60_000;

function input(over: Partial<CaptureInput> = {}): CaptureInput {
  return {
    key: '1', activityId: '1', url: 'u', author: 'A', authorHeadline: '', text: 'short',
    postedAt: T0 - 30 * M, postedAtSource: 'urn', reactions: 10, comments: 1, reposts: 0, observedAt: T0, ...over,
  };
}

describe('mergeCapture', () => {
  it('creates posts and appends spaced snapshots', () => {
    let s = mergeCapture({}, [input()], T0);
    s = mergeCapture(s, [input({ reactions: 40, observedAt: T0 + 10 * M })], T0 + 10 * M);
    expect(s['1'].snapshots.map((x) => x.reactions)).toEqual([10, 40]);
  });

  it('refreshes rather than appends when observations are close together', () => {
    let s = mergeCapture({}, [input()], T0);
    s = mergeCapture(s, [input({ reactions: 12, observedAt: T0 + M })], T0 + M);
    expect(s['1'].snapshots).toEqual([{ at: T0, reactions: 12, comments: 1, reposts: 0 }]);
  });

  it('ignores all-zero counts once real counts exist', () => {
    let s = mergeCapture({}, [input()], T0);
    s = mergeCapture(s, [input({ reactions: 0, comments: 0, observedAt: T0 + 10 * M })], T0 + 10 * M);
    expect(s['1'].snapshots).toHaveLength(1);
  });

  it('keeps the longer text and upgrades relative age to URN age', () => {
    let s = mergeCapture({}, [input({ postedAt: T0 - 60 * M, postedAtSource: 'relative-text' })], T0);
    s = mergeCapture(s, [input({ text: 'short but now expanded', postedAt: T0 - 47 * M })], T0);
    expect(s['1'].text).toBe('short but now expanded');
    expect(s['1'].postedAt).toBe(T0 - 47 * M);
    expect(s['1'].postedAtSource).toBe('urn');
  });

  it('bounds snapshots per post', () => {
    let s = mergeCapture({}, [input()], T0);
    for (let i = 1; i <= 20; i++) s = mergeCapture(s, [input({ reactions: 10 + i, observedAt: T0 + i * 10 * M })], T0 + i * 10 * M);
    expect(s['1'].snapshots).toHaveLength(LIMITS.snapshotsPerPost);
    expect(s['1'].snapshots.at(-1)!.reactions).toBe(30);
  });

  it('prunes stale posts but keeps recently commented ones', () => {
    const s = mergeCapture({}, [input({ key: 'old' }), input({ key: 'mine' })], T0);
    s.mine.commentedAt = T0;
    const later = T0 + 4 * 86_400_000;
    const pruned = mergeCapture(s, [], later);
    expect(Object.keys(pruned)).toEqual(['mine']);
  });
});
