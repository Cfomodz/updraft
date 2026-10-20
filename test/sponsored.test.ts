import { describe, expect, it } from 'vitest';
import { isWellFunded, namesViewer, sponsoredView } from '../src/shared/sponsored';
import { DEFAULT_SETTINGS, type CapturedPost } from '../src/shared/types';

const T = DEFAULT_SETTINGS.funding; // 10k followers, 100 engagement, 3 sightings
const NOW = Date.UTC(2026, 9, 20, 12);

function ad(key: string, over: Partial<CapturedPost> & { engagement?: number } = {}): CapturedPost {
  const { engagement = 0, ...rest } = over;
  return {
    key, activityId: null, url: null, author: key, authorHeadline: '', text: 'Ad copy',
    postedAt: null, postedAtSource: null, firstSeenAt: NOW, lastSeenAt: NOW,
    snapshots: [{ at: NOW, reactions: engagement, comments: 0, reposts: 0 }],
    promoted: true, advertiserFollowers: null, sightings: 1, ...rest,
  };
}

describe('namesViewer', () => {
  it.each([
    ['David, your team shipped more.', true],
    ['Hi David Ashby — quick question', true],
    ['¿David? Mira esto.', true],
    ['DAVID, last chance', true],
    ['Davidson Labs found a fix', false],
    ['Ask about our MacDavid plan', false],
    ['No name here', false],
  ])('%s -> %s', (text, expected) => {
    expect(namesViewer(text, 'David Ashby')).toBe(expected);
  });

  it('matches surnames only as part of the full name, and never on blank or 1-letter names', () => {
    expect(namesViewer('The Ashby report', 'David Ashby')).toBe(false);
    expect(namesViewer('anything', '')).toBe(false);
    expect(namesViewer('J, hello', 'J')).toBe(false);
  });

  it('escapes regex characters in names', () => {
    expect(namesViewer('Hey Jo (JJ), look', 'Jo (JJ)')).toBe(true);
  });
});

describe('isWellFunded', () => {
  it('passes on any one proxy', () => {
    expect(isWellFunded(ad('a', { advertiserFollowers: 254_310 }), T)).toBe(true);
    expect(isWellFunded(ad('b', { engagement: 150 }), T)).toBe(true);
    expect(isWellFunded(ad('c', { sightings: 3 }), T)).toBe(true);
    expect(isWellFunded(ad('d', { advertiserFollowers: 1204, engagement: 9, sightings: 2 }), T)).toBe(false);
  });
});

describe('sponsoredView', () => {
  const H = 3_600_000;
  const posts = [
    ad('old-big', { advertiserFollowers: 50_000, firstSeenAt: NOW - 9 * 86_400_000 }),
    ad('new-big', { advertiserFollowers: 50_000, firstSeenAt: NOW - H, text: 'David, see this' }),
    // Posted long ago but only just reached you: first-seen time decides, not posting time.
    ad('dated', { advertiserFollowers: 50_000, postedAt: NOW - 20 * 86_400_000, firstSeenAt: NOW - 10 * 60_000 }),
    ad('small', { advertiserFollowers: 900, firstSeenAt: NOW }),
    ad('done', { advertiserFollowers: 50_000, commentedAt: NOW }),
    ad('hidden', { advertiserFollowers: 50_000, dismissed: true }),
    { ...ad('organic', { advertiserFollowers: 50_000 }), promoted: false },
  ];
  const keys = (f: { wellFundedOnly: boolean; namesMeOnly: boolean }) => sponsoredView(posts, f, T, 'David Ashby').map((r) => r.post.key);

  it('lists every uncommented well-funded ad, newest first, however old', () => {
    expect(keys({ wellFundedOnly: true, namesMeOnly: false })).toEqual(['dated', 'new-big', 'old-big']);
  });

  it('includes smaller advertisers when the funding filter is off', () => {
    expect(keys({ wellFundedOnly: false, namesMeOnly: false })).toEqual(['small', 'dated', 'new-big', 'old-big']);
  });

  it('narrows to ads that address you by name', () => {
    expect(keys({ wellFundedOnly: true, namesMeOnly: true })).toEqual(['new-big']);
    expect(sponsoredView(posts, { wellFundedOnly: true, namesMeOnly: true }, T, '')).toEqual([]);
  });
});
