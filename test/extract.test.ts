import { describe, expect, it } from 'vitest';
import { engagementCounts, extractPost, findPosts, parseCount } from '../src/content/extract';
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
