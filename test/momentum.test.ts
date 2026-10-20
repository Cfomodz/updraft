import { describe, expect, it } from 'vitest';
import { momentum, rank, recentRate, stageFor } from '../src/shared/momentum';
import type { CapturedPost, Snapshot } from '../src/shared/types';

const NOW = Date.UTC(2026, 9, 19, 12);
const H = 3_600_000;

function post(key: string, ageH: number, snaps: Array<[number, number, number, number?]>, extra: Partial<CapturedPost> = {}): CapturedPost {
  const snapshots: Snapshot[] = snaps.map(([agoH, reactions, comments, reposts = 0]) => ({ at: NOW - agoH * H, reactions, comments, reposts }));
  return {
    key, activityId: key, url: null, author: key, authorHeadline: '', text: 't',
    postedAt: NOW - ageH * H, postedAtSource: 'urn', snapshots,
    firstSeenAt: snapshots[0].at, lastSeenAt: snapshots[snapshots.length - 1].at, ...extra,
  };
}

describe('stageFor', () => {
  it('maps age to stages', () => {
    expect([0.5, 3, 20, 40].map(stageFor)).toEqual(['fresh', 'rising', 'established', 'late']);
  });
});

describe('momentum', () => {
  it('flags a fast fresh post as hot', () => {
    const m = momentum(post('a', 1, [[0, 60, 5]]), NOW)!;
    expect(m.stage).toBe('fresh');
    expect(m.engagement).toBe(75);
    expect(m.hot).toBe(true);
  });

  it('does not flag a slow post', () => {
    expect(momentum(post('b', 6, [[0, 40, 2]]), NOW)!.hot).toBe(false);
  });

  it('floors age so a brand-new post with a few reactions is not hot', () => {
    expect(momentum(post('c', 0.02, [[0, 4, 0]]), NOW)!.hot).toBe(false);
  });

  it('weights recent observed velocity over the lifetime average', () => {
    // Quiet for hours, then +600 weighted engagement in the last 30 minutes.
    const p = post('d', 6, [[0.5, 30, 0], [0, 630, 0]]);
    expect(recentRate(p.snapshots)).toBeCloseTo(1200);
    expect(momentum(p, NOW)!.hot).toBe(true);
  });

  it('ignores snapshots too close together for a rate', () => {
    expect(recentRate(post('e', 1, [[0.05, 10, 0], [0, 50, 0]]).snapshots)).toBeNull();
  });

  it('returns null without an age', () => {
    expect(momentum(post('f', 1, [[0, 10, 0]], { postedAt: null }), NOW)).toBeNull();
  });
});

describe('rank', () => {
  it('orders by score and drops late, dismissed and undated posts', () => {
    const ranked = rank([
      post('slow', 3, [[0, 50, 2]]),
      post('fast', 1, [[0, 200, 20]]),
      post('crowded', 1, [[0, 200, 600]]),
      post('old', 50, [[0, 9000, 900]]),
      post('hidden', 1, [[0, 500, 50]], { dismissed: true }),
      post('undated', 1, [[0, 500, 50]], { postedAt: null }),
    ], NOW).map((r) => r.post.key);
    expect(ranked[0]).toBe('fast');
    expect(ranked).not.toContain('old');
    expect(ranked).not.toContain('hidden');
    expect(ranked).not.toContain('undated');
    // 600 comments: high raw rate but a new comment would be buried.
    expect(ranked.indexOf('crowded')).toBeGreaterThan(ranked.indexOf('fast'));
  });
});
