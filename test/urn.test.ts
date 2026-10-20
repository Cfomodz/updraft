import { describe, expect, it } from 'vitest';
import { idToDate, parsePostRef, postUrl } from '../src/shared/urn';
import { idAt } from './helpers';

describe('parsePostRef', () => {
  const id = '7517792028663480320';
  it.each([
    [`urn:li:activity:${id}`, 'activity'],
    [`https://www.linkedin.com/feed/update/urn:li:ugcPost:${id}/`, 'ugcPost'],
    [`https://www.linkedin.com/feed/update/urn%3Ali%3Ashare%3A${id}`, 'share'],
    [`https://www.linkedin.com/posts/jane_some-words-activity-${id}-AbCd?utm=x`, 'activity'],
  ])('reads %s', (input, kind) => {
    expect(parsePostRef(input)).toEqual({ kind, id });
  });

  it('survives malformed percent-escapes', () => {
    expect(parsePostRef(`%E0%A4%A urn:li:activity:${id}`)).toEqual({ kind: 'activity', id });
  });

  it('rejects strings without a post id', () => {
    expect(parsePostRef('urn:li:aggregate:(abc)')).toBeNull();
    expect(parsePostRef('https://www.linkedin.com/in/jane/')).toBeNull();
    expect(parsePostRef(null)).toBeNull();
  });
});

describe('idToDate', () => {
  it('decodes the snowflake timestamp', () => {
    const t = Date.UTC(2026, 9, 18, 12, 0, 0);
    expect(idToDate(idAt(t))?.getTime()).toBe(t);
  });
  it('rejects implausible ids', () => {
    expect(idToDate('123456789012345')).toBeNull(); // decodes to 1970
    expect(idToDate(idAt(Date.now() + 7 * 86_400_000))).toBeNull(); // future
    expect(idToDate('abc')).toBeNull();
  });
});

it('builds canonical post URLs', () => {
  expect(postUrl({ kind: 'activity', id: '1' })).toBe('https://www.linkedin.com/feed/update/urn:li:activity:1/');
});
