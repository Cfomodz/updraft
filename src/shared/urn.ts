// LinkedIn post identity. A post is addressed by a URN such as urn:li:activity:7123456789012345678.
// The numeric id is a snowflake: its high 42 bits are milliseconds since the Unix epoch.

export type PostKind = 'activity' | 'ugcPost' | 'share';

export interface PostRef {
  kind: PostKind;
  id: string;
}

const URN_RE = /\b(activity|ugcPost|share)(?::|%3A)(\d{15,22})\b/i;

export function parsePostRef(value: string | null | undefined): PostRef | null {
  if (!value) return null;
  let text = value;
  try {
    text = decodeURIComponent(value);
  } catch {
    // Keep the raw string; a malformed escape must not hide an otherwise readable URN.
  }
  const m = URN_RE.exec(text);
  if (m) return { kind: normaliseKind(m[1]), id: m[2] };
  // Vanity post links: /posts/jane-doe_some-words-activity-7123456789012345678-AbCd
  const vanity = /\/posts\/[^?#]*?-(activity|ugcPost|share)-(\d{15,22})/i.exec(text);
  return vanity ? { kind: normaliseKind(vanity[1]), id: vanity[2] } : null;
}

function normaliseKind(raw: string): PostKind {
  const k = raw.toLowerCase();
  return k === 'ugcpost' ? 'ugcPost' : (k as PostKind);
}

// The id's embedded time is when the id was minted, which matches publish time for normal posts.
// Returns null for ids that do not decode to a plausible date.
export function idToDate(id: string): Date | null {
  if (!/^\d{15,22}$/.test(id)) return null;
  const ms = Number(BigInt(id) >> 22n);
  const earliest = Date.UTC(2010, 0, 1);
  const latest = Date.now() + 24 * 3600_000;
  return ms >= earliest && ms <= latest ? new Date(ms) : null;
}

export function postUrl(ref: PostRef): string {
  return `https://www.linkedin.com/feed/update/urn:li:${ref.kind}:${ref.id}/`;
}
