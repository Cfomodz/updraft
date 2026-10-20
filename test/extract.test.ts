import { describe, expect, it } from 'vitest';
import { engagementCounts, extractPost, findPosts, parseCount, viewerName } from '../src/content/extract';
import { idAt, loadFixture } from './helpers';

const NOW = Date.UTC(2026, 9, 19, 12);

describe('parseCount', () => {
  it.each([['1,204', 1204], ['1.2K', 1200], ['3M', 3_000_000], ['12 345', 12345], ['87 comments', 87], ['1,5K', 1500]])('%s', (s, n) => {
    expect(parseCount(s)).toBe(n);
  });
  it('returns null without digits', () => expect(parseCount('Like')).toBeNull());
});

describe('classic feed markup', () => {
  const id = idAt(NOW - 40 * 60_000);
  const doc = loadFixture('classic-feed.html', { __ID1__: id });
  const posts = findPosts(doc);

  it('finds both containers and skips the shell with no id or text', () => {
    expect(posts).toHaveLength(2);
    expect(extractPost(posts[1], NOW)).toBeNull();
  });

  it('reads identity, author, text, age and counts without leaking comment content', () => {
    const p = extractPost(posts[0], NOW)!;
    expect(p.activityId).toBe(id);
    expect(p.url).toBe(`https://www.linkedin.com/feed/update/urn:li:activity:${id}/`);
    expect(p.author).toBe('Priya Raghunath');
    expect(p.authorHeadline).toBe('Head of Product · Fintech');
    expect(p.text).toMatch(/^We ran our planning week/);
    expect(p.postedAt).toBe(NOW - 40 * 60_000);
    expect(p.postedAtSource).toBe('urn');
    expect({ r: p.reactions, c: p.comments, s: p.reposts }).toEqual({ r: 1204, c: 87, s: 12 });
  });
});

describe('server-driven feed markup', () => {
  const id = idAt(NOW - 3 * 3_600_000 - 5 * 60_000);
  const doc = loadFixture('sdui-feed.html', { __ID2__: id });
  const posts = findPosts(doc);

  it('takes the id from the post permalink, not from the comment', () => {
    const p = extractPost(posts[0], NOW)!;
    expect(p.activityId).toBe(id);
    expect(p.author).toBe('Tom Brackley');
    expect(p.text).toMatch(/weekly status meeting/);
    expect(p.reactions).toBe(1200);
    expect(p.comments).toBe(230); // not the 5,000 inside the comment region
  });

  it('falls back to relative age and a componentkey when no URN is present', () => {
    const p = extractPost(posts[1], NOW)!;
    expect(p.activityId).toBeNull();
    expect(p.key).toBe('ck:expandedFeedType_MAIN_FEED_noid');
    expect(p.author).toBe('Grace Halloway');
    expect(p.postedAt).toBe(NOW - 5 * 3_600_000);
    expect(p.postedAtSource).toBe('relative-text');
    expect(p.reactions).toBe(45);
  });

  it('reports zero for counts that are not rendered', () => {
    expect(engagementCounts(posts[1]).comments).toBe(0);
  });
});

describe('sponsored posts', () => {
  const doc = loadFixture('sponsored-feed.html', { __AD1__: idAt(NOW - 86_400_000), __ORG__: idAt(NOW - 2 * 3_600_000) });
  const [classicAd, sduiAd, organic] = findPosts(doc).map((el) => extractPost(el, NOW)!);

  it('detects the Promoted label and advertiser followers in classic markup', () => {
    expect(classicAd.promoted).toBe(true);
    expect(classicAd.author).toBe('Northwind Cloud');
    expect(classicAd.advertiserFollowers).toBe(254_310);
    expect(classicAd.authorHeadline).toBe('');
    expect(classicAd.reactions).toBe(312);
    expect(classicAd.text).toMatch(/^David, your team/);
  });

  it('detects "Promoted by" in server-driven markup', () => {
    expect(sduiAd.promoted).toBe(true);
    expect(sduiAd.advertiserFollowers).toBe(1204);
  });

  it('does not flag organic posts that mention promotion or followers in their text', () => {
    expect(organic.promoted).toBe(false);
    expect(organic.advertiserFollowers).toBeNull();
  });

  it('reads the signed-in member name from the nav', () => {
    expect(viewerName(doc)).toBe('David Ashby');
  });
});
