import type { CaptureInput } from '../shared/types';
import { idToDate, parsePostRef, postUrl } from '../shared/urn';

// Reads feed posts out of LinkedIn's rendered DOM. LinkedIn ships two feed markups: the classic
// one (.feed-shared-update-v2 carrying data-urn / data-id) and a server-driven one whose items are
// [role="listitem"] elements keyed by a componentkey attribute and often carry no URN at all.
// Class names churn, so identity and counts come from URNs, links, aria-labels and visible text
// wherever possible, with class selectors only as hints.

export const POST_SELECTOR = [
  '[data-urn*="urn:li:activity:"]',
  '[data-id*="urn:li:activity:"]',
  '[data-urn*="urn:li:ugcPost:"]',
  '.feed-shared-update-v2',
  '[role="listitem"][componentkey*="FeedType_"]',
].join(', ');

// Regions inside a post that belong to comments, not the post itself.
const COMMENT_SCOPE = '.comments-comment-entity, .comments-comments-list, [componentkey*="replaceableComment"], article.comments-comment-item';

export function findPosts(root: ParentNode): Element[] {
  const all = Array.from(root.querySelectorAll(POST_SELECTOR));
  // Keep outermost matches only: classic markup nests a data-urn div inside .feed-shared-update-v2.
  return all.filter((el) => !all.some((other) => other !== el && other.contains(el)));
}

export function extractPost(el: Element, now = Date.now()): CaptureInput | null {
  const ref = findRef(el);
  const author = firstText(el, [
    '.update-components-actor__title span[aria-hidden="true"]',
    '.update-components-actor__name span[aria-hidden="true"]',
    '.update-components-actor__title',
  ]) ?? actorFromLinks(el);
  const text = postText(el);
  if (!ref && !text) return null; // promoted modules, suggestions, empty shells

  let postedAt: number | null = null;
  let postedAtSource: CaptureInput['postedAtSource'] = null;
  const fromId = ref ? idToDate(ref.id) : null;
  if (fromId) {
    postedAt = fromId.getTime();
    postedAtSource = 'urn';
  } else {
    const rel = relativeAge(el);
    if (rel != null) {
      postedAt = now - rel;
      postedAtSource = 'relative-text';
    }
  }

  const counts = engagementCounts(el);
  const promoted = isPromoted(el);
  const headline = firstText(el, ['.update-components-actor__description span[aria-hidden="true"]', '.update-components-actor__description']) ?? '';
  return {
    key: ref ? ref.id : fallbackKey(el, author, text),
    activityId: ref ? ref.id : null,
    url: ref ? postUrl(ref) : null,
    author: author ?? '',
    // On company posts and ads this slot holds "254,310 followers", which is not a headline.
    authorHeadline: FOLLOWERS_RE.test(headline) ? '' : headline,
    text,
    postedAt,
    postedAtSource,
    ...counts,
    promoted,
    advertiserFollowers: promoted ? followerCount(el) : null,
    observedAt: now,
  };
}

function findRef(el: Element) {
  for (const attr of ['data-urn', 'data-id', 'data-activity-urn']) {
    const ref = parsePostRef(el.getAttribute(attr));
    if (ref) return ref;
    const inner = el.querySelector(`[${attr}*="urn:li:activity:"], [${attr}*="urn:li:ugcPost:"]`);
    if (inner && !inner.closest(COMMENT_SCOPE)) {
      const r = parsePostRef(inner.getAttribute(attr));
      if (r) return r;
    }
  }
  // Server-driven markup: the post's own permalink (timestamp link, share menu) carries the URN.
  for (const a of Array.from(el.querySelectorAll<HTMLAnchorElement>('a[href*="activity"], a[href*="ugcPost"], a[href*="/posts/"]'))) {
    if (a.closest(COMMENT_SCOPE)) continue;
    const href = a.getAttribute('href') ?? '';
    if (/commentUrn|replyUrn/.test(href)) continue;
    const ref = parsePostRef(href);
    if (ref) return ref;
  }
  return null;
}

function postText(el: Element): string {
  const raw = firstText(el, [
    '[componentkey^="feed-commentary_"]',
    '.update-components-text',
    '.feed-shared-inline-show-more-text',
    '.feed-shared-update-v2__description',
  ]);
  return (raw ?? '').replace(/…\s*(see )?more$/i, '').trim().slice(0, 3000);
}

function firstText(el: Element, selectors: string[]): string | null {
  for (const sel of selectors) {
    for (const node of Array.from(el.querySelectorAll(sel))) {
      if (node.closest(COMMENT_SCOPE)) continue;
      const t = clean(node.textContent);
      if (t) return t;
    }
  }
  return null;
}

