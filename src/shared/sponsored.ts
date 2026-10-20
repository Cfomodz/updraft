import type { CapturedPost, FundingThresholds } from './types';

export interface SponsoredFilters {
  wellFundedOnly: boolean;
  namesMeOnly: boolean;
}

export interface SponsoredRow {
  post: CapturedPost;
  wellFunded: boolean;
  namesYou: boolean;
}

export function isWellFunded(post: CapturedPost, t: FundingThresholds): boolean {
  const s = post.snapshots[post.snapshots.length - 1];
  const engagement = s ? s.reactions + s.comments + s.reposts : 0;
  return (post.advertiserFollowers ?? 0) >= t.minFollowers || engagement >= t.minEngagement || (post.sightings ?? 1) >= t.minSightings;
}

// Personalised ads insert the member's name into the copy ("David, still scaling your team?").
// Matches the full name or the first name as a whole word; names under 2 letters never match.
export function namesViewer(text: string, fullName: string): boolean {
  const full = fullName.trim();
  const first = full.split(/\s+/)[0] ?? '';
  return [full, first].some((name) => {
    if (name.length < 2) return false;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'iu').test(text);
  });
}

// All sponsored posts not yet commented on or hidden, newest first. Newest = when the ad first
// reached you. Most ads hide their age, and mixing posting time for some with first-seen time for
// others would push every undated ad above every dated one.
export function sponsoredView(posts: CapturedPost[], filters: SponsoredFilters, thresholds: FundingThresholds, yourName: string): SponsoredRow[] {
  return posts
    .filter((p) => p.promoted && !p.commentedAt && !p.dismissed)
    .map((post) => ({ post, wellFunded: isWellFunded(post, thresholds), namesYou: namesViewer(post.text, yourName) }))
    .filter((r) => (!filters.wellFundedOnly || r.wellFunded) && (!filters.namesMeOnly || r.namesYou))
    .sort((a, b) => b.post.firstSeenAt - a.post.firstSeenAt);
}
