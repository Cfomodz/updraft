import { describe, expect, it } from 'vitest';
import { buildPrompt, draftComments } from '../src/background/draft';
import { DEFAULT_SETTINGS, type CapturedPost, type Settings } from '../src/shared/types';

const post: CapturedPost = {
  key: '1', activityId: '1', url: null, author: 'Tom "T" <B>', authorHeadline: 'Founder', text: 'We killed our status meeting.',
  postedAt: 0, postedAtSource: 'urn', snapshots: [], firstSeenAt: 0, lastSeenAt: 0,
};
const settings: Settings = { ...DEFAULT_SETTINGS, apiKey: 'sk-ant-test', voice: { about: 'PM at a fintech', samples: 'We tried this too.', rules: 'No emoji' } };

function fakeApi(body: object, status = 200) {
  const calls: Array<{ url: string; body: any; headers: Headers }> = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init.body)), headers: new Headers(init.headers) });
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

function message(text: string, stop_reason = 'end_turn') {
  return {
    id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason, stop_sequence: null,
    content: [{ type: 'text', text }], usage: { input_tokens: 1, output_tokens: 1 },
  };
}

describe('buildPrompt', () => {
  it('fences the untrusted post and escapes attribute values', () => {
    const p = buildPrompt(post, settings, 'ask a question');
    expect(p).toContain('<post author="Tom &#34;T&#34; &#60;B&#62;" headline="Founder">\nWe killed our status meeting.\n</post>');
    expect(p).toContain('<voice_samples>\nWe tried this too.\n</voice_samples>');
    expect(p).toContain('Angle the person wants to take: ask a question');
  });
});

describe('buildPrompt for sponsored posts', () => {
  it('explains name personalisation so drafts do not reply as if greeted', () => {
    const p = buildPrompt({ ...post, author: 'Northwind', promoted: true }, settings, undefined, 'David Ashby');
    expect(p).toMatch(/sponsored ad from Northwind/);
    expect(p).toMatch(/automatic ad personalisation/);
    expect(p).toMatch(/The person's name is David Ashby\./);
    expect(buildPrompt(post, settings)).not.toMatch(/sponsored/);
  });
});

describe('draftComments', () => {
  it('requires an API key without calling the API', async () => {
    const { calls, fetchImpl } = fakeApi(message('{}'));
    const r = await draftComments(post, { ...settings, apiKey: '' }, undefined, fetchImpl);
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/API key/) });
    expect(calls).toHaveLength(0);
  });

  it('sends a structured-output request and returns parsed drafts', async () => {
    const { calls, fetchImpl } = fakeApi(message(JSON.stringify({ drafts: [' One ', 'Two', 'Three'] })));
    const r = await draftComments(post, settings, undefined, fetchImpl);
    expect(r).toEqual({ ok: true, drafts: ['One', 'Two', 'Three'] });
    const req = calls[0];
    expect(req.url).toMatch(/^https:\/\/api\.anthropic\.com\/v1\/messages/);
    expect(req.body.model).toBe('claude-opus-5-5');
    expect(req.body.fallbacks).toBe('default');
    expect(req.body.output_config.effort).toBe('medium');
    expect(req.body.output_config.format.type).toBe('json_schema');
    expect(req.headers.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01');
    expect(req.headers.get('x-api-key')).toBe('sk-ant-test');
  });

  it('reports refusals and auth failures as readable errors', async () => {
    const refused = await draftComments(post, settings, undefined, fakeApi(message('', 'refusal')).fetchImpl);
    expect(refused).toEqual({ ok: false, error: expect.stringMatching(/declined/) });
    const auth = await draftComments(post, settings, undefined,
      fakeApi({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }, 401).fetchImpl);
    expect(auth).toEqual({ ok: false, error: expect.stringMatching(/rejected/) });
  });
});