function actorFromLinks(el: Element): string | null {
  for (const a of Array.from(el.querySelectorAll('a[href*="/in/"], a[href*="/company/"]'))) {
    if (a.closest(COMMENT_SCOPE)) continue;
    const label = clean(a.getAttribute('aria-label')) || clean(a.textContent);
    if (label && label.length < 120) return label.replace(/^View:?\s*/i, '').replace(/[’']s\s+profile.*$/i, '').split('\n')[0].trim();
  }
  return null;
}

function clean(s: string | null | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

// "1,234" "1.2K" "3M" "12 345" -> number. Returns null when the string has no count.
export function parseCount(s: string): number | null {
  const m = /(\d[\d.,   ]*)\s*([KkMm])?/.exec(s);
  if (!m) return null;
  const digits = m[1].replace(/[\s  ]/g, '');
  let n: number;
  if (m[2]) {
    n = parseFloat(digits.replace(',', '.')) * (m[2].toLowerCase() === 'k' ? 1_000 : 1_000_000);
  } else {
    n = parseInt(digits.replace(/[.,]/g, ''), 10);
  }
  return Number.isFinite(n) ? Math.round(n) : null;
}

const COUNT_PATTERNS: Array<[keyof Counts, RegExp]> = [
  ['comments', /(\d[\d.,   ]*[KkMm]?)\s+comments?\b/i],
  ['reposts', /(\d[\d.,   ]*[KkMm]?)\s+reposts?\b/i],
  ['reactions', /(\d[\d.,   ]*[KkMm]?)\s+(?:reactions?|likes?)\b/i],
];

interface Counts {
  reactions: number;
  comments: number;
  reposts: number;
}

export function engagementCounts(el: Element): Counts {
  const counts: Counts = { reactions: 0, comments: 0, reposts: 0 };
  // aria-labels are the most stable carrier ("1,204 reactions", "87 comments"); visible text next.
  const sources: string[] = [];
  for (const node of Array.from(el.querySelectorAll('[aria-label]'))) {
    if (!node.closest(COMMENT_SCOPE)) sources.push(node.getAttribute('aria-label') ?? '');
  }
  for (const node of Array.from(el.querySelectorAll('.social-details-social-counts, .social-details-social-counts *, button, span, a'))) {
    if (node.children.length === 0 && !node.closest(COMMENT_SCOPE)) sources.push(clean(node.textContent));
  }
  for (const [field, re] of COUNT_PATTERNS) {
    for (const s of sources) {
      const m = re.exec(s);
      const n = m ? parseCount(m[1]) : null;
      if (n != null) {
        counts[field] = Math.max(counts[field], n);
        break;
      }
    }
  }
  if (counts.reactions === 0) {
    // Classic markup shows the reaction total as a bare number next to the reaction icons.
    const bare = firstText(el, ['.social-details-social-counts__reactions-count', '.social-details-social-counts__social-proof-fallback-number']);
    const n = bare ? parseCount(bare) : null;
    if (n != null) counts.reactions = n;
  }
  return counts;
}

// Ads carry a short "Promoted" (or "Sponsored", "Promoted by X") label where organic posts show
// their age. Only short leaf text counts, so a post that merely talks about promotions does not.
export function isPromoted(el: Element): boolean {
  for (const node of Array.from(el.querySelectorAll('span, p, a, div'))) {
    if (node.children.length > 1 || node.closest(COMMENT_SCOPE)) continue;
    const t = clean(node.textContent);
    if (t.length <= 60 && /^(Promoted|Sponsored)(\s+by\b.*)?$/i.test(t)) return true;
  }
  return false;
}

const FOLLOWERS_RE = /^(\d[\d.,\u00a0\u202f ]*[KkMm]?)\s+followers$/i;

// "54,321 followers" under the advertiser's name. Short leaf text only, to skip post copy.
export function followerCount(el: Element): number | null {
  for (const node of Array.from(el.querySelectorAll('span, p, div'))) {
    if (node.children.length > 1 || node.closest(COMMENT_SCOPE)) continue;
    const m = FOLLOWERS_RE.exec(clean(node.textContent));
    if (m) return parseCount(m[1]);
  }
  return null;
}

// The signed-in member's name, from the "Me" avatar in the global nav.
export function viewerName(doc: Document): string | null {
  const img = doc.querySelector<HTMLImageElement>('img.global-nav__me-photo[alt], .global-nav__me img[alt]');
  const name = clean(img?.getAttribute('alt')).replace(/^Photo of\s+/i, '');
  return name && name.length < 80 ? name : null;
}

const UNIT_MS: Record<string, number> = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 7 * 86_400_000, mo: 30 * 86_400_000, y: 365 * 86_400_000 };

// The actor sub-description reads like "3h • Edited • 🌐" or "Promoted". Returns age in ms.
export function relativeAge(el: Element): number | null {
  const candidates = [
    ...Array.from(el.querySelectorAll('.update-components-actor__sub-description, time')),
    ...Array.from(el.querySelectorAll('span[aria-hidden="true"], p, span')),
  ];
  for (const node of candidates) {
    if (node.closest(COMMENT_SCOPE)) continue;
    const t = clean(node.textContent);
    if (t.length > 40) continue;
    const m = /^(\d{1,3})\s?(mo|[smhdwy])\b/.exec(t);
    if (m) return parseInt(m[1], 10) * UNIT_MS[m[2]];
  }
  return null;
}

function fallbackKey(el: Element, author: string | null, text: string): string {
  const ck = el.getAttribute('componentkey');
  if (ck) return `ck:${ck}`;
  // Last resort: a content hash, so the same post seen twice in one session merges.
  let h = 0;
  for (const ch of `${author ?? ''}|${text.slice(0, 200)}`) h = (Math.imul(31, h) + ch.charCodeAt(0)) | 0;
  return `txt:${(h >>> 0).toString(36)}`;
}
