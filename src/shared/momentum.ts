import type { CapturedPost, Snapshot } from './types';

// Momentum = how fast a post is collecting engagement, discounted by age and by how crowded the
// comment section already is. The point is to surface posts where an early comment will still be
// near the top when the post peaks.

export type Stage = 'fresh' | 'rising' | 'established' | 'late';

export interface Momentum {
  stage: Stage;
  ageHours: number;
  engagement: number;
  lifetimeRate: number; // weighted engagement per hour since posting
  recentRate: number | null; // per hour between our last two observations, if we have them
  score: number;
  hot: boolean;
}

// Comments and reposts predict reach better than reactions.
export const WEIGHTS = { reactions: 1, comments: 3, reposts: 4 };

// Weighted engagement per hour a post needs in each stage to be called hot.
export const HOT_RATE: Record<Exclude<Stage, 'late'>, number> = {
  fresh: 30, // under 2 h
  rising: 50, // 2-8 h
  established: 80, // 8-36 h
};

const MIN_RECENT_WINDOW_MS = 5 * 60_000;
const MAX_AGE_HOURS = 36;

export function weighted(s: Pick<Snapshot, 'reactions' | 'comments' | 'reposts'>): number {
  return s.reactions * WEIGHTS.reactions + s.comments * WEIGHTS.comments + s.reposts * WEIGHTS.reposts;
}

export function stageFor(ageHours: number): Stage {
  if (ageHours < 2) return 'fresh';
  if (ageHours < 8) return 'rising';
  if (ageHours < MAX_AGE_HOURS) return 'established';
  return 'late';
}

export function recentRate(snapshots: Snapshot[]): number | null {
  if (snapshots.length < 2) return null;
  const last = snapshots[snapshots.length - 1];
  // Use the newest earlier snapshot that is far enough back to give a stable rate.
  for (let i = snapshots.length - 2; i >= 0; i--) {
    const dt = last.at - snapshots[i].at;
    if (dt >= MIN_RECENT_WINDOW_MS) {
      return Math.max(0, weighted(last) - weighted(snapshots[i])) / (dt / 3_600_000);
    }
  }
  return null;
}

export function momentum(post: CapturedPost, now = Date.now()): Momentum | null {
  const latest = post.snapshots[post.snapshots.length - 1];
  if (!latest || post.postedAt == null) return null;
  // Floor at 15 minutes so a minute-old post with 3 reactions does not read as 180/h.
  const ageHours = Math.max((now - post.postedAt) / 3_600_000, 0.25);
  const engagement = weighted(latest);
  const lifetimeRate = engagement / ageHours;
  const recent = recentRate(post.snapshots);
  // Recent observations beat the lifetime average when we have them: a post can stall or take off.
  const rate = recent == null ? lifetimeRate : 0.4 * lifetimeRate + 0.6 * recent;
  const stage = stageFor(ageHours);
  const freshness = Math.exp(-ageHours / 10);
  // A new comment's visibility falls off faster than linearly as the thread fills up; this has to
  // outweigh the comments' own contribution to the rate, or busy threads would always rank first.
  const crowding = 1 / (1 + (latest.comments / 120) ** 1.5);
  const score = stage === 'late' ? 0 : rate * freshness * crowding;
  const hot = stage !== 'late' && rate >= HOT_RATE[stage];
  return { stage, ageHours, engagement, lifetimeRate, recentRate: recent, score, hot };
}

export function rank(posts: CapturedPost[], now = Date.now()) {
  return posts
    .filter((p) => !p.dismissed)
    .map((post) => ({ post, m: momentum(post, now) }))
    .filter((r): r is { post: CapturedPost; m: Momentum } => r.m != null && r.m.stage !== 'late')
    .sort((a, b) => b.m.score - a.m.score);
}
